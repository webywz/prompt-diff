import { createTwoFilesPatch, diffLines } from "diff";

export function buildUnifiedPatch(
  oldText: string,
  newText: string,
  labels: { oldLabel: string; newLabel: string; context: number },
): string {
  if (oldText === newText) return "";
  const patch = createTwoFilesPatch(
    labels.oldLabel,
    labels.newLabel,
    oldText,
    newText,
    undefined,
    undefined,
    { context: labels.context },
  );
  return patch
    .replace(/^Index:.*\n/, "")
    .replace(/^=+\n/, "")
    .replace(/\n$/, "");
}

export interface SplitRow {
  left: string;
  right: string;
  kind: "same" | "del" | "add" | "change";
}

export function buildSplitRows(oldText: string, newText: string): SplitRow[] {
  const parts = diffLines(oldText, newText);
  const rows: SplitRow[] = [];
  let pendingRemoved: string[] = [];

  const flushRemoved = (): void => {
    for (const line of pendingRemoved) {
      rows.push({ left: line, right: "", kind: "del" });
    }
    pendingRemoved = [];
  };

  for (const part of parts) {
    const lines = part.value.split("\n");
    if (lines.at(-1) === "") lines.pop();

    if (part.removed) {
      pendingRemoved = lines;
      continue;
    }

    if (part.added) {
      const n = Math.max(pendingRemoved.length, lines.length);
      for (let i = 0; i < n; i++) {
        const left = pendingRemoved[i];
        const right = lines[i];
        if (left !== undefined && right !== undefined) {
          rows.push({ left, right, kind: "change" });
        } else if (left !== undefined) {
          rows.push({ left, right: "", kind: "del" });
        } else if (right !== undefined) {
          rows.push({ left: "", right, kind: "add" });
        }
      }
      pendingRemoved = [];
      continue;
    }

    flushRemoved();
    for (const line of lines) {
      rows.push({ left: line, right: line, kind: "same" });
    }
  }

  flushRemoved();
  return rows;
}
