import { analyzeStructure, deltaStats, measure } from "./analyze.js";
import { buildUnifiedPatch } from "./patch.js";
import { scoreRisk } from "./risk.js";
import { buildSummary } from "./summary.js";
import { alignLines, splitPromptLines } from "./text.js";
import type { DiffPromptsOptions, PromptDiffResult } from "./types.js";

export function diffPrompts(
  oldText: string,
  newText: string,
  options: DiffPromptsOptions = {},
): PromptDiffResult {
  const oldStats = measure(oldText);
  const newStats = measure(newText);
  const oldStructure = analyzeStructure(oldText);
  const newStructure = analyzeStructure(newText);
  const alignment = alignLines(splitPromptLines(oldText), splitPromptLines(newText));
  const summary = buildSummary(oldText, newText, alignment);
  const risk = scoreRisk({
    oldText,
    newText,
    oldStats,
    newStats,
    summary,
    oldStructure,
    newStructure,
  });

  return {
    identical: oldText === newText,
    stats: {
      old: oldStats,
      new: newStats,
      delta: deltaStats(oldStats, newStats),
    },
    structure: { old: oldStructure, new: newStructure },
    risk,
    summary,
    diff: {
      unified: buildUnifiedPatch(oldText, newText, {
        oldLabel: options.oldLabel ?? "old",
        newLabel: options.newLabel ?? "new",
        context: options.context ?? 3,
      }),
    },
  };
}
