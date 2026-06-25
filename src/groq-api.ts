import { requestUrl } from "obsidian";

export const OPENROUTER_API_URL =
  "https://openrouter.ai/api/v1/chat/completions";

export const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export const OLLAMA_API_URL = "http://localhost:11434/v1";

export const NO_SUGGESTION = "NO_SUGGESTION";

export const DEFAULT_SYSTEM_PROMPT = `You complete the user's note at the cursor, like GitHub Copilot. Output ONLY the text to insert.

Rules:
- Same language as the text before the cursor. Japanese in -> Japanese out. Never switch to English.
- Continue directly: if the last sentence is unfinished, finish it; otherwise add one short natural sentence.
- Never repeat text that is already before or after the cursor.
- The text before the cursor already ends with its bullets and indentation. Write ONLY the new content, never a "- " or spaces at the start.
- For code, output valid code only.
- Empty, greeting, or a random fragment -> output exactly: NO_SUGGESTION

Examples:
Before: 今日は朝から雨が降っていて、家で
Insert: 本を読んで過ごした。

Before: 買い物リスト
- 牛乳
- 卵
-
Insert: パン

Before: tags:
  -
Insert: 会議`;

export interface CompletionRequestOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  systemPrompt?: string;
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
  const only = options.providerOnly?.trim();
  const sort = options.providerSort?.trim();

  // OpenRouter-only routing hints. Skip entirely when no provider/sort is set
  // (e.g. Ollama or other plain OpenAI-compatible endpoints) so we never send
  // an unsupported `provider` field.
  if (!only && !sort) return undefined;

  const provider: Record<string, unknown> = {};

  if (only) {
    provider.only = [only];
  }

  if (sort) {
    provider.sort = sort;
  }

  if (options.allowFallbacks === false) {
    provider.allow_fallbacks = false;
  }

  return provider;
}

function getReasoningPreferences(options: CompletionRequestOptions) {
  const effort = options.reasoningEffort?.trim();
  if (!effort) return undefined;

  return {
    effort,
    exclude: options.excludeReasoning !== false,
  };
}

// Small local models (e.g. gemma3 4B) tend to echo the list marker when the
// current line is an empty bullet (line ends in "- "), producing "- - item"
// after insertion. If the cursor line is just an unfilled bullet, strip a
// leading marker the model may have repeated.
function stripRedundantListMarker(prefix: string, text: string): string {
  const currentLine = prefix.slice(prefix.lastIndexOf("\n") + 1);
  if (!/^\s*([-*+]|\d+[.)])\s*$/.test(currentLine)) return text;
  return text.replace(/^([-*+]|\d+[.)])[ \t]+/, "");
}

export async function fetchCompletion(
  options: CompletionRequestOptions,
  prefix: string,
  suffix: string
): Promise<string | null> {
  const systemPrompt = options.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const userMessage = `<before_cursor>
${prefix}
</before_cursor>

<after_cursor>
${suffix}
</after_cursor>

Return only the text to insert at the cursor, continuing in the same language as the text before the cursor. Do not repeat text that already appears before or after the cursor.`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Local endpoints like Ollama do not need an API key.
    if (options.apiKey?.trim()) {
      headers.Authorization = `Bearer ${options.apiKey.trim()}`;
    }

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
          { role: "system", content: systemPrompt },
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

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const normalizedText = text.replace(/^["']|["']$/g, "").trim();
    if (!normalizedText || normalizedText.toUpperCase() === NO_SUGGESTION) {
      return null;
    }
    return stripRedundantListMarker(prefix, normalizedText);
  } catch (e) {
    if (e instanceof CompletionError) throw e;
    if (e instanceof Error) {
      throw new CompletionError(e.message);
    }
    throw new CompletionError("Unknown completion error");
  }
}
