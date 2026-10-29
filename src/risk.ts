import { isSafetyOrConstraint, looksLikeInstruction } from "./analyze.js";
import type { PromptStats, PromptSummary, RiskFactor, RiskLevel, RiskResult, StructureProfile } from "./types.js";

export function riskLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

export function scoreRisk(input: {
  oldText: string;
  newText: string;
  oldStats: PromptStats;
  newStats: PromptStats;
  summary: PromptSummary;
  oldStructure: StructureProfile;
  newStructure: StructureProfile;
}): RiskResult {
  if (input.oldText === input.newText) {
    return { score: 0, level: "low", factors: [] };
  }

  const factors: RiskFactor[] = [];
  const { oldStats, newStats, summary, oldStructure, newStructure } = input;

  const percent =
    oldStats.chars === 0 ? (newStats.chars === 0 ? 0 : 100) : ((newStats.chars - oldStats.chars) / oldStats.chars) * 100;
  const absPct = Math.abs(percent);
  if (absPct >= 5) {
    const impact = Math.min(25, Math.round(absPct * 0.5));
    factors.push({
      id: "length",
      impact,
      detail:
        percent >= 0
          ? `Prompt grew ${absPct.toFixed(1)}% by characters`
          : `Prompt shrank ${absPct.toFixed(1)}% by characters`,
    });
  }

  let struct = 0;
  const structDetails: string[] = [];
  if (!sameSet(oldStructure.roleTags, newStructure.roleTags)) {
    struct += 12;
    structDetails.push("role tags changed");
  }
  if (oldStructure.jsonSchema !== newStructure.jsonSchema) {
    struct += 10;
    structDetails.push(newStructure.jsonSchema ? "JSON schema added" : "JSON schema removed");
  }
  if (oldStructure.tools !== newStructure.tools) {
    struct += 12;
    structDetails.push(newStructure.tools ? "tool list added" : "tool list removed");
  } else if (!sameSet(oldStructure.toolNames, newStructure.toolNames)) {
    struct += 8;
    structDetails.push("tool names changed");
  }
  if (!sameSet(oldStructure.xmlTags, newStructure.xmlTags)) {
    struct += 8;
    structDetails.push("XML/section tags changed");
  }
  if (!sameSet(oldStructure.headings, newStructure.headings) && (oldStructure.headings.length > 0 || newStructure.headings.length > 0)) {
    struct += 4;
    structDetails.push("section headings changed");
  }
  struct = Math.min(25, struct);
  if (struct > 0) {
    factors.push({ id: "structure", impact: struct, detail: structDetails.join("; ") });
  }

  const removedSafety = summary.removed.filter(isSafetyOrConstraint);
  const safetyDrop = Math.max(
    0,
    oldStructure.safetyLines + oldStructure.constraintLines - (newStructure.safetyLines + newStructure.constraintLines),
  );
  const safetyN = Math.max(removedSafety.length, safetyDrop);
  if (safetyN > 0) {
    const impact = Math.min(30, 12 + (safetyN - 1) * 8);
    factors.push({
      id: "safety_deletion",
      impact,
      detail:
        safetyN === 1
          ? "A constraint/safety line was removed"
          : `${safetyN} constraint/safety lines were removed`,
    });
  }

  const addedInstr = summary.added.filter(looksLikeInstruction);
  if (addedInstr.length > 0) {
    const impact = Math.min(20, 5 + (addedInstr.length - 1) * 3);
    factors.push({
      id: "new_instructions",
      impact,
      detail:
        addedInstr.length === 1
          ? "A new instruction was added"
          : `${addedInstr.length} new instructions were added`,
    });
  }

  if (summary.reworded.length >= 3) {
    const impact = Math.min(10, summary.reworded.length * 2);
    factors.push({
      id: "reword",
      impact,
      detail: `${summary.reworded.length} lines were reworded (possible intent drift)`,
    });
  }

  const score = Math.min(100, factors.reduce((sum, f) => sum + f.impact, 0));
  return { score, level: riskLevel(score), factors };
}
