export type Locale = "en" | "zh";

export interface LocaleStrings {
  // Header
  version: string;
  
  // Labels
  old: string;
  new: string;
  delta: string;
  chars: string;
  words: string;
  lines: string;
  tok: string;
  
  // Risk section
  risk: string;
  
  // Risk level messages
  identical: string;
  trivialChange: string;
  
  // Summary section
  summary: string;
  added: string;
  removed: string;
  reworded: string;
  noneMarker: string;
  
  // Semantic risk section
  semanticRisk: string;
  
  // Diff section
  diff: string;
  noDiff: string;
}

const EN_STRINGS: LocaleStrings = {
  version: "prompt-diff  v",
  
  old: "old",
  new: "new",
  delta: "Δ",
  chars: "chars",
  words: "words",
  lines: "lines",
  tok: "tok",
  
  risk: "Risk",
  
  identical: "prompts are identical",
  trivialChange: "only trivial wording / whitespace",
  
  summary: "Summary",
  added: "Added",
  removed: "Removed",
  reworded: "Reworded",
  noneMarker: "—",
  
  semanticRisk: "Semantic risk",
  
  diff: "Diff",
  noDiff: "(no textual diff)",
};

const ZH_STRINGS: LocaleStrings = {
  version: "prompt-diff  v",
  
  old: "旧版",
  new: "新版",
  delta: "变化",
  chars: "字符",
  words: "词",
  lines: "行",
  tok: "tok",
  
  risk: "风险",
  
  identical: "提示词完全相同",
  trivialChange: "仅措辞或空白符微调",
  
  summary: "摘要",
  added: "新增",
  removed: "删除",
  reworded: "改写",
  noneMarker: "—",
  
  semanticRisk: "语义风险",
  
  diff: "差异",
  noDiff: "（无文本差异）",
};

export function getLocaleStrings(locale: Locale): LocaleStrings {
  switch (locale) {
    case "zh":
      return ZH_STRINGS;
    case "en":
    default:
      return EN_STRINGS;
  }
}
