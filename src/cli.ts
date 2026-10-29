#!/usr/bin/env node
import { parseArgs } from "node:util";
import { semanticRiskParagraph } from "./ai.js";
import { diffPrompts } from "./diffPrompts.js";
import { formatHuman, formatJson, shouldColor } from "./format.js";
import { readSource, resolvePromptPaths, UsageError } from "./io.js";
import { packageVersion } from "./version.js";

const HELP = `prompt-diff — diff two LLM prompts like code

Usage:
  prompt-diff <old> <new>
  prompt-diff --old <file> --new <file>
  prompt-diff old.txt -                 # new prompt from stdin
  prompt-diff --json old.txt new.txt

Options:
  --old <file>             Old prompt (use - for stdin)
  --new <file>             New prompt (use - for stdin)
  --json                   Machine-readable JSON
  --tokens                 Show token estimates (default: on)
  --no-tokens              Hide token estimates
  --format unified|split   Textual diff layout (default: unified)
  --context <n>            Unified diff context lines (default: 3)
  --ai                     One-paragraph semantic risk (OPENAI_API_KEY or ANTHROPIC_API_KEY)
  --fail-above <n>         Exit 1 if risk score is >= n
  --no-color               Disable ANSI colors
  -h, --help               Show help
  -v, --version            Show version

Exit codes:
  0  ok
  1  risk score exceeded --fail-above
  2  usage or I/O error

Heuristic path is always local and free. --ai is optional and never required.
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
  json: boolean;
  tokens: boolean;
  "no-tokens": boolean;
  format: string;
  context: string;
  ai: boolean;
  "fail-above"?: string;
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
        json: { type: "boolean", default: false },
        tokens: { type: "boolean", default: false },
        "no-tokens": { type: "boolean", default: false },
        format: { type: "string", default: "unified" },
        context: { type: "string", default: "3" },
        ai: { type: "boolean", default: false },
        "fail-above": { type: "string" },
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
    noColor: values["no-color"],
    json: values.json,
    stdoutIsTTY: Boolean(process.stdout.isTTY),
  });

  if (values.json) {
    process.stdout.write(
      `${JSON.stringify(formatJson(result, paths, semanticRisk ?? null), null, 2)}\n`,
    );
  } else {
    process.stdout.write(
      formatHuman(result, oldText, newText, {
        color,
        tokens: showTokens,
        format,
        oldLabel: paths.old,
        newLabel: paths.new,
        columns: process.stdout.columns && process.stdout.columns > 40 ? process.stdout.columns : 80,
        semanticRisk,
      }),
    );
  }

  if (failAbove !== undefined && result.risk.score >= failAbove) {
    process.stderr.write(
      `prompt-diff: risk ${result.risk.score} >= ${failAbove}\n`,
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
