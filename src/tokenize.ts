/**
 * Approximate a cl100k_base (GPT-4 family) token count without shipping a BPE table.
 *
 * The estimate blends:
 * - CJK / Hangul / kana at ~1 token per character
 * - Latin-script text at the usual ~4 chars/token and ~0.75 words/token mix
 *
 * Good enough for prompt-size diffs. Not a tokenizer.
 */
const CJK_MIN = 0x3400;
const CJK_MAX = 0x9fff;
const CJK_EXT_A = 0x20000;
const CJK_EXT_B = 0x2a6df;
const HIRAGANA_MIN = 0x3040;
const KATAKANA_MAX = 0x30ff;
const HANGUL_MIN = 0xac00;
const HANGUL_MAX = 0xd7af;

function isCjkCodePoint(code: number): boolean {
  return (
    (code >= CJK_MIN && code <= CJK_MAX) ||
    (code >= CJK_EXT_A && code <= CJK_EXT_B) ||
    (code >= HIRAGANA_MIN && code <= KATAKANA_MAX) ||
    (code >= HANGUL_MIN && code <= HANGUL_MAX)
  );
}

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;

  let cjk = 0;
  let otherChars = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (isCjkCodePoint(code)) cjk += 1;
    else otherChars += ch.length;
  }

  const nonCjk = [...text].filter((ch) => !isCjkCodePoint(ch.codePointAt(0) ?? 0)).join("");
  const trimmed = nonCjk.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  const latinByChars = otherChars / 4;
  const latinByWords = words / 0.75;
  const latin = words === 0 ? latinByChars : (latinByChars + latinByWords) / 2;

  return Math.max(1, Math.round(cjk + latin));
}
