import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli.js";
import { diffPrompts } from "../src/diffPrompts.js";
import { formatHuman } from "../src/format.js";
import type { JsonPayload } from "../src/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(root, "node_modules/.bin/tsx");
const cli = join(root, "src/cli.ts");
const oldRel = "prompts/v1.txt";
const newRel = "prompts/v2.txt";
const oldPath = join(root, oldRel);
const newPath = join(root, newRel);

function run(
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(tsx, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", ...options.env },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function withFakeClipboard<T>(fn: (clipFile: string, env: NodeJS.ProcessEnv) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "prompt-diff-clip-"));
  const bin = join(dir, "bin");
  const clipFile = join(dir, "clipboard.txt");
  mkdirSync(bin);
  writeFileSync(join(bin, "wl-copy"), `#!/bin/sh\ncat > "${clipFile}"\n`, { mode: 0o755 });
  const env = { PATH: `${bin}:${process.env.PATH ?? ""}` };
  try {
    return fn(clipFile, env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runMain(
  args: string[],
  copyToClipboard?: (text: string) => boolean,
): Promise<{ status: number; calls: string[] }> {
  const calls: string[] = [];
  const deps = copyToClipboard
    ? {
        copyToClipboard: (text: string) => {
          calls.push(text);
          return copyToClipboard(text);
        },
      }
    : {};
  const status = await main(args, deps);
  return { status, calls };
}

describe("--copy CLI wiring", { concurrency: false }, () => {
  it("lists --copy in help", () => {
    const result = run(["--help"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--copy/);
    assert.match(result.stdout, /clipboard/);
    assert.match(result.stdout, /skip silently/);
  });

  it("copies the pretty prompt-diff report, not JSON / HTML chrome", async () => {
    const result = await runMain(["--copy", "--quiet", oldPath, newPath], () => true);
    assert.equal(result.status, 0);
    assert.equal(result.calls.length, 1);
    const copied = result.calls[0] ?? "";
    assert.match(copied, /Risk/);
    assert.match(copied, /Added/);
    assert.match(copied, /Removed/);
    assert.match(copied, /prompt-diff/);
    assert.doesNotMatch(copied, /^\s*\{/);
    assert.doesNotMatch(copied, /<!DOCTYPE html>/i);
    assert.doesNotMatch(copied, /::(error|warning|notice|group|endgroup)/);
    assert.doesNotMatch(copied, /\x1b\[/);
  });

  it("with --json still copies the pretty report, not the JSON blob", () => {
    withFakeClipboard((clipFile, env) => {
      const result = run(["--copy", "--json", oldRel, newRel], { env });
      assert.equal(result.status, 0, result.stderr);
      const copied = readFileSync(clipFile, "utf8");
      assert.match(copied, /Risk/);
      assert.doesNotMatch(copied, /"identical"/);
      const payload = JSON.parse(result.stdout) as JsonPayload;
      assert.equal(typeof payload.risk.score, "number");
      assert.match(copied, new RegExp(`${payload.risk.score}/100`));
    });
  });

  it("with --html still copies the pretty report, not HTML", () => {
    withFakeClipboard((clipFile, env) => {
      // `--html` must follow the files so they are not taken as the HTML path.
      const result = run(["--copy", oldRel, newRel, "--html"], { env });
      assert.equal(result.status, 0, result.stderr);
      const copied = readFileSync(clipFile, "utf8");
      assert.match(copied, /Risk/);
      assert.doesNotMatch(copied, /<!DOCTYPE html>/i);
      assert.match(result.stdout, /<!DOCTYPE html>/i);
    });
  });

  it("clipboard failure is silent success", async () => {
    const result = await runMain(["--copy", "--quiet", oldPath, newPath], () => false);
    assert.equal(result.status, 0);
    assert.equal(result.calls.length, 1);
  });

  it("clipboard throw is silent success", async () => {
    const result = await runMain(["--copy", "--quiet", oldPath, newPath], () => {
      throw new Error("clipboard exploded");
    });
    assert.equal(result.status, 0);
  });

  it("without --copy does not invoke the clipboard", async () => {
    let called = false;
    const withSpy = await runMain(["--quiet", oldPath, newPath], () => {
      called = true;
      return true;
    });
    assert.equal(withSpy.status, 0);
    assert.equal(called, false);
    assert.equal(withSpy.calls.length, 0);
  });

  it("copies after the report is built with --github / --fail-above / --html path", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-diff-copy-"));
    try {
      withFakeClipboard((clipFile, env) => {
        const result = run(
          [
            "--copy",
            "--github",
            "--quiet",
            "--fail-above",
            "100",
            "--html",
            join(dir, "report.html"),
            oldRel,
            newRel,
          ],
          { env },
        );
        assert.equal(result.status, 0, result.stderr);
        const copied = readFileSync(clipFile, "utf8");
        assert.match(copied, /Risk/);
        assert.doesNotMatch(copied, /::(error|warning|notice)/);
        assert.doesNotMatch(result.stderr, /clipboard/i);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("honors --locale zh in the copied pretty report", async () => {
    const result = await runMain(
      ["--copy", "--quiet", "--locale", "zh", oldPath, newPath],
      () => true,
    );
    assert.equal(result.status, 0);
    assert.equal(result.calls.length, 1);
    assert.match(result.calls[0] ?? "", /风险/);
  });

  it("suite mode accepts --copy as a silent no-op", () => {
    withFakeClipboard((clipFile, env) => {
      const result = run(["--copy", "--suite", "examples/suite.json", "--json"], { env });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(clipFile), false);
      const payload = JSON.parse(result.stdout) as { stats: { count: number } };
      assert.equal(typeof payload.stats.count, "number");
    });
  });

  it("copied text matches color-free formatHuman", async () => {
    const result = await runMain(["--copy", "--quiet", oldPath, newPath], () => true);
    assert.equal(result.status, 0);
    const oldText = readFileSync(oldPath, "utf8");
    const newText = readFileSync(newPath, "utf8");
    const diff = diffPrompts(oldText, newText, {
      oldLabel: oldPath,
      newLabel: newPath,
    });
    const pretty = formatHuman(diff, oldText, newText, {
      color: false,
      tokens: true,
      format: "unified",
      oldLabel: oldPath,
      newLabel: newPath,
      columns: 80,
    });
    assert.equal(result.calls[0], pretty);
  });
});
