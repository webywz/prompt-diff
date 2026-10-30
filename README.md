# prompt-diff

<p align="center">
  <a href="https://github.com/webywz/prompt-diff/actions/workflows/ci.yml"><img src="https://github.com/webywz/prompt-diff/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@webywz/prompt-diff"><img src="https://img.shields.io/npm/v/@webywz/prompt-diff.svg" alt="npm" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT" /></a>
</p>

<p align="center">
  <strong>Diff two LLM prompts like code — intent, tokens, and regression risk.</strong><br/>
  Offline by default. No paid API required.
</p>

<p align="center">
  像 diff 代码一样对比两份 LLM prompt：意图漂移、token 估算、回归风险分。<br/>
  默认全程离线，不需要付费 API。
</p>

Prompt edits break apps silently: a deleted safety line, a new tool, a quieter constraint. **prompt-diff** is a local CLI and library that compares old vs new system/user prompts and reports what changed.

改 prompt 常常静默翻车：少了一行安全约束、多了一个 tool、语气悄悄变了。**prompt-diff** 是本地 CLI / 库，对比新旧 prompt，把变化说清楚。

---

## Install · 安装

```bash
npm i -g @webywz/prompt-diff
# or one-shot
npx @webywz/prompt-diff old.txt new.txt
```

Requires **Node.js 18+**. Package: [`@webywz/prompt-diff`](https://www.npmjs.com/package/@webywz/prompt-diff). Binary: `prompt-diff`.

需要 **Node.js 18+**。包名 `@webywz/prompt-diff`，命令仍是 `prompt-diff`。

---

## Quick start · 快速开始

```bash
prompt-diff prompts/v1.txt prompts/v2.txt
prompt-diff --old a.md --new b.md
prompt-diff old.txt -                 # new prompt from stdin
prompt-diff --json old.txt new.txt
prompt-diff --format split old.txt new.txt
prompt-diff --fail-above 45 old.txt new.txt    # CI: exit 1 if risk >= 45
```

| Flag | What it does · 作用 |
| --- | --- |
| `--old`, `--new` | Prompt files. `-` reads stdin (one side only). · 提示词文件；一侧可用 `-` 读 stdin |
| `--json` | Machine-readable JSON · 机器可读输出 |
| `--tokens` / `--no-tokens` | Show / hide cl100k-ish token estimates (shown by default) · 显示 / 隐藏 token 估算（默认显示） |
| `--format unified\|split` | Textual diff layout. Default `unified` · 文本 diff 布局，默认 `unified` |
| `--context <n>` | Unified-diff context lines. Default `3` · unified 上下文行数 |
| `--ai` | Optional one-paragraph semantic risk · 可选一段语义风险说明 |
| `--fail-above <n>` | Exit `1` when risk score is `>= n` · 风险分 `>= n` 时退出码 `1` |
| `--no-color` | Disable ANSI colors · 关闭颜色 |
| `-h` / `-v` | Help / version · 帮助 / 版本 |

Exit codes: `0` ok · `1` `--fail-above` exceeded · `2` usage / I/O error.

退出码：`0` 正常 · `1` 触发 `--fail-above` · `2` 用法或读写错误。

Bundled fixtures: [`prompts/v1.txt`](prompts/v1.txt) · [`prompts/v2.txt`](prompts/v2.txt).

示例文件：`prompts/v1.txt` 与 `prompts/v2.txt`。

```bash
# GitHub Actions
npx @webywz/prompt-diff --fail-above 45 old.txt new.txt
```

### Library · 库

```ts
import { diffPrompts, estimateTokens } from "@webywz/prompt-diff";

const result = diffPrompts(oldPrompt, newPrompt, {
  oldLabel: "prompts/v1.txt",
  newLabel: "prompts/v2.txt",
});

console.log(result.risk.score, result.risk.level);
console.log(result.summary.removed);
console.log(estimateTokens(newPrompt));
```

`diffPrompts` is synchronous. Token estimates, the textual diff, intent bullets, and the risk score never call a network.

`diffPrompts` 同步执行。token 估算、文本 diff、意图要点与风险分都不走网络。

---

## Features · 特性

- **Intent summary** — added / removed / reworded lines, not only a raw patch.
  **意图摘要** — 新增 / 删除 / 改写行，而不只是裸 patch。
- **Risk score 0–100** — heuristic bands: low (0–19) · medium (20–44) · high (45–69) · critical (70–100).
  **风险分 0–100** — 启发式分档：low / medium / high / critical。
- **Scoring factors** — length delta, structure (roles / JSON schema / tools / tags), safety deletions, new instructions, reword drift.
  **计分因子** — 长度变化、结构（角色 / schema / tools / 标签）、安全约束删除、新指令、改写漂移。
- **Token estimate** — cl100k-ish (CJK ≈ 1 token/char; Latin blends ~4 chars/token). Not a full BPE tokenizer.
  **Token 估算** — cl100k 近似（CJK ≈ 1 token/字；拉丁文混合估算）。不是完整 BPE。
- **CI gate** — `--fail-above` for prompt regression checks in pipelines.
  **CI 门禁** — `--fail-above` 把 prompt 回归拦在流水线里。
- **Optional `--ai`** — one semantic paragraph when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set; without a key, heuristics still run.
  **可选 `--ai`** — 有 OpenAI / Anthropic Key 时多一段语义说明；没 Key 仍出本地结果。

---

## Links · 链接

- npm · [`@webywz/prompt-diff`](https://www.npmjs.com/package/@webywz/prompt-diff)
- Source · [github.com/webywz/prompt-diff](https://github.com/webywz/prompt-diff)
- Related · [llm-roast](https://github.com/webywz/llm-roast) · [diff-vibe](https://github.com/webywz/diff-vibe) · [vibe-commit](https://github.com/webywz/vibe-commit)
- License · [MIT](./LICENSE)

```bash
npm install && npm test && npm run typecheck
```
