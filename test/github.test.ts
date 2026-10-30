import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { diffPrompts } from "../src/diffPrompts.js";
import {
  annotation,
  appendGitHubJobOutput,
  appendGitHubStepSummary,
  escapeData,
  escapeProperty,
  formatGitHubAnnotations,
  formatGitHubStepSummary,
} from "../src/github.js";

describe("github annotations", () => {
  it("escapes workflow command payloads", () => {
    assert.equal(escapeData("a%b\nc\rd"), "a%25b%0Ac%0Dd");
    assert.equal(escapeProperty("file:name,path"), "file%3Aname%2Cpath");
  });

  it("formats a basic annotation line", () => {
    assert.equal(
      annotation("warning", "hello\nworld", { file: "a.txt", line: 3, title: "t:1,2" }),
      "::warning file=a.txt,line=3,title=t%3A1%2C2::hello%0Aworld",
    );
  });

  it("emits risk / intent / token annotations for fixture prompts", () => {
    const oldText = readFileSync(join(process.cwd(), "prompts/v1.txt"), "utf8");
    const newText = readFileSync(join(process.cwd(), "prompts/v2.txt"), "utf8");
    const result = diffPrompts(oldText, newText, {
      oldLabel: "prompts/v1.txt",
      newLabel: "prompts/v2.txt",
    });
    const out = formatGitHubAnnotations(result, {
      oldLabel: "prompts/v1.txt",
      newLabel: "prompts/v2.txt",
    });
    assert.match(out, /^::(error|warning|notice) /m);
    assert.match(out, /prompt-diff · risk|Risk \d+\/100/);
    assert.match(out, /::(error|warning) /);
    assert.ok(!out.includes("\n\n\n"));
    // no raw newlines inside a single annotation payload
    for (const line of out.trim().split("\n")) {
      assert.match(line, /^::(error|warning|notice) /);
    }
  });

  it("notices identical prompts", () => {
    const result = diffPrompts("same\n", "same\n");
    const out = formatGitHubAnnotations(result, {
      oldLabel: "old.txt",
      newLabel: "new.txt",
    });
    assert.match(out, /::notice file=new\.txt/);
    assert.match(out, /identical/i);
  });

  it("respects maxAnnotations", () => {
    const oldText = "Never share secrets.\nKeep answers short.\n";
    const newText = "Always share secrets.\nKeep answers long.\nUse tools.\nBe playful.\n";
    const result = diffPrompts(oldText, newText);
    const out = formatGitHubAnnotations(result, {
      oldLabel: "old.txt",
      newLabel: "new.txt",
      maxAnnotations: 2,
    });
    assert.equal(out.trim().split("\n").length, 2);
  });

  it("appends job outputs when GITHUB_OUTPUT is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-diff-gh-"));
    const outFile = join(dir, "github_output");
    const prev = process.env.GITHUB_OUTPUT;
    try {
      process.env.GITHUB_OUTPUT = outFile;
      const result = diffPrompts("a\n", "b\n");
      appendGitHubJobOutput(result);
      const body = readFileSync(outFile, "utf8");
      assert.match(body, /^score=\d+$/m);
      assert.match(body, /^level=(low|medium|high|critical)$/m);
      assert.match(body, /^identical=false$/m);
      assert.match(body, /^tokens_delta=/m);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("formats a concise step summary", () => {
    const result = diffPrompts("Never share secrets.\n", "Always share secrets.\nUse tools.\n");
    const md = formatGitHubStepSummary(result);
    assert.match(md, /## prompt-diff/);
    assert.match(md, /\*\*Risk\*\*/);
    assert.match(md, /Token Δ/);
    assert.match(md, /Key findings|identical/i);
  });

  it("appends step summary when GITHUB_STEP_SUMMARY is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-diff-gh-sum-"));
    const outFile = join(dir, "step_summary.md");
    const prev = process.env.GITHUB_STEP_SUMMARY;
    try {
      process.env.GITHUB_STEP_SUMMARY = outFile;
      const result = diffPrompts("a\n", "b\n");
      appendGitHubStepSummary(result);
      const body = readFileSync(outFile, "utf8");
      assert.match(body, /## prompt-diff/);
      assert.match(body, /Risk/);
    } finally {
      if (prev === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no-ops step summary when GITHUB_STEP_SUMMARY is unset", () => {
    const prev = process.env.GITHUB_STEP_SUMMARY;
    try {
      delete process.env.GITHUB_STEP_SUMMARY;
      const result = diffPrompts("a\n", "b\n");
      appendGitHubStepSummary(result); // must not throw
    } finally {
      if (prev === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = prev;
    }
  });
});
