// Thin wrapper around the Lovable AI gateway used by every pipeline stage.
//
// The gateway is OpenAI-compatible (chat/completions + tools), so the
// shape here mirrors OpenAI's tool-calling API. We keep all stage-specific
// concerns (system prompts, tool schemas, parsing) in the stage functions —
// this module only handles transport, retries, and error classification.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// JSON Schema for a tool's parameters. We intentionally use `any`-shaped JSON
// here because JSON Schema is recursive and Zod-derived JSON-schema types from
// npm would bloat the edge bundle for no real benefit.
// deno-lint-ignore no-explicit-any
export type ToolSchema = Record<string, any>;

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: ToolSchema;
  };
};

export type LLMCallOptions = {
  model?: string;
  messages: ChatMessage[];
  tool: ToolDef;
  /** Hard-cap single-request latency so the pipeline doesn't hang. */
  timeoutMs?: number;
};

export type LLMCallResult = {
  raw: unknown;
  model: string;
  toolArgs: unknown;
  usage: { tokens_in?: number; tokens_out?: number };
  durationMs: number;
};

export class LLMError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export async function callLLMTool(opts: LLMCallOptions): Promise<LLMCallResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new LLMError("LOVABLE_API_KEY not configured", 500, false);

  const model = opts.model ?? "google/gemini-3-flash-preview";
  const timeoutMs = opts.timeoutMs ?? 90_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  let res: Response;
  try {
    res = await fetch(GATEWAY_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        tools: [opts.tool],
        tool_choice: { type: "function", function: { name: opts.tool.function.name } },
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      throw new LLMError(`LLM call timed out after ${timeoutMs}ms`, 504, true);
    }
    throw new LLMError(`LLM fetch failed: ${(err as Error).message}`, 502, true);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    throw new LLMError(
      `AI gateway error ${res.status}`,
      res.status,
      retryable,
      text.slice(0, 1200),
    );
  }

  const json = (await res.json()) as Record<string, unknown>;
  const choices = (json.choices as Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>) ?? [];
  const toolCall = choices[0]?.message?.tool_calls?.[0];
  const argsStr = toolCall?.function?.arguments;
  if (!argsStr) {
    throw new LLMError("Model did not return a tool call", 502, true, json);
  }

  let toolArgs: unknown;
  try {
    toolArgs = JSON.parse(argsStr);
  } catch (_e) {
    throw new LLMError("Malformed tool-call arguments", 502, true, argsStr.slice(0, 400));
  }

  const usage = (json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined) ?? {};
  return {
    raw: json,
    model,
    toolArgs,
    usage: {
      tokens_in: usage.prompt_tokens,
      tokens_out: usage.completion_tokens,
    },
    durationMs: Date.now() - started,
  };
}
