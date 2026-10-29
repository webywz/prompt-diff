import { buildSplitRows } from "./patch.js";
import { packageVersion } from "./version.js";
import type { JsonPayload, PromptDiffResult, RiskLevel } from "./types.js";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
} as const;

export interface FormatOptions {
  color: boolean;
  tokens: boolean;
  format: "unified" | "split";
  oldLabel: string;
  newLabel: string;
  columns?: number;
  semanticRisk?: string;
}

function paint(color: boolean, code: string, text: string): string {
  if (!color) return text;
  return `${code}${text}${ANSI.reset}`;
}

function sign(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function levelColor(level: RiskLevel): string {
  switch (level) {
    case "low":
      return ANSI.green;
    case "medium":
      return ANSI.yellow;
    case "high":
      return ANSI.red;
    case "critical":
      return ANSI.magenta;
  }
}

function meter(score: number, color: boolean): string {
  const width = 20;
  const filled = Math.round((score / 100) * width);
  const bar = `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
  return paint(color, ANSI.dim, bar);
}

function formatUnified(unified: string, color: boolean): string {
  if (!unified.trim()) return paint(color, ANSI.dim, "  (no textual diff)");
  return unified
    .split("\n")
    .map((line) => {
      const colored =
        line.startsWith("+++") || line.startsWith("---")
          ? paint(color, ANSI.dim, line)
          : line.startsWith("@@")
            ? paint(color, ANSI.cyan, line)
            : line.startsWith("+")
              ? paint(color, ANSI.green, line)
              : line.startsWith("-")
                ? paint(color, ANSI.red, line)
                : line;
      return `  ${colored}`;
    })
    .join("\n");
}

function pad(s: string, width: number): string {
  const visible = s.length;
  if (visible >= width) return `${s.slice(0, Math.max(0, width - 1))}…`;
  return s + " ".repeat(width - visible);
}

function formatSplit(oldText: string, newText: string, color: boolean, columns: number): string {
  const rows = buildSplitRows(oldText, newText);
  const gutter = 3;
  const col = Math.max(24, Math.floor((columns - gutter) / 2));
  const header = `${pad("OLD", col)} │ ${pad("NEW", col)}`;
  const lines = [paint(color, ANSI.dim, header), paint(color, ANSI.dim, `${"─".repeat(col)}─┼─${"─".repeat(col)}`)];
  for (const row of rows) {
    const leftRaw = row.left.replace(/\t/g, "  ");
    const rightRaw = row.right.replace(/\t/g, "  ");
    let left = pad(leftRaw, col);
    let right = pad(rightRaw, col);
    if (row.kind === "del") left = paint(color, ANSI.red, left);
    else if (row.kind === "add") right = paint(color, ANSI.green, right);
    else if (row.kind === "change") {
      left = paint(color, ANSI.red, left);
      right = paint(color, ANSI.green, right);
    }
    lines.push(`${left} │ ${right}`);
  }
  return lines.join("\n");
}

export function formatHuman(
  result: PromptDiffResult,
  oldText: string,
  newText: string,
  options: FormatOptions,
): string {
  const c = options.color;
  const { stats, risk, summary } = result;
  const out: string[] = [];

  out.push(paint(c, ANSI.bold, `prompt-diff  v${packageVersion()}`));
  out.push("");

  const token = (n: number): string => (options.tokens ? `   ${n} tok` : "");
  out.push(
    `  ${paint(c, ANSI.dim, "old")}  ${options.oldLabel}   ${stats.old.chars} chars   ${stats.old.words} words   ${stats.old.lines} lines${token(stats.old.tokens)}`,
  );
  out.push(
    `  ${paint(c, ANSI.dim, "new")}  ${options.newLabel}   ${stats.new.chars} chars   ${stats.new.words} words   ${stats.new.lines} lines${token(stats.new.tokens)}`,
  );
  const pct = `${stats.delta.percent >= 0 ? "+" : ""}${stats.delta.percent.toFixed(1)}%`;
  const tokenDelta = options.tokens ? `  ${sign(stats.delta.tokens)} tok` : "";
  out.push(
    `  ${paint(c, ANSI.dim, "Δ")}    ${sign(stats.delta.chars)} chars (${pct})  ${sign(stats.delta.words)} words  ${sign(stats.delta.lines)} lines${tokenDelta}`,
  );
  out.push("");

  const level = paint(c, levelColor(risk.level), risk.level);
  out.push(`  ${paint(c, ANSI.bold, "Risk")}  ${meter(risk.score, c)}  ${paint(c, ANSI.bold, String(risk.score))}/100  ${level}`);
  if (risk.factors.length === 0) {
    out.push(`    ${paint(c, ANSI.dim, result.identical ? "prompts are identical" : "only trivial wording / whitespace")}`);
  } else {
    for (const factor of risk.factors) {
      out.push(`    ${paint(c, ANSI.dim, "•")} ${factor.detail} ${paint(c, ANSI.dim, `(+${factor.impact})`)}`);
    }
  }
  out.push("");

  out.push(paint(c, ANSI.bold, "  Summary"));
  const section = (title: string, color: string, items: string[]): void => {
    out.push(`    ${paint(c, color, title)}`);
    if (items.length === 0) {
      out.push(`      ${paint(c, ANSI.dim, "—")}`);
      return;
    }
    for (const item of items) out.push(`      • ${item}`);
  };
  section("Added", ANSI.green, summary.added);
  section("Removed", ANSI.red, summary.removed);
  out.push(`    ${paint(c, ANSI.yellow, "Reworded")}`);
  if (summary.reworded.length === 0) {
    out.push(`      ${paint(c, ANSI.dim, "—")}`);
  } else {
    for (const item of summary.reworded) {
      out.push(`      • ${paint(c, ANSI.red, item.from)}`);
      out.push(`        ${paint(c, ANSI.dim, "→")} ${paint(c, ANSI.green, item.to)}`);
    }
  }

  if (options.semanticRisk) {
    out.push("");
    out.push(paint(c, ANSI.bold, "  Semantic risk"));
    out.push(`    ${options.semanticRisk}`);
  }

  out.push("");
  out.push(paint(c, ANSI.bold, "  Diff"));
  if (options.format === "split") {
    out.push(formatSplit(oldText, newText, c, options.columns ?? 80));
  } else {
    out.push(formatUnified(result.diff.unified, c));
  }

  return out.join("\n") + "\n";
}

export function formatJson(
  result: PromptDiffResult,
  files: { old: string; new: string },
  semanticRisk: string | null = null,
): JsonPayload {
  return {
    version: packageVersion(),
    identical: result.identical,
    files,
    stats: result.stats,
    risk: result.risk,
    summary: result.summary,
    diff: result.diff,
    semanticRisk,
  };
}

export function shouldColor(opts: { noColor: boolean; json: boolean; stdoutIsTTY: boolean }): boolean {
  if (opts.json || opts.noColor) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "0") return false;
  return opts.stdoutIsTTY || process.env.FORCE_COLOR === "1";
}
