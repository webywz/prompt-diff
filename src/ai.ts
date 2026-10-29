const MAX_EACH = 6000;
const TIMEOUT_MS = 15_000;

function clip(text: string): string {
  if (text.length <= MAX_EACH) return text;
  return `${text.slice(0, MAX_EACH)}\n…[truncated]`;
}

function buildUserMessage(oldText: string, newText: string): string {
  return [
    "Compare these two LLM system/user prompts.",
    "Write one short paragraph on the semantic regression risk of shipping the NEW prompt:",
    "intent shift, missing constraints/safety, tool or schema changes, and likely behavior change.",
    "Be concrete. Do not repeat the prompts. Do not use bullet lists.",
    "",
    "OLD:",
    clip(oldText),
    "",
    "NEW:",
    clip(newText),
  ].join("\n");
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        ac.signal.addEventListener("abort", () => reject(new Error("AI request timed out")));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fromOpenAI(apiKey: string, oldText: string, newText: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: "You are a terse prompt-regression reviewer for software engineers.",
        },
        { role: "user", content: buildUserMessage(oldText, newText) },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned an empty completion");
  return text;
}

async function fromAnthropic(apiKey: string, oldText: string, newText: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 220,
      temperature: 0.2,
      messages: [{ role: "user", content: buildUserMessage(oldText, newText) }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = body.content?.find((b) => b.type === "text")?.text?.trim();
  if (!text) throw new Error("Anthropic returned an empty message");
  return text;
}

export type AiProvider = "openai" | "anthropic";

export function detectAiProvider(
  env: NodeJS.ProcessEnv = process.env,
): { provider: AiProvider; apiKey: string } | undefined {
  const openai = env.OPENAI_API_KEY?.trim();
  if (openai) return { provider: "openai", apiKey: openai };
  const anthropic = env.ANTHROPIC_API_KEY?.trim();
  if (anthropic) return { provider: "anthropic", apiKey: anthropic };
  return undefined;
}

/** One short semantic-risk paragraph. Never required; heuristic path does not call this. */
export async function semanticRiskParagraph(
  oldText: string,
  newText: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const detected = detectAiProvider(env);
  if (!detected) {
    throw new Error("Set OPENAI_API_KEY or ANTHROPIC_API_KEY to use --ai");
  }
  const run =
    detected.provider === "openai"
      ? fromOpenAI(detected.apiKey, oldText, newText)
      : fromAnthropic(detected.apiKey, oldText, newText);
  return withTimeout(run, TIMEOUT_MS);
}
