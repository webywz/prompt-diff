#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { semanticRiskParagraph } from "./ai.js";
import { diffPrompts } from "./diffPrompts.js";
import { formatHuman, formatJson, shouldColor } from "./format.js";
import {
  appendGitHubJobOutput,
  appendGitHubStepSummary,
  formatGitHubAnnotations,
} from "./github.js";
import { readSource, readSuiteFile, resolvePromptPaths, UsageError } from "./io.js";
import { processSuite } from "./suite.js";
import { packageVersion } from "./version.js";

const HELP = `prompt-diff — diff two LLM prompts like code

Usage:
  prompt-diff <old> <new>
  prompt-diff --old <file> --new <file>
  prompt-diff old.txt -                 # new prompt from stdin
  prompt-diff --json old.txt new.txt
  prompt-diff --github old.txt new.txt  # GitHub Actions annotations
  prompt-diff --suite examples/suite.json --json  # batch mode

Options:
  --old <file>             Old prompt (use - for stdin)
  --new <file>             New prompt (use - for stdin)
  --suite <file>           Process multiple pairs from JSON/YAML file
  --out <file>             Write report to file
  --json                   Machine-readable JSON
  --github                 Emit GitHub Actions annotations (::notice/warning/error)
  --quiet                  Suppress the pretty terminal report (--json / --github still emit)
  --tokens                 Show token estimates (default: on)
  --no-tokens              Hide token estimates
  --format unified|split   Textual diff layout (default: unified)
  --context <n>            Unified diff context lines (default: 3)
  --locale <en|zh>         Output language for terminal reports (default: en)
  --ai                     One-paragraph semantic risk (OPENAI_API_KEY or ANTHROPIC_API_KEY)
  --fail-above <n>         Exit 1 if risk score is >= n (suite mode: applies to maxScore)
  --max-annotations <n>    Cap GitHub annotation lines (default: 20)
  --no-color               Disable ANSI colors
  -h, --help               Show help
  -v, --version            Show version

Exit codes:
  0  ok
  1  risk score exceeded --fail-above
  2  usage or I/O error

Heuristic path is always local and free. --ai is optional and never required.
With --github, annotations go to stdout (or stderr when combined with --json) so
PR Checks can surface intent / token / regression findings. Job outputs
score/level/identical/tokens_delta/findings are written when GITHUB_OUTPUT is set
(findings = risk.factors.length). A short Markdown job summary is appended when
GITHUB_STEP_SUMMARY is set. --quiet hides the pretty report only.

Suite mode (--suite <file.json|yml>): process multiple prompt pairs from a file.
File format: array of {id?, old, new}. With --json, outputs aggregated report
with pairs[] and stats{count, maxScore, avgScore, failed?}. --fail-above applies
to stats.maxScore across the entire suite.
`;

function printHelp(): void {
  process.stdout.write(HELP);
}

function failUsage(message: string): never {
  process.stderr.write(`prompt-diff: ${message}\n\n${HELP}`);
  process.exit(2);
}

interface CliValues {
  old?: string;
  new?: string;
  suite?: string;
  out?: string;
  json: boolean;
  github: boolean;
  quiet: boolean;
  tokens: boolean;
  "no-tokens": boolean;
  format: string;
  context: string;
  locale?: string;
  ai: boolean;
  "fail-above"?: string;
  "max-annotations"?: string;
  "no-color": boolean;
  help: boolean;
  version: boolean;
}

