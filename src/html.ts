import { getLocaleStrings } from "./locale.js";
import type { Locale, PromptDiffResult, RiskLevel, SuiteReport } from "./types.js";
import { packageVersion } from "./version.js";

/** Escape text for safe insertion into HTML text/attr contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface HtmlFormatOptions {
  locale?: Locale;
  oldLabel: string;
  newLabel: string;
  semanticRisk?: string | null;
  tokens?: boolean;
}

export interface SuiteHtmlFormatOptions {
  locale?: Locale;
  tokens?: boolean;
}

interface HtmlChrome {
  kicker: string;
  tokens: string;
  findings: string;
  intent: string;
  pair: string;
  suite: string;
  pairs: string;
  maxScore: string;
  avgScore: string;
  failed: string;
  error: string;
  footer: string;
  moreLines: (n: number) => string;
}

const CHROME: Record<Locale, HtmlChrome> = {
  en: {
    kicker: "Risk score",
    tokens: "Tokens",
    findings: "Risk factors",
    intent: "Intent",
    pair: "Pair",
    suite: "Suite",
    pairs: "pairs",
    maxScore: "max",
    avgScore: "avg",
    failed: "failed",
    error: "Error",
    footer: "prompt-diff · self-contained · offline (file://)",
    moreLines: (n) => `… ${n} more lines`,
  },
  zh: {
    kicker: "风险分",
    tokens: "Token",
    findings: "风险因子",
    intent: "意图",
    pair: "对比",
    suite: "批量",
    pairs: "对",
    maxScore: "最高",
    avgScore: "平均",
    failed: "失败",
    error: "错误",
    footer: "prompt-diff · 自包含 · 离线 (file://)",
    moreLines: (n) => `… 另有 ${n} 行`,
  },
};

const MAX_DIFF_LINES = 240;

function sign(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function toneFor(level: RiskLevel): "ok" | "mid" | "hot" {
  switch (level) {
    case "low":
      return "ok";
    case "medium":
      return "mid";
    case "high":
    case "critical":
      return "hot";
  }
}

function chromeFor(locale: Locale): HtmlChrome {
  return CHROME[locale] ?? CHROME.en;
}

function listHtml(items: string[], empty: string): string {
  if (items.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const rows = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");
  return `<ul class="bullets">\n${rows}\n</ul>`;
}

function rewordHtml(
  items: Array<{ from: string; to: string }>,
  empty: string,
): string {
  if (items.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const rows = items
    .map(
      (item) =>
        `<li><span class="del">${escapeHtml(item.from)}</span> <span class="arrow">→</span> <span class="add">${escapeHtml(item.to)}</span></li>`,
    )
    .join("\n");
  return `<ul class="bullets">\n${rows}\n</ul>`;
}

function unifiedDiffHtml(unified: string, noDiff: string, moreLines: (n: number) => string): string {
  if (!unified.trim()) {
    return `<p class="empty">${escapeHtml(noDiff)}</p>`;
  }
  const lines = unified.split("\n");
  const extra = lines.length > MAX_DIFF_LINES ? lines.length - MAX_DIFF_LINES : 0;
  const shown = extra > 0 ? lines.slice(0, MAX_DIFF_LINES) : lines;
  const rows = shown.map((line) => {
    const cls =
      line.startsWith("+++") || line.startsWith("---")
        ? "dim"
        : line.startsWith("@@")
          ? "hunk"
          : line.startsWith("+")
            ? "add"
            : line.startsWith("-")
              ? "del"
              : "ctx";
    return `<span class="${cls}">${escapeHtml(line)}</span>`;
  });
  if (extra > 0) {
    rows.push(`<span class="dim">${escapeHtml(moreLines(extra))}</span>`);
  }
  return `<pre class="diff">${rows.join("\n")}</pre>`;
}

function scoreBar(score: number, tone: "ok" | "mid" | "hot"): string {
  const pct = Math.max(0, Math.min(100, score));
  return `<div class="bar"><span class="bar-fill tone-${tone}" style="width:${pct}%"></span></div>`;
}

function factorsHtml(
  result: PromptDiffResult,
  strings: ReturnType<typeof getLocaleStrings>,
): string {
  if (result.risk.factors.length === 0) {
    const empty = result.identical ? strings.identical : strings.trivialChange;
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const rows = result.risk.factors
    .map(
      (factor) => `<div class="finding">
  <header>
    <span class="kind">${escapeHtml(factor.id)}</span>
    <span class="detail">${escapeHtml(factor.detail)}</span>
    <span class="pts">+${factor.impact}</span>
  </header>
</div>`,
    )
    .join("\n");
  return `<div class="findings">\n${rows}\n</div>`;
}

function statsHtml(
  result: PromptDiffResult,
  options: { tokens: boolean },
  strings: ReturnType<typeof getLocaleStrings>,
  chrome: HtmlChrome,
): string {
  const token = (n: number): string =>
    options.tokens ? ` · ${n} ${escapeHtml(strings.tok)}` : "";
  const tokenDelta = options.tokens
    ? ` · ${escapeHtml(sign(result.stats.delta.tokens))} ${escapeHtml(strings.tok)}`
    : "";
  const pct = `${result.stats.delta.percent >= 0 ? "+" : ""}${result.stats.delta.percent.toFixed(1)}%`;
  return `<div class="stats">
  <div><span class="muted">${escapeHtml(strings.old)}</span> ${result.stats.old.chars} ${escapeHtml(strings.chars)} · ${result.stats.old.words} ${escapeHtml(strings.words)} · ${result.stats.old.lines} ${escapeHtml(strings.lines)}${token(result.stats.old.tokens)}</div>
  <div><span class="muted">${escapeHtml(strings.new)}</span> ${result.stats.new.chars} ${escapeHtml(strings.chars)} · ${result.stats.new.words} ${escapeHtml(strings.words)} · ${result.stats.new.lines} ${escapeHtml(strings.lines)}${token(result.stats.new.tokens)}</div>
  <div><span class="muted">${escapeHtml(strings.delta)}</span> ${escapeHtml(sign(result.stats.delta.chars))} ${escapeHtml(strings.chars)} (${escapeHtml(pct)}) · ${escapeHtml(sign(result.stats.delta.words))} ${escapeHtml(strings.words)} · ${escapeHtml(sign(result.stats.delta.lines))} ${escapeHtml(strings.lines)}${tokenDelta}</div>
  ${options.tokens ? `<div><span class="muted">${escapeHtml(chrome.tokens)}</span> ${escapeHtml(sign(result.stats.delta.tokens))}</div>` : ""}
</div>`;
}

function pairBodyHtml(
  result: PromptDiffResult,
  options: { tokens: boolean; semanticRisk?: string | null },
  locale: Locale,
): string {
  const strings = getLocaleStrings(locale);
  const chrome = chromeFor(locale);
  const added = listHtml(result.summary.added, strings.noneMarker);
  const removed = listHtml(result.summary.removed, strings.noneMarker);
  const reworded = rewordHtml(result.summary.reworded, strings.noneMarker);
  const semantic = options.semanticRisk
    ? `<section class="panel">
  <h2>${escapeHtml(strings.semanticRisk)}</h2>
  <p class="summary">${escapeHtml(options.semanticRisk)}</p>
</section>`
    : "";
  return `${statsHtml(result, { tokens: options.tokens }, strings, chrome)}
<section class="panel">
  <h2>${escapeHtml(chrome.findings)}</h2>
  ${factorsHtml(result, strings)}
</section>
<section class="panel">
  <h2>${escapeHtml(chrome.intent)} · ${escapeHtml(strings.summary)}</h2>
  <h3 class="sub">${escapeHtml(strings.added)}</h3>
  ${added}
  <h3 class="sub">${escapeHtml(strings.removed)}</h3>
  ${removed}
  <h3 class="sub">${escapeHtml(strings.reworded)}</h3>
  ${reworded}
</section>
${semantic}
<section class="panel">
  <h2>${escapeHtml(strings.diff)}</h2>
  ${unifiedDiffHtml(result.diff.unified, strings.noDiff, chrome.moreLines)}
</section>`;
}

const PAGE_CSS = `:root {
  --bg: #1a1b26;
  --bg-deep: #16161e;
  --panel: #1f2335;
  --border: #3b4261;
  --text: #c0caf5;
  --muted: #565f89;
  --blue: #7aa2f7;
  --cyan: #7dcfff;
  --green: #9ece6a;
  --orange: #ff9e64;
  --red: #f7768e;
  --yellow: #e0af68;
  --purple: #bb9af7;
  --font: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg); color: var(--text);
  font: 14px/1.55 var(--font);
}
body { padding: 28px 20px 56px; max-width: 880px; margin: 0 auto; }
.top {
  border: 1px solid var(--border); background: var(--panel);
  padding: 18px 20px; margin-bottom: 16px;
}
.top h1 { margin: 0 0 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.03em; }
.top .meta { color: var(--muted); font-size: 12px; }
.hero {
  border: 1px solid var(--border); background: var(--bg-deep);
  padding: 22px 20px; margin-bottom: 16px;
}
.hero .kicker {
  color: var(--muted); font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.1em; margin: 0 0 8px;
}
.hero .score {
  font-size: 42px; font-weight: 700; letter-spacing: -0.03em; line-height: 1;
}
.hero .score.tone-ok { color: var(--green); }
.hero .score.tone-mid { color: var(--yellow); }
.hero .score.tone-hot { color: var(--red); }
.hero .label { color: var(--muted); margin-top: 8px; }
.bar {
  margin-top: 14px; height: 8px; background: #11131c;
  border: 1px solid var(--border); overflow: hidden;
}
.bar-fill { display: block; height: 100%; }
.bar-fill.tone-ok { background: var(--green); }
.bar-fill.tone-mid { background: var(--yellow); }
.bar-fill.tone-hot { background: var(--red); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.chip {
  padding: 1px 8px; border: 1px solid var(--border); font-size: 12px; color: var(--cyan);
}
.chip.tone-ok { color: var(--green); border-color: #3d4f2f; }
.chip.tone-mid { color: var(--yellow); border-color: #5a4a24; }
.chip.tone-hot { color: var(--red); border-color: #5a1d1d; }
.panel {
  border: 1px solid var(--border); background: var(--panel);
  padding: 16px 18px; margin: 0 0 14px;
}
h2 {
  font-size: 11px; color: var(--muted); text-transform: uppercase;
  letter-spacing: 0.1em; margin: 0 0 10px; font-weight: 600;
}
h3.sub {
  font-size: 12px; color: var(--cyan); margin: 12px 0 6px; font-weight: 600;
}
.stats { color: #a9b1d6; font-size: 13px; margin: 0 0 14px; }
.stats div { margin: 0 0 4px; }
.muted { color: var(--muted); }
.summary { margin: 0; color: #a9b1d6; white-space: pre-wrap; }
.bullets { margin: 0; padding-left: 1.2em; color: #a9b1d6; }
.bullets li { margin: 0 0 4px; }
.empty { color: var(--muted); margin: 0; }
.findings { display: flex; flex-direction: column; gap: 8px; }
.finding {
  border: 1px solid var(--border); background: var(--bg-deep); padding: 10px 12px;
}
.finding header { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.finding .kind {
  color: var(--purple); border: 1px solid #3b3358; padding: 0 6px; font-size: 11px;
}
.finding .detail { color: #a9b1d6; }
.finding .pts { margin-left: auto; color: var(--muted); }
.arrow { color: var(--muted); }
.add { color: var(--green); }
.del { color: var(--red); }
.diff {
  margin: 0; padding: 10px 12px; overflow-x: auto;
  background: var(--bg-deep); border: 1px solid var(--border);
  color: #a9b1d6; white-space: pre-wrap; word-break: break-word;
}
.diff .dim { color: var(--muted); }
.diff .hunk { color: var(--cyan); }
.diff .add { color: var(--green); }
.diff .del { color: var(--red); }
.diff .ctx { color: #a9b1d6; }
.error { color: var(--red); margin: 0; }
footer {
  margin-top: 24px; color: var(--muted); font-size: 11px;
  border-top: 1px solid var(--border); padding-top: 12px;
}
@media (max-width: 640px) {
  .hero .score { font-size: 32px; }
}`;

function wrapPage(opts: {
  locale: Locale;
  title: string;
  body: string;
  footer: string;
}): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(opts.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<style>
${PAGE_CSS}
</style>
</head>
<body>
${opts.body}
<footer>${escapeHtml(opts.footer)}</footer>
</body>
</html>
`;
}

/**
 * Self-contained prompt-diff HTML report (inline CSS, no CDN, no external fonts/scripts).
 * Safe for untrusted prompt text: all user/content fields are HTML-escaped.
 */
