import { looksLikeInstruction } from "./analyze.js";
import { splitPromptLines, truncate, type LineAlignment } from "./text.js";
import type { PromptSummary } from "./types.js";

const MAX_BULLETS = 12;

function clipList(items: string[]): string[] {
  if (items.length <= MAX_BULLETS) return items;
  const extra = items.length - (MAX_BULLETS - 1);
  return [...items.slice(0, MAX_BULLETS - 1), `…and ${extra} more`];
}

export function buildSummary(
  oldText: string,
  newText: string,
  alignment: LineAlignment,
): PromptSummary {
  const oldLines = splitPromptLines(oldText);
  const newLines = splitPromptLines(newText);

  const added = alignment.unmatchedNew
    .map((i) => truncate(newLines[i] ?? ""))
    .filter(Boolean);
  const removed = alignment.unmatchedOld
    .map((i) => truncate(oldLines[i] ?? ""))
    .filter(Boolean);
  const reworded = alignment.matches
    .filter((m) => m.kind === "reworded")
    .map((m) => ({
      from: truncate(oldLines[m.oldIndex] ?? ""),
      to: truncate(newLines[m.newIndex] ?? ""),
      similarity: Math.round(m.similarity * 100) / 100,
    }))
    .filter((m) => m.from && m.to && m.from !== m.to);

  // Prefer instruction-like bullets first so the human summary reads as intent.
  const rank = (s: string): number => (looksLikeInstruction(s) ? 0 : 1);
  added.sort((a, b) => rank(a) - rank(b));
  removed.sort((a, b) => rank(a) - rank(b));

  return {
    added: clipList(added),
    removed: clipList(removed),
    reworded: reworded.slice(0, MAX_BULLETS),
  };
}
