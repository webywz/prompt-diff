import { estimateTokens } from "./tokenize.js";
import { normalizeLine, splitPromptLines } from "./text.js";
import type { PromptStats, StatsDelta, StructureProfile } from "./types.js";

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function measure(text: string): PromptStats {
  const lines = text.length === 0 ? 0 : splitPromptLines(text).length;
  return {
    chars: text.length,
    words: countWords(text),
    lines,
    tokens: estimateTokens(text),
  };
}

export function deltaStats(oldStats: PromptStats, newStats: PromptStats): StatsDelta {
  const chars = newStats.chars - oldStats.chars;
  const rawPercent =
    oldStats.chars === 0 ? (newStats.chars === 0 ? 0 : 100) : (chars / oldStats.chars) * 100;
  return {
    chars,
    words: newStats.words - oldStats.words,
    lines: newStats.lines - oldStats.lines,
    tokens: newStats.tokens - oldStats.tokens,
    percent: Math.round(rawPercent * 10) / 10,
  };
}

const ROLE_TAG_RE =
  /<\s*\/?\s*(system|user|assistant|developer|instructions?|constraints?)\s*>|^\s*(?:\[\s*)?(system|user|assistant|developer)\s*(?:\]\s*)?:/gim;

const JSON_SCHEMA_RE =
  /"\$schema"\s*:|"type"\s*:\s*"(object|array|string|number|boolean|integer)"|"properties"\s*:\s*\{|json\s*schema/i;

const TOOLS_RE =
  /\b(available tools?|tool_choice|function calling|tools?\s*:)\b|"tools"\s*:\s*\[/i;

const TOOL_NAME_RE =
  /^\s*[-*]\s*`?([A-Za-z_][\w]*)`?\s*(?:\(|:)/gm;

const XML_TAG_RE = /<\/?([A-Za-z][\w:-]*)\b[^>]*>/g;

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

export const SAFETY_RE =
  /\b(do not|don't|never|must not|shall not|refuse|disallow|not allowed|content policy|jailbreak|system (prompt|instructions?)|hidden instructions?|safety|harmful|illegal|weapon|exploit|pii|personally identifiable)\b/i;

export const CONSTRAINT_RE =
  /\b(always|must|required|never|only|do not|don't|shall not|constraint|ground rules?|you will not|stay within)\b/i;

export function isSafetyLine(line: string): boolean {
  return SAFETY_RE.test(line);
}

export function isConstraintLine(line: string): boolean {
  return CONSTRAINT_RE.test(line);
}

export function isSafetyOrConstraint(line: string): boolean {
  return isSafetyLine(line) || isConstraintLine(line);
}

export function looksLikeInstruction(line: string): boolean {
  const t = line.trim().replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "");
  if (!t) return false;
  return /^(you (must|should|will|are|can|cannot|may)|always |never |do not |don't |please |respond |use |include |return |avoid |refuse |follow |prefer |keep |ask |stay |escalate |solve |be )/i.test(
    t,
  );
}

function uniqueSorted(items: Iterable<string>): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

export function analyzeStructure(text: string): StructureProfile {
  const roleTags = uniqueSorted(
    [...text.matchAll(ROLE_TAG_RE)].map((m) => (m[1] ?? m[2] ?? "").toLowerCase()).filter(Boolean),
  );

  const xmlTags = uniqueSorted(
    [...text.matchAll(XML_TAG_RE)]
      .map((m) => (m[1] ?? "").toLowerCase())
      .filter((tag) => tag && !["b", "i", "p", "br", "div", "span"].includes(tag)),
  );

  const headings: string[] = [];
  let safetyLines = 0;
  let constraintLines = 0;
  for (const line of splitPromptLines(text)) {
    const heading = HEADING_RE.exec(line);
    if (heading?.[2]) headings.push(normalizeLine(heading[2]));
    if (isSafetyLine(line)) safetyLines += 1;
    else if (isConstraintLine(line)) constraintLines += 1;
  }

  const toolNames = uniqueSorted([...text.matchAll(TOOL_NAME_RE)].map((m) => m[1] ?? "").filter(Boolean));
  const tools = TOOLS_RE.test(text) || toolNames.length > 0;

  return {
    roleTags,
    jsonSchema: JSON_SCHEMA_RE.test(text),
    tools,
    toolNames,
    xmlTags,
    headings: uniqueSorted(headings),
    safetyLines,
    constraintLines,
  };
}
