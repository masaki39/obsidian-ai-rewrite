import { requestUrl } from "obsidian";

export const OPENROUTER_API_URL =
  "https://openrouter.ai/api/v1/chat/completions";

export const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are a writing assistant for an Obsidian note-taking app. Your job is to continue writing from where the user left off.

Rules:
- Output ONLY the continuation text. Do not repeat any existing text.
- Keep the same language (Chinese/English) as the context.
- Keep the same writing style and tone.
- Keep it concise: 1-2 sentences max for prose, 1-3 lines for lists/code.
- If the context is a markdown list, continue the list pattern.
- If the context is a code block, continue the code.
- If the context ends mid-sentence, complete the sentence.
- Do not add markdown formatting unless continuing an existing pattern.
- Do not add explanations or meta-commentary.`;

export interface CompletionRequestOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  reasoningEffort?: string;
  excludeReasoning?: boolean;
  providerOnly?: string;
  providerSort?: string;
  allowFallbacks?: boolean;
  httpReferer?: string;
  appTitle?: string;
}

export class CompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompletionError";
  }
}

function normalizeChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return OPENROUTER_API_URL;
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/")) return `${trimmed}chat/completions`;
  return `${trimmed}/chat/completions`;
}

function getProviderPreferences(options: CompletionRequestOptions) {
  const provider: Record<string, unknown> = {};

  if (options.providerOnly?.trim()) {
    provider.only = [options.providerOnly.trim()];
  }

  if (options.providerSort?.trim()) {
    provider.sort = options.providerSort.trim();
  }

  if (options.allowFallbacks === false) {
    provider.allow_fallbacks = false;
  }

  return Object.keys(provider).length > 0 ? provider : undefined;
}

function getReasoningPreferences(options: CompletionRequestOptions) {
  const effort = options.reasoningEffort?.trim();
  if (!effort) return undefined;

  return {
    effort,
    exclude: options.excludeReasoning !== false,
  };
}

export async function fetchCompletion(
  options: CompletionRequestOptions,
  prefix: string,
  suffix: string
): Promise<string | null> {
  const userMessage =
    suffix.trim().length > 0
      ? `Context before cursor:\n${prefix}\n\nContext after cursor:\n${suffix}\n\nContinue writing from where the cursor is:`
      : `${prefix}`;

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    };

    if (options.httpReferer?.trim()) {
      headers["HTTP-Referer"] = options.httpReferer.trim();
    }

    if (options.appTitle?.trim()) {
      headers["X-OpenRouter-Title"] = options.appTitle.trim();
    }

    const provider = getProviderPreferences(options);
    const reasoning = getReasoningPreferences(options);

    const response = await requestUrl({
      url: normalizeChatCompletionsUrl(options.baseUrl),
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        ...(provider ? { provider } : {}),
        ...(reasoning ? { reasoning } : {}),
        max_tokens: 150,
        temperature: 0.3,
        stop: ["\n\n", "---"],
      }),
    });

    const data = response.json;
    if (data?.error?.message) {
      throw new CompletionError(String(data.error.message));
    }

    const text = data?.choices?.[0]?.message?.content;
    return text?.trim() || null;
  } catch (e) {
    if (e instanceof CompletionError) throw e;
    if (e instanceof Error) {
      throw new CompletionError(e.message);
    }
    throw new CompletionError("Unknown completion error");
  }
}
