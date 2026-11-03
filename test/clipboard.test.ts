import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyToClipboard } from "../src/clipboard.js";

describe("copyToClipboard", () => {
  it("returns a boolean and does not throw", () => {
    const result = copyToClipboard("prompt-diff clipboard probe");
    assert.equal(typeof result, "boolean");
  });
});
