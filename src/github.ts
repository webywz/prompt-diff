import { appendFileSync } from "node:fs";
import type { PromptDiffResult, RiskFactor, RiskLevel } from "./types.js";

export interface GitHubFormatOptions {
  oldLabel: string;
  newLabel: string;
  semanticRisk?: string | null;
  /** Soft cap for PR annotation noise. Default 20. */
  maxAnnotations?: number;
}

type AnnotationType = "error" | "warning" | "notice";

/** Escape payload text for workflow command messages. */
export function escapeData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** Escape workflow command property values (file, title, …). */
export function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function annotation(
  type: AnnotationType,
  message: string,
  props: { file?: string; line?: number; title?: string } = {},
): string {
  const parts: string[] = [];
  if (props.file) parts.push(`file=${escapeProperty(props.file)}`);
  if (props.line !== undefined && Number.isFinite(props.line)) {
    parts.push(`line=${Math.max(1, Math.trunc(props.line))}`);
  }
  if (props.title) parts.push(`title=${escapeProperty(props.title)}`);
  const meta = parts.length > 0 ? ` ${parts.join(",")}` : "";
  return `::${type}${meta}::${escapeData(message)}`;
}

function riskAnnotationType(level: RiskLevel): AnnotationType {
  switch (level) {
    case "critical":
      return "error";
    case "high":
    case "medium":
      return "warning";
    case "low":
      return "notice";
  }
}

function factorAnnotationType(factor: RiskFactor): AnnotationType {
  switch (factor.id) {
    case "safety_deletion":
      return "error";
    case "new_instructions":
    case "structure":
      return "warning";
    case "length":
    case "reword":
      return "notice";
  }
}

function sign(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Emit GitHub Actions workflow commands so PR Checks show prompt-diff findings.
 * Offline / local-safe: pure string formatting, no network.
 */
export function formatGitHubAnnotations(
  result: PromptDiffResult,
  options: GitHubFormatOptions,
): string {
  const max = options.maxAnnotations ?? 20;
  const lines: string[] = [];
  const push = (line: string): void => {
    if (lines.length < max) lines.push(line);
  };

  const newFile = options.newLabel;
  const oldFile = options.oldLabel;

  if (result.identical) {
    push(
      annotation("notice", "Prompts are identical — no intent / token / risk delta.", {
        file: newFile,
        title: "prompt-diff",
      }),
    );
    return `${lines.join("\n")}\n`;
  }

  const riskMsg = `Risk ${result.risk.score}/100 (${result.risk.level})`;
  push(
    annotation(riskAnnotationType(result.risk.level), riskMsg, {
      file: newFile,
      title: "prompt-diff · risk",
    }),
  );

  for (const factor of result.risk.factors) {
    push(
      annotation(factorAnnotationType(factor), `${factor.detail} (+${factor.impact})`, {
        file: newFile,
        title: `prompt-diff · ${factor.id}`,
      }),
    );
  }

  const tok = result.stats.delta.tokens;
  const pct = result.stats.delta.percent;
  if (Math.abs(tok) >= 20 || Math.abs(pct) >= 10) {
    push(
      annotation(
        "notice",
        `Token Δ ${sign(tok)} · chars ${sign(result.stats.delta.chars)} (${sign(pct)}%)`,
        { file: newFile, title: "prompt-diff · tokens" },
      ),
    );
  }

  for (const item of result.summary.removed) {
    push(
      annotation("warning", `Removed: ${item}`, {
        file: oldFile,
        title: "prompt-diff · removed",
      }),
    );
  }
  for (const item of result.summary.added) {
    push(
      annotation("notice", `Added: ${item}`, {
        file: newFile,
        title: "prompt-diff · added",
      }),
    );
  }
  for (const item of result.summary.reworded) {
    push(
      annotation("notice", `Reworded: ${item.from} → ${item.to}`, {
        file: newFile,
        title: "prompt-diff · reworded",
      }),
    );
  }

  if (options.semanticRisk) {
    push(
      annotation("notice", options.semanticRisk, {
        file: newFile,
        title: "prompt-diff · semantic",
      }),
    );
  }

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/** Append job outputs when running inside Actions (`GITHUB_OUTPUT`). */
export function appendGitHubJobOutput(result: PromptDiffResult): void {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  const body = [
    `score=${result.risk.score}`,
    `level=${result.risk.level}`,
    `identical=${result.identical}`,
    `tokens_delta=${result.stats.delta.tokens}`,
  ].join("\n");
  appendFileSync(path, `${body}\n`, "utf8");
}

/** Build a short Markdown Job Summary for Actions (no env I/O). */
export function formatGitHubStepSummary(result: PromptDiffResult): string {
  const lines: string[] = [
    "## prompt-diff",
    "",
    `| | |`,
    `| --- | --- |`,
    `| **Risk** | ${result.risk.score}/100 (\`${result.risk.level}\`) |`,
    `| **Identical** | ${result.identical} |`,
    `| **Token Δ** | ${sign(result.stats.delta.tokens)} |`,
    `| **Chars Δ** | ${sign(result.stats.delta.chars)} (${sign(result.stats.delta.percent)}%) |`,
    "",
  ];

  if (result.identical) {
    lines.push("_Prompts are identical — no findings._", "");
    return lines.join("\n");
  }

  const findings: string[] = [];
  for (const f of result.risk.factors.slice(0, 5)) {
    findings.push(`- **${f.id}** (+${f.impact}): ${f.detail}`);
  }
  for (const item of result.summary.removed.slice(0, 3)) {
    findings.push(`- removed: ${item}`);
  }
  for (const item of result.summary.added.slice(0, 3)) {
    findings.push(`- added: ${item}`);
  }
  if (findings.length > 0) {
    lines.push("### Key findings", "", ...findings.slice(0, 8), "");
  }
  return lines.join("\n");
}

/**
 * Append a concise Job Summary when running inside Actions (`GITHUB_STEP_SUMMARY`).
 * No-op when the env var is unset.
 */
export function appendGitHubStepSummary(result: PromptDiffResult): void {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  appendFileSync(path, `${formatGitHubStepSummary(result)}\n`, "utf8");
}
