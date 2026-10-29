export function normalizeLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function splitPromptLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function wordTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 1 : inter / union;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  if (m > 400 || n > 400) {
    const approx = 1 - jaccard(wordTokens(a), wordTokens(b));
    return Math.round(Math.max(m, n) * approx);
  }

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = new Array(n + 1);
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const deletion = (prev[j] ?? 0) + 1;
      const insertion = (cur[j - 1] ?? 0) + 1;
      const substitution = (prev[j - 1] ?? 0) + cost;
      cur[j] = Math.min(deletion, insertion, substitution);
    }
    prev = cur;
  }
  return prev[n] ?? Math.max(m, n);
}

/** Combined word-Jaccard + normalized Levenshtein similarity in [0, 1]. */
export function similarity(a: string, b: string): number {
  const na = normalizeLine(a);
  const nb = normalizeLine(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const jac = jaccard(wordTokens(na), wordTokens(nb));
  const maxLen = Math.max(na.length, nb.length);
  const lev = 1 - levenshtein(na.toLowerCase(), nb.toLowerCase()) / maxLen;
  return 0.55 * jac + 0.45 * lev;
}

export function truncate(s: string, max = 140): string {
  const one = normalizeLine(s);
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

export type LineKind = "equal" | "reworded";

export interface LineMatch {
  oldIndex: number;
  newIndex: number;
  similarity: number;
  kind: LineKind;
}

export interface LineAlignment {
  matches: LineMatch[];
  unmatchedOld: number[];
  unmatchedNew: number[];
}

const REWORD_MIN = 0.45;

export function alignLines(oldLines: string[], newLines: string[]): LineAlignment {
  const usedNew = new Set<number>();
  const usedOld = new Set<number>();
  const matches: LineMatch[] = [];

  const newByNorm = new Map<string, number[]>();
  for (let j = 0; j < newLines.length; j++) {
    const key = normalizeLine(newLines[j] ?? "").toLowerCase();
    if (!key) continue;
    const bucket = newByNorm.get(key) ?? [];
    bucket.push(j);
    newByNorm.set(key, bucket);
  }

  for (let i = 0; i < oldLines.length; i++) {
    const key = normalizeLine(oldLines[i] ?? "").toLowerCase();
    if (!key) continue;
    const bucket = newByNorm.get(key);
    const j = bucket?.shift();
    if (j === undefined) continue;
    usedOld.add(i);
    usedNew.add(j);
    matches.push({ oldIndex: i, newIndex: j, similarity: 1, kind: "equal" });
  }

  for (let i = 0; i < oldLines.length; i++) {
    if (usedOld.has(i)) continue;
    const oldLine = oldLines[i] ?? "";
    if (!normalizeLine(oldLine)) continue;

    let best = -1;
    let bestSim = 0;
    for (let j = 0; j < newLines.length; j++) {
      if (usedNew.has(j)) continue;
      const newLine = newLines[j] ?? "";
      if (!normalizeLine(newLine)) continue;
      const sim = similarity(oldLine, newLine);
      if (sim > bestSim) {
        bestSim = sim;
        best = j;
      }
    }

    if (best >= 0 && bestSim >= REWORD_MIN) {
      usedOld.add(i);
      usedNew.add(best);
      matches.push({
        oldIndex: i,
        newIndex: best,
        similarity: bestSim,
        kind: "reworded",
      });
    }
  }

  // Pair leftover labeled lines ("Tone: …") even when the wording drifted far.
  const newByLabel = new Map<string, number[]>();
  for (let j = 0; j < newLines.length; j++) {
    if (usedNew.has(j)) continue;
    const label = lineLabel(newLines[j] ?? "");
    if (!label) continue;
    const bucket = newByLabel.get(label) ?? [];
    bucket.push(j);
    newByLabel.set(label, bucket);
  }
  for (let i = 0; i < oldLines.length; i++) {
    if (usedOld.has(i)) continue;
    const label = lineLabel(oldLines[i] ?? "");
    if (!label) continue;
    const bucket = newByLabel.get(label);
    const j = bucket?.shift();
    if (j === undefined) continue;
    usedOld.add(i);
    usedNew.add(j);
    matches.push({
      oldIndex: i,
      newIndex: j,
      similarity: similarity(oldLines[i] ?? "", newLines[j] ?? ""),
      kind: "reworded",
    });
  }

  const unmatchedOld: number[] = [];
  const unmatchedNew: number[] = [];
  for (let i = 0; i < oldLines.length; i++) {
    if (!usedOld.has(i) && normalizeLine(oldLines[i] ?? "")) unmatchedOld.push(i);
  }
  for (let j = 0; j < newLines.length; j++) {
    if (!usedNew.has(j) && normalizeLine(newLines[j] ?? "")) unmatchedNew.push(j);
  }

  return { matches, unmatchedOld, unmatchedNew };
}

function lineLabel(s: string): string | undefined {
  const match = /^([A-Za-z][A-Za-z0-9 _-]{0,24}):\s+\S/.exec(normalizeLine(s));
  return match?.[1]?.toLowerCase();
}