export function formatHtml(result: PromptDiffResult, options: HtmlFormatOptions): string {
  const locale = options.locale ?? "en";
  const strings = getLocaleStrings(locale);
  const chrome = chromeFor(locale);
  const tokens = options.tokens !== false;
  const tone = toneFor(result.risk.level);
  const title = `prompt-diff · ${result.risk.score}/100 · ${result.risk.level}`;
  const meta = [
    `${strings.version}${packageVersion()}`,
    options.oldLabel,
    options.newLabel,
  ].join(" · ");

  const body = `<header class="top">
  <h1>prompt-diff</h1>
  <div class="meta">${escapeHtml(meta)}</div>
</header>
<section class="hero">
  <p class="kicker">${escapeHtml(chrome.kicker)}</p>
  <div class="score tone-${tone}">${result.risk.score}/100</div>
  <div class="label">${escapeHtml(strings.risk)} · ${escapeHtml(result.risk.level)}</div>
  ${scoreBar(result.risk.score, tone)}
  <div class="chips">
    <span class="chip tone-${tone}">${escapeHtml(result.risk.level)}</span>
    <span class="chip">${escapeHtml(options.oldLabel)} → ${escapeHtml(options.newLabel)}</span>
  </div>
</section>
${pairBodyHtml(result, { tokens, semanticRisk: options.semanticRisk }, locale)}`;

  return wrapPage({ locale, title, body, footer: chrome.footer });
}

