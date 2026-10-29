import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTokens } from "../src/tokenize.js";

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    assert.equal(estimateTokens(""), 0);
  });

  it("returns a small positive count for a short English phrase", () => {
    const n = estimateTokens("You are a helpful assistant.");
    assert.ok(n >= 4 && n <= 12, `unexpected estimate ${n}`);
  });

  it("grows with longer Latin text", () => {
    const short = estimateTokens("Be concise.");
    const long = estimateTokens("Be concise. Always cite sources and refuse harmful requests. ".repeat(20));
    assert.ok(long > short * 5);
  });

  it("counts CJK roughly one token per character", () => {
    const n = estimateTokens("你好世界");
    assert.ok(n >= 4 && n <= 6, `unexpected CJK estimate ${n}`);
  });
});