function parseCli(argv: string[]): { values: CliValues; positionals: string[] } {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        old: { type: "string" },
        new: { type: "string" },
        suite: { type: "string" },
        out: { type: "string" },
        json: { type: "boolean", default: false },
        github: { type: "boolean", default: false },
        quiet: { type: "boolean", default: false },
        tokens: { type: "boolean", default: false },
        "no-tokens": { type: "boolean", default: false },
        format: { type: "string", default: "unified" },
        context: { type: "string", default: "3" },
        locale: { type: "string" },
        ai: { type: "boolean", default: false },
        "fail-above": { type: "string" },
        "max-annotations": { type: "string" },
        "no-color": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    return { values: values as CliValues, positionals };
  } catch (err) {
    failUsage(err instanceof Error ? err.message : String(err));
  }
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseCli(argv);

  if (values.help) {
    printHelp();
    return 0;
  }
  if (values.version) {
    process.stdout.write(`${packageVersion()}\n`);
    return 0;
  }

  // Suite mode
  if (values.suite) {
    return await runSuiteMode(values);
  }

  // Single-pair mode (existing logic)
  let paths: { old: string; new: string };
  try {
    paths = resolvePromptPaths(positionals, { old: values.old, new: values.new });
  } catch (err) {
    if (err instanceof UsageError) failUsage(err.message);
    throw err;
  }

  const format = values.format;
  if (format !== "unified" && format !== "split") {
    failUsage(`--format must be unified or split (got ${format})`);
  }

  let locale: "en" | "zh" = "en";
  if (values.locale !== undefined) {
    if (values.locale !== "en" && values.locale !== "zh") {
      failUsage(`--locale must be en or zh (got ${values.locale})`);
    }
    locale = values.locale;
  }

  const context = Number(values.context);
  if (!Number.isInteger(context) || context < 0) {
    failUsage("--context must be a non-negative integer");
  }

  let failAbove: number | undefined;
  if (values["fail-above"] !== undefined) {
    failAbove = Number(values["fail-above"]);
    if (!Number.isFinite(failAbove) || failAbove < 0 || failAbove > 100) {
      failUsage("--fail-above must be a number between 0 and 100");
    }
  }

  let maxAnnotations = 20;
  if (values["max-annotations"] !== undefined) {
    maxAnnotations = Number(values["max-annotations"]);
    if (!Number.isInteger(maxAnnotations) || maxAnnotations < 1) {
      failUsage("--max-annotations must be a positive integer");
    }
  }

  let oldText: string;
  let newText: string;
  try {
    oldText = await readSource(paths.old);
    newText = await readSource(paths.new);
  } catch (err) {
    if (err instanceof UsageError) failUsage(err.message);
    throw err;
  }

  const result = diffPrompts(oldText, newText, {
    context,
    oldLabel: paths.old,
    newLabel: paths.new,
  });

  let semanticRisk: string | undefined;
  if (values.ai) {
    try {
      semanticRisk = await semanticRiskParagraph(oldText, newText);
    } catch (err) {
      process.stderr.write(`prompt-diff: --ai skipped (${err instanceof Error ? err.message : err})\n`);
    }
  }

  const showTokens = !values["no-tokens"];
  const color = shouldColor({
    noColor: values["no-color"] || values.github,
    json: values.json,
    stdoutIsTTY: Boolean(process.stdout.isTTY),
  });

  if (values.github) {
    const ann = formatGitHubAnnotations(result, {
      oldLabel: paths.old,
      newLabel: paths.new,
      semanticRisk: semanticRisk ?? null,
      maxAnnotations,
    });
    // Keep --json stdout machine-parseable; annotations ride on stderr.
    if (values.json) process.stderr.write(ann);
    else process.stdout.write(ann);
    try {
      appendGitHubJobOutput(result);
    } catch (err) {
      process.stderr.write(
        `prompt-diff: GITHUB_OUTPUT skipped (${err instanceof Error ? err.message : err})\n`,
      );
    }
    try {
      appendGitHubStepSummary(result);
    } catch (err) {
      process.stderr.write(
        `prompt-diff: GITHUB_STEP_SUMMARY skipped (${err instanceof Error ? err.message : err})\n`,
      );
    }
  }

  // Write to file when --out is set
  if (values.out) {
    const outputContent = values.json
      ? `${JSON.stringify(formatJson(result, paths, semanticRisk ?? null), null, 2)}\n`
      : formatHuman(result, oldText, newText, {
          color: false,
          tokens: showTokens,
          format,
          oldLabel: paths.old,
          newLabel: paths.new,
          columns: 80,
          semanticRisk,
          locale,
        });
    
    try {
      await writeFile(values.out, outputContent, "utf8");
      if (!values.quiet) {
        process.stderr.write(`prompt-diff: wrote report to ${values.out}\n`);
      }
    } catch (err) {
      process.stderr.write(
        `prompt-diff: failed to write ${values.out}: ${err instanceof Error ? err.message : err}\n`,
      );
      return 2;
    }
  }

  // Write to stdout
  if (values.json || !values.out) {
    if (values.json) {
      process.stdout.write(
        `${JSON.stringify(formatJson(result, paths, semanticRisk ?? null), null, 2)}\n`,
      );
    } else if (!values.quiet) {
      if (values.github) {
        process.stdout.write("::group::prompt-diff report\n");
      }
      process.stdout.write(
        formatHuman(result, oldText, newText, {
          color,
          tokens: showTokens,
          format,
          oldLabel: paths.old,
          newLabel: paths.new,
          columns: process.stdout.columns && process.stdout.columns > 40 ? process.stdout.columns : 80,
          semanticRisk,
          locale,
        }),
      );
      if (values.github) {
        process.stdout.write("::endgroup::\n");
      }
    }
  }

  if (failAbove !== undefined && result.risk.score >= failAbove) {
    process.stderr.write(
      `prompt-diff: risk ${result.risk.score} >= ${failAbove}\n`,
    );
    return 1;
  }
  return 0;
}

async function runSuiteMode(values: CliValues): Promise<number> {
  if (!values.suite) {
    throw new Error("Suite file is required");
  }

  const context = Number(values.context);
  if (!Number.isInteger(context) || context < 0) {
    failUsage("--context must be a non-negative integer");
  }

  let failAbove: number | undefined;
  if (values["fail-above"] !== undefined) {
    failAbove = Number(values["fail-above"]);
    if (!Number.isFinite(failAbove) || failAbove < 0 || failAbove > 100) {
      failUsage("--fail-above must be a number between 0 and 100");
    }
  }

  let pairs;
  try {
    pairs = await readSuiteFile(values.suite);
  } catch (err) {
    if (err instanceof UsageError) failUsage(err.message);
    throw err;
  }

  const report = await processSuite(pairs, { context });

  const output = JSON.stringify(report, null, 2);

  if (values.out) {
    try {
      await writeFile(values.out, `${output}\n`, "utf8");
      if (!values.quiet) {
        process.stderr.write(`prompt-diff: wrote suite report to ${values.out}\n`);
      }
    } catch (err) {
      process.stderr.write(
        `prompt-diff: failed to write ${values.out}: ${err instanceof Error ? err.message : err}\n`,
      );
      return 2;
    }
  }

  if (values.json || !values.out) {
    process.stdout.write(`${output}\n`);
  } else if (!values.quiet) {
    process.stdout.write(
      `Suite processed: ${report.stats.count} pairs, ` +
      `maxScore=${report.stats.maxScore}, avgScore=${report.stats.avgScore}` +
      (report.stats.failed ? `, failed=${report.stats.failed}` : "") + "\n",
    );
  }

  if (failAbove !== undefined && report.stats.maxScore >= failAbove) {
    process.stderr.write(
      `prompt-diff: suite maxScore ${report.stats.maxScore} >= ${failAbove}\n`,
    );
    return 1;
  }

  return 0;
}

const exitCode = await main(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`prompt-diff: ${err instanceof Error ? err.stack ?? err.message : err}\n`);
  return 2;
});
process.exit(exitCode);