/**
 * Self-contained suite HTML report. Pair errors and prompt text are escaped.
 */
export function formatSuiteHtml(report: SuiteReport, options: SuiteHtmlFormatOptions = {}): string {
  const locale = options.locale ?? "en";
  const strings = getLocaleStrings(locale);
  const chrome = chromeFor(locale);
  const tokens = options.tokens !== false;
  const maxTone = toneFor(
    report.stats.maxScore >= 70
      ? "critical"
      : report.stats.maxScore >= 45
        ? "high"
        : report.stats.maxScore >= 20
          ? "medium"
          : "low",
  );
  const title = `prompt-diff · ${chrome.suite} · ${report.stats.maxScore}/100`;
  const failed = report.stats.failed
    ? ` · ${chrome.failed} ${report.stats.failed}`
    : "";
  const meta = [
    `${strings.version}${packageVersion()}`,
    `${report.stats.count} ${chrome.pairs}`,
    `${chrome.maxScore} ${report.stats.maxScore}`,
    `${chrome.avgScore} ${report.stats.avgScore}${failed}`,
  ].join(" · ");

  const cards = report.pairs
    .map((pair) => {
      if (pair.error || !pair.result) {
        return `<article class="panel">
  <h2>${escapeHtml(chrome.pair)} · ${escapeHtml(pair.id)}</h2>
  <p class="error">${escapeHtml(chrome.error)}: ${escapeHtml(pair.error ?? "unknown")}</p>
  <p class="empty">${escapeHtml(pair.old)} → ${escapeHtml(pair.new)}</p>
</article>`;
      }
      const tone = toneFor(pair.result.risk.level);
      return `<article class="panel">
  <h2>${escapeHtml(chrome.pair)} · ${escapeHtml(pair.id)}</h2>
  <div class="chips">
    <span class="chip tone-${tone}">${pair.result.risk.score}/100 · ${escapeHtml(pair.result.risk.level)}</span>
    <span class="chip">${escapeHtml(pair.old)} → ${escapeHtml(pair.new)}</span>
  </div>
  ${pairBodyHtml(pair.result, { tokens }, locale)}
</article>`;
    })
    .join("\n");

  const body = `<header class="top">
  <h1>prompt-diff · ${escapeHtml(chrome.suite)}</h1>
  <div class="meta">${escapeHtml(meta)}</div>
</header>
<section class="hero">
  <p class="kicker">${escapeHtml(chrome.suite)}</p>
  <div class="score tone-${maxTone}">${report.stats.maxScore}/100</div>
  <div class="label">${escapeHtml(chrome.maxScore)} · ${escapeHtml(chrome.avgScore)} ${report.stats.avgScore} · ${report.stats.count} ${escapeHtml(chrome.pairs)}</div>
  ${scoreBar(report.stats.maxScore, maxTone)}
</section>
${cards}`;

  return wrapPage({ locale, title, body, footer: chrome.footer });
}
