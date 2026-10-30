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

Requires **Node.js 18.18+**. Package: [`@webywz/prompt-diff`](https://www.npmjs.com/package/@webywz/prompt-diff). Binary: `prompt-diff`.

需要 **Node.js 18.18+**。包名 `@webywz/prompt-diff`，命令仍是 `prompt-diff`。

---

## Quick start · 快速开始

```bash
prompt-diff prompts/v1.txt prompts/v2.txt
prompt-diff --old a.md --new b.md
prompt-diff old.txt -                 # new prompt from stdin
prompt-diff --json old.txt new.txt
prompt-diff old.txt new.txt --html                     # self-contained HTML on stdout
prompt-diff old.txt new.txt --html report.html         # write HTML file (creates parent dirs)
prompt-diff --out report.txt old.txt new.txt           # write pretty report to file
prompt-diff --out report.json --json old.txt new.txt   # write JSON to file
prompt-diff --format split old.txt new.txt
prompt-diff --locale zh old.txt new.txt        # 中文终端输出
prompt-diff --fail-above 45 old.txt new.txt    # CI: exit 1 if risk >= 45
prompt-diff --github old.txt new.txt           # CI: PR annotations
prompt-diff --github --quiet old.txt new.txt   # CI: annotations only (no pretty report)
prompt-diff --github --max-annotations 10 old.txt new.txt
prompt-diff --suite examples/suite.json --json  # batch mode
prompt-diff --suite examples/suite.json --json --out report.json
```

| Flag | What it does · 作用 |
| --- | --- |
| `--old`, `--new` | Prompt files. `-` reads stdin (one side only). · 提示词文件；一侧可用 `-` 读 stdin |
| `--suite <file>` | Process multiple pairs from JSON/YAML file (batch mode) · 从 JSON/YAML 文件批量处理多对提示词 |
| `--out <file>` | Write report to file · 将报告写入文件 |
| `--html [path]` | Self-contained offline HTML report. Omit path → stdout; give path → write file (creates parent dirs). Mutually exclusive with `--json`. · 自包含离线 HTML 报告。省略路径输出到 stdout；给出路径则写文件（自动创建父目录）。与 `--json` 互斥 |
| `--json` | Machine-readable JSON · 机器可读输出 |
| `--tokens` / `--no-tokens` | Show / hide cl100k-ish token estimates (shown by default) · 显示 / 隐藏 token 估算（默认显示） |
| `--format unified\|split` | Textual diff layout. Default `unified` · 文本 diff 布局，默认 `unified` |
| `--context <n>` | Unified-diff context lines. Default `3` · unified 上下文行数 |
| `--locale <en\|zh>` | Output language for terminal reports (default `en`). Does not affect `--json` keys. · 终端报告语言（默认 `en`），不影响 `--json` 字段名 |
| `--ai` | Optional one-paragraph semantic risk · 可选一段语义风险说明 |
| `--fail-above <n>` | Exit `1` when risk score is `>= n` (suite mode: applies to maxScore) · 风险分 `>= n` 时退出码 `1`（批量模式：应用于 maxScore） |
| `--github` | Emit GitHub Actions `::notice` / `::warning` / `::error` annotations · 输出 Actions 注解，PR Checks 可见 |
| `--quiet` | Suppress the pretty terminal report; `--json` / `--html` / `--github` still emit · 抑制漂亮终端报告；`--json` / `--html` / `--github` 仍照常输出 |
| `--max-annotations <n>` | Cap annotation lines with `--github` (default `20`) · 限制 `--github` 注解条数（默认 20） |
| `--no-color` | Disable ANSI colors · 关闭颜色 |
| `-h` / `-v` | Help / version · 帮助 / 版本 |

Exit codes: `0` ok · `1` `--fail-above` exceeded · `2` usage / I/O error.

退出码：`0` 正常 · `1` 触发 `--fail-above` · `2` 用法或读写错误。

### Suite / batch mode · 批量模式

Process multiple prompt pairs in one run. Use `--suite <file.json|yml>` with a file containing an array of `{id?, old, new}` objects:

一次处理多对提示词。使用 `--suite <file.json|yml>` 指定包含 `{id?, old, new}` 对象数组的文件：

```bash
prompt-diff --suite examples/suite.json --json
prompt-diff --suite examples/suite.json --json --out report.json
prompt-diff --suite examples/suite.json --html
prompt-diff --suite examples/suite.json --html suite.html
prompt-diff --suite examples/suite.yml --json --fail-above 50
```

**File format · 文件格式:**

```json
[
  {
    "id": "v1-to-v2",
    "old": "prompts/v1.txt",
    "new": "prompts/v2.txt"
  },
  {
    "id": "safety-check",
    "old": "old.txt",
    "new": "new.txt"
  }
]
```

YAML is also supported (`.yml` / `.yaml`). The `id` field is optional; auto-generated if missing.

也支持 YAML（`.yml` / `.yaml`）。`id` 字段可选，缺省时自动生成。

**Output · 输出:**

With `--json`, emits aggregated report:

使用 `--json` 输出汇总报告：

```json
{
  "pairs": [
    { "id": "v1-to-v2", "old": "...", "new": "...", "result": { ... } },
    { "id": "safety-check", "old": "...", "new": "...", "result": { ... } }
  ],
  "stats": {
    "count": 2,
    "maxScore": 52,
    "avgScore": 38,
    "failed": 0
  }
}
```

**`--fail-above` behavior · 行为:**

In suite mode, `--fail-above` applies to `stats.maxScore` (the highest risk score across all pairs). Exit code `1` if `maxScore >= threshold`.

批量模式下，`--fail-above` 应用于 `stats.maxScore`（所有对中的最高风险分）。若 `maxScore >= 阈值` 则退出码 `1`。

**`--out <file>` option · 选项:**

Write the report to disk. In single-pair mode, writes pretty text by default or JSON when `--json` is set. In suite mode, always writes JSON. Useful for CI artifacts or downstream tools.

将报告写入磁盘。单对模式下，默认写入格式化文本，或在设置 `--json` 时写入 JSON。批量模式下，总是写入 JSON。适用于 CI 产物或下游工具。

Bundled fixtures: [`prompts/v1.txt`](prompts/v1.txt) · [`prompts/v2.txt`](prompts/v2.txt) — shipped in the npm package (verify with `npm pack`).

示例文件：`prompts/v1.txt` 与 `prompts/v2.txt`——随 npm 包发布（可用 `npm pack` 验证）。

```bash
# GitHub Actions — gate + PR annotations
npx @webywz/prompt-diff --github --fail-above 45 old.txt new.txt
```

Copy-paste workflow: [`examples/github-actions.yml`](examples/github-actions.yml).

可直接复制的 workflow：[`examples/github-actions.yml`](examples/github-actions.yml)。

`--github` prints workflow commands (`::warning file=…::…`) so Checks / Files changed show intent, token, and regression findings. With `GITHUB_OUTPUT` set it also writes `score`, `level`, `identical`, `tokens_delta`, `findings` (`findings` = `risk.factors.length`). With `GITHUB_STEP_SUMMARY` set it appends a short Markdown job summary (risk / identical / token Δ / key findings). Use `--max-annotations <n>` to soft-cap PR noise (default 20). `--quiet` suppresses the pretty terminal report only (`--json` / `--github` annotations, summary, and outputs still emit). Combine with `--json` or `--html` (stdout) and annotations go to stderr so stdout stays parseable. `--html` and `--json` cannot share stdout.

`--github` 输出 workflow 命令，PR Checks / Files 里能直接看到意图、token、回归风险。在 Actions 里还会写 `GITHUB_OUTPUT`（`score` / `level` / `identical` / `tokens_delta` / `findings`，其中 `findings` = `risk.factors.length`），有 `GITHUB_STEP_SUMMARY` 时再追加一段简洁 Job Summary。`--max-annotations <n>` 可限制注解条数（默认 20）。`--quiet` 只抑制漂亮终端报告（`--json` / `--github` 注解、summary、outputs 仍照常）。与 `--json` 或 `--html`（stdout）联用时注解走 stderr，stdout 仍是干净 JSON / HTML。`--html` 与 `--json` 不能同时占用 stdout，二选一。

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
- **GitHub annotations** — `--github` emits Actions notices/warnings/errors for PR UI; optional Job Summary + `--max-annotations`; `--quiet` for annotations-only CI logs.
  **GitHub 注解** — `--github` 输出 Actions notice/warning/error；可选 Job Summary 与 `--max-annotations`；`--quiet` 只留注解不打漂亮报告。
- **Offline HTML report** — `--html [path]` writes a self-contained page (inline CSS, no CDN) with pair/suite summary, risk, intent, tokens, and diff highlights.
  **离线 HTML 报告** — `--html [path]` 写出自包含页面（内联 CSS，无 CDN）：单对 / 批量摘要、风险、意图、token、diff 高亮。
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
