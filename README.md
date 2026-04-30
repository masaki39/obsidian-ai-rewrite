# AI Autocomplete

AI inline writing completion for Obsidian, powered by [Groq](https://groq.com).

Type naturally and get ghost text suggestions that appear inline. Press **Tab** to accept, **Esc** to dismiss.

## Features

- **Ghost text completion** — transparent suggestions appear at your cursor, like GitHub Copilot
- **Context-aware** — reads text before and after cursor for coherent continuations
- **Fast** — powered by Groq's ultra-low-latency inference (Llama 3.3 70B)
- **Bilingual** — automatically detects and continues in Chinese or English
- **Lightweight** — 6KB plugin, no dependencies

## Usage

1. Install the plugin
2. Go to Settings → AI Autocomplete → enter your Groq API key (get one free at [console.groq.com](https://console.groq.com))
3. Start writing — suggestions appear after a brief pause

| Key | Action |
|-----|--------|
| Tab | Accept suggestion |
| Esc | Dismiss suggestion |
| Keep typing | Suggestion auto-dismisses |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Model | Llama 3.3 70B | Also supports Llama 3.1 8B (faster), Gemma 2 9B, Mixtral 8x7B |
| Trigger delay | 800ms | How long to wait after typing before fetching a suggestion |
| Enabled | On | Toggle via settings or command palette |

## How it works

The plugin uses CodeMirror 6 extensions to render transparent "ghost text" at the cursor position. When you pause typing, it sends the surrounding context (up to 2000 chars before + 500 chars after cursor) to Groq's API and displays the completion as inline ghost text.

## License

MIT
