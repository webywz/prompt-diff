export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PromptStats {
  chars: number;
  words: number;
  lines: number;
  tokens: number;
}

export interface StatsDelta {
  chars: number;
  words: number;
  lines: number;
  tokens: number;
  /** Character-length change vs the old prompt. 100 if old is empty and new is not. */
  percent: number;
}

export interface RiskFactor {
  id: "length" | "structure" | "safety_deletion" | "new_instructions" | "reword";
  impact: number;
  detail: string;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
}

export interface RewordedLine {
  from: string;
  to: string;
  similarity: number;
}

export interface PromptSummary {
  added: string[];
  removed: string[];
  reworded: RewordedLine[];
}

export interface StructureProfile {
  roleTags: string[];
  jsonSchema: boolean;
  tools: boolean;
  toolNames: string[];
  xmlTags: string[];
  headings: string[];
  safetyLines: number;
  constraintLines: number;
}

export interface PromptDiffResult {
  identical: boolean;
  stats: {
    old: PromptStats;
    new: PromptStats;
    delta: StatsDelta;
  };
  structure: {
    old: StructureProfile;
    new: StructureProfile;
  };
  risk: RiskResult;
  summary: PromptSummary;
  diff: {
    unified: string;
  };
}

export interface DiffPromptsOptions {
  /** Unified-diff context lines. Default 3. */
  context?: number;
  /** Labels used in the unified diff headers. */
  oldLabel?: string;
  newLabel?: string;
}

export interface JsonPayload {
  version: string;
  identical: boolean;
  files: { old: string; new: string };
  stats: PromptDiffResult["stats"];
  risk: RiskResult;
  summary: PromptSummary;
  diff: { unified: string };
  semanticRisk: string | null;
}
