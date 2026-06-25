import { requestUrl } from "obsidian";

export const OLLAMA_API_URL = "http://localhost:11434/v1";

// Default ceiling for a single request. Local CPU inference (especially the
// first call, while the model loads) can be slow, so this is generous; it only
// exists to keep a hung backend from blocking the request queue forever.
export const DEFAULT_TIMEOUT_MS = 30000;

export interface CompletionRequestOptions {
  model: string;
  baseUrl: string;
  // Optional bearer token for authenticated OpenAI-compatible endpoints. Local
  // servers (Ollama, LM Studio, …) don't need it, so it's left blank by default.
  apiKey?: string;
  // Reject the request after this many ms. `requestUrl` has no abort/timeout of
  // its own, so without this a stalled backend would leave the promise pending
  // and (via singleFlight) silently jam every later trigger until reload.
  timeoutMs?: number;
}

export class CompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompletionError";
  }
}

// Reject with a CompletionError if `promise` does not settle within `ms`. The
// underlying request cannot be aborted (requestUrl exposes no signal), so the
// orphaned call may still complete in the background; the point is only to free
// our own state machine so the next trigger can proceed and the error surfaces.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CompletionError(`Request timed out after ${ms} ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
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
    const response = await withTimeout(
      requestUrl({
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
          // Headroom for the output. The *3 factor leaves room for transforms
          // that grow the text — e.g. translating CJK into a more verbose
          // language — while the absolute cap still guards pathological input.
          // Single-line output is bounded by the newline stop anyway.
          max_tokens: Math.min(
            multiline ? 4096 : 2048,
            content.length * 3 + 128
          ),
          // Single-line transforms stop at the first newline; selections may not.
          ...(multiline ? {} : { stop: ["\n"] }),
        }),
      }),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

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
