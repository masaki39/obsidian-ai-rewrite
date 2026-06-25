# AI Autocomplete

AI inline writing completion for Obsidian, powered by OpenAI-compatible APIs. The default setup routes through [OpenRouter](https://openrouter.ai) to the Groq provider for fast inference.

Type naturally and get ghost text suggestions that appear inline. Press **Tab** to accept, **Esc** to dismiss.

## Features

- **Ghost text completion** — transparent suggestions appear at your cursor, like GitHub Copilot
- **Context-aware** — reads text before and after cursor for coherent continuations
- **Continuation-first** — picks up the current sentence naturally instead of inserting unrelated commentary
- **Fast** — defaults to OpenRouter's Groq provider with throughput-prioritized routing
- **Multilingual** — continues in the same language as your note (Japanese, Chinese, English, …)
- **Lightweight** — 6KB plugin, no dependencies

## Usage

1. Install the plugin
2. Go to Settings → AI Autocomplete → enter your OpenRouter API key
3. Start writing — suggestions appear after a brief pause

| Key | Action |
|-----|--------|
| Tab | Accept suggestion |
| Esc | Dismiss suggestion |
| Keep typing | Suggestion auto-dismisses |

## Use a local Ollama model (gemma3)

You can run everything locally with [Ollama](https://ollama.com) — no API key, no cloud.

1. Install Ollama, then pull the model: `ollama pull gemma3`
2. Make sure Ollama is running (`ollama serve`; it usually starts automatically)
3. In Settings → AI Autocomplete, set **Provider preset** to **Ollama (local)**

The preset points the plugin at `http://localhost:11434/v1` with model `gemma3` and clears the cloud-only routing options. The API key field is ignored for Ollama. Switch the preset back to **OpenRouter (Groq)** at any time to restore the cloud defaults.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Provider preset | `OpenRouter (Groq)` | One-step switch between OpenRouter (Groq), Ollama (local), and Custom |
| API base URL | `https://openrouter.ai/api/v1/chat/completions` | Any OpenAI-compatible chat completions endpoint |
| Model | `openai/gpt-oss-120b:nitro` | Smart default via OpenRouter's Groq provider |
| System prompt | Built-in continuation prompt | Editable prompt; defaults to natural same-language continuation. Click **Reset prompt** to restore it |
| Reasoning effort | `minimal` | Keeps reasoning models fast enough for inline autocomplete |
| Hide reasoning | On | Excludes reasoning tokens from suggestion text |
| Provider | `groq` | Forces OpenRouter's Groq provider |
| Provider sort | `throughput` | Prioritizes high token throughput |
| Allow fallbacks | Off | Keeps requests on the selected provider |
| Trigger delay | 800ms | How long to wait after typing before fetching a suggestion |
| Enabled | On | Toggle via settings or command palette |

## How it works

The plugin uses CodeMirror 6 extensions to render transparent "ghost text" at the cursor position. When you pause typing, it sends the surrounding context (up to 2000 chars before + 500 chars after cursor) to the configured API and displays the completion as inline ghost text.

## Development

This project uses [pnpm](https://pnpm.io).

```bash
pnpm install   # install dependencies
pnpm dev       # development build (non-minified, inline sourcemaps)
pnpm build     # production build -> main.js (minified)
```

## License

MIT
