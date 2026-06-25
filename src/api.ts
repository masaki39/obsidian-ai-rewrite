import { requestUrl } from "obsidian";

export const OLLAMA_API_URL = "http://localhost:11434/v1";

export interface CompletionRequestOptions {
  model: string;
  baseUrl: string;
  // Optional bearer token for authenticated OpenAI-compatible endpoints. Local
  // servers (Ollama, LM Studio, …) don't need it, so it's left blank by default.
  apiKey?: string;
}

export class CompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompletionError";
  }
}

function normalizeChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return `${OLLAMA_API_URL}/chat/completions`;
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/")) return `${trimmed}chat/completions`;
  return `${trimmed}/chat/completions`;
}

// Transform a piece of text (the current line with its markdown prefix stripped,
// or a multi-line selection) according to the active mode's system prompt.
// `multiline` lifts the single-line constraints so a selection can span lines.
export async function fetchTransform(
  options: CompletionRequestOptions,
  systemPrompt: string,
  content: string,
  multiline = false
): Promise<string | null> {
  try {
    const apiKey = options.apiKey?.trim();
    const response = await requestUrl({
      url: normalizeChatCompletionsUrl(options.baseUrl),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
        temperature: 0,
        // content.length * 2 is a safe upper bound on output tokens (even for
        // CJK); the cap only guards against pathological input. Long lines are
        // sent whole and rewritten whole — no truncation for normal paragraphs.
        max_tokens: Math.min(
          multiline ? 4096 : 2048,
          content.length * 2 + 64
        ),
        // Single-line transforms stop at the first newline; selections may not.
        ...(multiline ? {} : { stop: ["\n"] }),
      }),
    });

    const data = response.json;
    if (data?.error?.message) {
      throw new CompletionError(String(data.error.message));
    }

    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;
    const normalized = text.replace(/^["']|["']$/g, "").trim();
    return normalized || null;
  } catch (e) {
    if (e instanceof CompletionError) throw e;
    if (e instanceof Error) {
      throw new CompletionError(e.message);
    }
    throw new CompletionError("Unknown completion error");
  }
}
