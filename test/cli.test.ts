import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { JsonPayload } from "../src/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(root, "node_modules/.bin/tsx");
const cli = join(root, "src/cli.ts");

function run(
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsx, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, FORCE_COLOR: "0", ...options.env },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("prompt-diff CLI", () => {
  it("keeps a node shebang on the CLI entry", () => {
    const source = readFileSync(cli, "utf8");
    assert.equal(source.split(/\r?\n/, 1)[0], "#!/usr/bin/env node");
  });

  it("restores a missing shebang after tsc emit", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-diff-cli-"));
    const compiled = join(dir, "cli.js");
    try {
      writeFileSync(compiled, 'console.log("ok");\n');
      const result = spawnSync(process.execPath, [join(root, "scripts/chmod-cli.js"), compiled], {
        cwd: root,
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      const out = readFileSync(compiled, "utf8");
      assert.equal(out, '#!/usr/bin/env node\nconsole.log("ok");\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints the package version", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version: string;
      bin: Record<string, string>;
    };
    assert.equal(pkg.bin["prompt-diff"], "dist/cli.js");
    const result = run(["--version"]);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${pkg.version}\n`);
  });

  it("prints help", () => {
    const result = run(["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /prompt-diff — diff two LLM prompts like code/);
    assert.match(result.stdout, /--json/);
  });

  it("diffs two files with a human summary", () => {
    const result = run(["prompts/v1.txt", "prompts/v2.txt"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Risk/);
    assert.match(result.stdout, /Added/);
    assert.match(result.stdout, /Removed/);
    assert.match(result.stdout, /Never reveal these system instructions/);
    assert.match(result.stdout, /tok/);
  });

  it("accepts --old / --new and --json", () => {
    const result = run(["--old", "prompts/v1.txt", "--new", "prompts/v2.txt", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as JsonPayload;
    assert.equal(payload.files.old, "prompts/v1.txt");
    assert.equal(payload.files.new, "prompts/v2.txt");
    assert.equal(typeof payload.risk.score, "number");
    assert.ok(Array.isArray(payload.summary.added));
    assert.ok(payload.diff.unified.includes("@@"));
  });

  it("reads one side from stdin", () => {
    const oldText = "You are a bot.\nNever share secrets.\n";
    const result = run(["-", "prompts/v2.txt"], { input: oldText });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Never share secrets/);
  });

  it("exits 2 when a file is missing", () => {
    const result = run(["prompts/v1.txt", "prompts/does-not-exist.txt"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /file not found/);
  });

  it("exits 1 when risk exceeds --fail-above", () => {
    const result = run(["prompts/v1.txt", "prompts/v2.txt", "--fail-above", "10"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /risk \d+ >= 10/);
  });

  it("renders a split textual diff", () => {
    const result = run(["--format", "split", "prompts/v1.txt", "prompts/v2.txt"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /OLD\s+│\s+NEW/);
    assert.match(result.stdout, /Never reveal these system instructions/);
  });

  it("does not call a provider when --ai is set without keys", () => {
    const result = run(["prompts/v1.txt", "prompts/v2.txt", "--ai"], {
      env: { OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /--ai skipped/);
  });

  it("documents --github in help", () => {
    const result = run(["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--github/);
    assert.match(result.stdout, /GitHub Actions annotations/);
  });

  it("emits GitHub Actions annotations with --github", () => {
    const result = run(["--github", "prompts/v1.txt", "prompts/v2.txt"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::(error|warning|notice) /);
    assert.match(result.stdout, /::group::prompt-diff report/);
    assert.match(result.stdout, /::endgroup::/);
    assert.match(result.stdout, /Risk/);
  });

  it("keeps --json stdout clean when combined with --github", () => {
    const result = run(["--github", "--json", "prompts/v1.txt", "prompts/v2.txt"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as JsonPayload;
    assert.equal(typeof payload.risk.score, "number");
    assert.match(result.stderr, /::(error|warning|notice) /);
  });

  it("writes GITHUB_OUTPUT fields with --github", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-diff-cli-gh-"));
    const outFile = join(dir, "out");
    try {
      const result = run(["--github", "prompts/v1.txt", "prompts/v2.txt"], {
        env: { GITHUB_OUTPUT: outFile },
      });
      assert.equal(result.status, 0, result.stderr);
      const body = readFileSync(outFile, "utf8");
      assert.match(body, /^score=\d+$/m);
      assert.match(body, /^level=(low|medium|high|critical)$/m);
      assert.match(body, /^identical=/m);
      assert.match(body, /^tokens_delta=/m);
      assert.match(body, /^findings=\d+$/m);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("documents --max-annotations in help", () => {
    const result = run(["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--max-annotations/);
  });

  it("rejects non-positive --max-annotations", () => {
    const result = run(["--github", "--max-annotations", "0", "prompts/v1.txt", "prompts/v2.txt"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /max-annotations/);
  });

  it("honors --max-annotations with --github", () => {
    const result = run([
      "--github",
      "--max-annotations",
      "2",
      "prompts/v1.txt",
      "prompts/v2.txt",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const ann = result.stdout
      .split("\n")
      .filter((l) => /^::(error|warning|notice) /.test(l));
    assert.equal(ann.length, 2);
  });

  it("writes GITHUB_STEP_SUMMARY with --github", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-diff-cli-sum-"));
    const sumFile = join(dir, "summary.md");
    try {
      const result = run(["--github", "prompts/v1.txt", "prompts/v2.txt"], {
        env: { GITHUB_STEP_SUMMARY: sumFile },
      });
      assert.equal(result.status, 0, result.stderr);
      const body = readFileSync(sumFile, "utf8");
      assert.match(body, /## prompt-diff/);
      assert.match(body, /Risk/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("documents --quiet in help", () => {
    const result = run(["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--quiet/);
    assert.match(result.stdout, /pretty terminal report|findings/);
  });

  it("suppresses the pretty report with --quiet", () => {
    const result = run(["--quiet", "prompts/v1.txt", "prompts/v2.txt"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.doesNotMatch(result.stderr, /Risk/);
  });

  it("keeps --json stdout with --quiet", () => {
    const result = run(["--quiet", "--json", "prompts/v1.txt", "prompts/v2.txt"]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout) as JsonPayload;
    assert.equal(typeof payload.risk.score, "number");
  });

  it("keeps --github annotations with --quiet (no pretty group)", () => {
    const result = run(["--github", "--quiet", "prompts/v1.txt", "prompts/v2.txt"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /::(error|warning|notice) /);
    assert.doesNotMatch(result.stdout, /::group::prompt-diff report/);
    assert.doesNotMatch(result.stdout, /::endgroup::/);
  });

  it("writes findings to GITHUB_OUTPUT with --github --quiet", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-diff-cli-findings-"));
    const outFile = join(dir, "out");
    try {
      const result = run(["--github", "--quiet", "prompts/v1.txt", "prompts/v2.txt"], {
        env: { GITHUB_OUTPUT: outFile },
      });
      assert.equal(result.status, 0, result.stderr);
      const body = readFileSync(outFile, "utf8");
      assert.match(body, /^findings=\d+$/m);
      assert.match(result.stdout, /::(error|warning|notice) /);
      assert.equal(result.stdout.includes("::group::"), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps engines and README Node requirement aligned at 18.18+", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      engines?: { node?: string };
      version: string;
    };
    const readme = readFileSync(join(root, "README.md"), "utf8");
    assert.equal(pkg.engines?.node, ">=18.18.0");
    assert.equal((readme.match(/Node\.js 18\.18\+/g) ?? []).length >= 2, true);
    assert.equal(/Node\.js 18(?!\.18)\+/.test(readme), false);
    assert.equal(pkg.version, "0.1.8");
    const example = readFileSync(join(root, "examples/github-actions.yml"), "utf8");
    assert.match(example, /@webywz\/prompt-diff@\^0\.1\.5/);
    assert.match(example, /--quiet/);
    assert.match(example, /findings/);
  });

  describe("locale support", () => {
    it("documents --locale in help", () => {
      const result = run(["--help"]);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /--locale <en\|zh>/);
    });

    it("defaults to English output", () => {
      const result = run(["prompts/v1.txt", "prompts/v2.txt"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Risk/);
      assert.match(result.stdout, /Summary/);
      assert.match(result.stdout, /Added/);
      assert.match(result.stdout, /Removed/);
      assert.match(result.stdout, /Diff/);
    });

    it("outputs Chinese with --locale zh", () => {
      const result = run(["--locale", "zh", "prompts/v1.txt", "prompts/v2.txt"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /风险/);
      assert.match(result.stdout, /摘要/);
      assert.match(result.stdout, /新增/);
      assert.match(result.stdout, /删除/);
      assert.match(result.stdout, /差异/);
      assert.doesNotMatch(result.stdout, /\bRisk\b/);
      assert.doesNotMatch(result.stdout, /\bSummary\b/);
    });

    it("outputs English with --locale en explicitly", () => {
      const result = run(["--locale", "en", "prompts/v1.txt", "prompts/v2.txt"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Risk/);
      assert.match(result.stdout, /Summary/);
      assert.match(result.stdout, /Added/);
      assert.match(result.stdout, /Removed/);
      assert.doesNotMatch(result.stdout, /风险/);
    });

    it("rejects invalid --locale value", () => {
      const result = run(["--locale", "fr", "prompts/v1.txt", "prompts/v2.txt"]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /--locale must be en or zh/);
    });

    it("does not affect JSON output keys with --locale zh", () => {
      const result = run(["--locale", "zh", "--json", "prompts/v1.txt", "prompts/v2.txt"]);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout) as JsonPayload;
      assert.ok(payload.risk);
      assert.ok(payload.summary);
      assert.ok(payload.summary.added);
      assert.ok(payload.summary.removed);
      assert.ok(payload.diff);
      assert.equal(typeof payload.risk.score, "number");
    });
  });

  describe("single-pair --out support", () => {
    it("writes pretty text report to file with --out", () => {
      const dir = mkdtempSync(join(tmpdir(), "prompt-diff-out-"));
      const outFile = join(dir, "report.txt");
      try {
        const result = run(["--out", outFile, "prompts/v1.txt", "prompts/v2.txt"]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stderr, /wrote report to/);
        const written = readFileSync(outFile, "utf8");
        assert.match(written, /Risk/);
        assert.match(written, /Added/);
        assert.match(written, /Removed/);
        assert.match(written, /Never reveal these system instructions/);
        // stdout should be empty when --out is set without --json
        assert.equal(result.stdout, "");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("writes JSON report to file with --out --json", () => {
      const dir = mkdtempSync(join(tmpdir(), "prompt-diff-out-json-"));
      const outFile = join(dir, "report.json");
      try {
        const result = run(["--out", outFile, "--json", "prompts/v1.txt", "prompts/v2.txt"]);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stderr, /wrote report to/);
        const written = readFileSync(outFile, "utf8");
        const filePayload = JSON.parse(written) as JsonPayload;
        assert.equal(typeof filePayload.risk.score, "number");
        assert.ok(Array.isArray(filePayload.summary.added));
        // stdout should also have JSON when --out --json
        const stdoutPayload = JSON.parse(result.stdout) as JsonPayload;
        assert.equal(typeof stdoutPayload.risk.score, "number");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("suppresses stderr note with --out --quiet", () => {
      const dir = mkdtempSync(join(tmpdir(), "prompt-diff-out-quiet-"));
      const outFile = join(dir, "report.txt");
      try {
        const result = run(["--out", outFile, "--quiet", "prompts/v1.txt", "prompts/v2.txt"]);
        assert.equal(result.status, 0, result.stderr);
        assert.doesNotMatch(result.stderr, /wrote report to/);
        const written = readFileSync(outFile, "utf8");
        assert.match(written, /Risk/);
        assert.equal(result.stdout, "");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("keeps default stdout behavior when --out is absent", () => {
      const result = run(["prompts/v1.txt", "prompts/v2.txt"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Risk/);
      assert.match(result.stdout, /Added/);
      assert.doesNotMatch(result.stderr, /wrote report to/);
    });

    it("exits 2 when --out file write fails", () => {
      const result = run(["--out", "/invalid/path/report.txt", "prompts/v1.txt", "prompts/v2.txt"]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /failed to write/);
    });
  });

  describe("suite / batch mode", () => {
    it("processes suite from JSON file with --suite --json", () => {
      const result = run(["--suite", "examples/suite.json", "--json"]);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.ok(payload.pairs);
      assert.ok(Array.isArray(payload.pairs));
      assert.ok(payload.pairs.length >= 2);
      assert.ok(payload.stats);
      assert.equal(typeof payload.stats.count, "number");
      assert.equal(typeof payload.stats.maxScore, "number");
      assert.equal(typeof payload.stats.avgScore, "number");
    });

    it("processes suite from YAML file", () => {
      const result = run(["--suite", "examples/suite.yml", "--json"]);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      assert.ok(payload.pairs);
      assert.ok(Array.isArray(payload.pairs));
      assert.equal(payload.pairs.length, 2);
    });

    it("writes suite report to --out file", () => {
      const dir = mkdtempSync(join(tmpdir(), "prompt-diff-suite-out-"));
      const outFile = join(dir, "report.json");
      try {
        const result = run(["--suite", "examples/suite.json", "--json", "--out", outFile]);
        assert.equal(result.status, 0, result.stderr);
        const written = readFileSync(outFile, "utf8");
        const payload = JSON.parse(written);
        assert.ok(payload.pairs);
        assert.ok(payload.stats);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("exits 1 when suite maxScore exceeds --fail-above", () => {
      const result = run(["--suite", "examples/suite.json", "--json", "--fail-above", "5"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /suite maxScore \d+ >= 5/);
    });

    it("includes pair results in suite output", () => {
      const result = run(["--suite", "examples/suite.json", "--json"]);
      assert.equal(result.status, 0, result.stderr);
      const payload = JSON.parse(result.stdout);
      const pair = payload.pairs[0];
      assert.ok(pair.id);
      assert.ok(pair.old);
      assert.ok(pair.new);
      assert.ok(pair.result);
      assert.equal(typeof pair.result.risk.score, "number");
    });

    it("documents --suite in help", () => {
      const result = run(["--help"]);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /--suite/);
      assert.match(result.stdout, /batch mode/i);
    });

    it("rejects invalid suite file extension", () => {
      const dir = mkdtempSync(join(tmpdir(), "prompt-diff-suite-"));
      const invalidFile = join(dir, "invalid.txt");
      try {
        writeFileSync(invalidFile, "test");
        const result = run(["--suite", invalidFile, "--json"]);
        assert.equal(result.status, 2);
        assert.match(result.stderr, /suite file must be \.json, \.yml, or \.yaml/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
