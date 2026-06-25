# AI Rewrite

Local-first, **line-level** AI writing assistance for Obsidian, built for
[Ollama](https://ollama.com). Instead of guessing what you'll write next, it
rewrites the **current line** (or a selection) — proofread or translate — and
shows the result as a ghost preview on the line below. Press **Tab** to apply,
**Esc** to dismiss.

Text correction is a much easier task for lightweight models (e.g. `gemma3`) than
open-ended continuation, and on-demand triggering keeps your machine cool.

## How it works

```
your line (with a typo)        →  trigger (hotkey / on leave / while typing)
今日わ会議がありした               →  ghost preview appears below
今日は会議がありました              →  Tab applies it · Esc dismisses
```

For a line, the plugin strips the markdown prefix (indentation, `- `, `> `, `# `,
`1. `, `- [ ] `…) so the model only sees prose, then re-applies the prefix to the
result — bullets, quotes and headings are preserved. Blank lines are skipped.

With an active **selection**, it rewrites the whole selection (multiple lines
allowed) and replaces it on accept.

## Modes

Modes are just editable instructions. Two ship by default:

| Mode | What it does |
|------|--------------|
| **Proofread** | Fix spelling, grammar, punctuation and typos, and polish the wording — same language and meaning |
| **Translate** | Translate into your target language |

- The active mode shows in the **status bar** — click it to pick another from a menu.
- **Cycle mode** command switches to the next mode (bindable to a hotkey).
- Each mode also gets its own command — search **"Apply"** in Settings → Hotkeys to bind e.g. `Apply Translate to current line or selection`. A per-mode hotkey switches mode *and* corrects in one press.
- Add your own modes in Settings (name + prompt). Use `{targetLang}` in a prompt to make it use the Target language setting.

## Triggers

Choose in Settings → **Trigger**:

| Trigger | Behavior | Best for |
|---------|----------|----------|
| **On demand** | Only when you run a command/hotkey | Lowest CPU, least noise (recommended) |
| **When leaving a line** | Fires after you move off a line | Hands-off proofreading |
| **While typing** | Fires after each pause | Most eager (warmest) |

## Keys

| Key | Action |
|-----|--------|
| Tab / → | Apply the suggestion |
| Esc | Dismiss the suggestion |

Accept/dismiss keys are configurable in Settings (space-separated). They only
intercept the key while a preview is showing; otherwise the key behaves normally.

### Key name reference

Use CodeMirror key names. Combine a modifier and a key with `-`, and list
multiple bindings separated by spaces.

| Type | Names |
|------|-------|
| Named keys | `Tab` · `Enter` · `Escape` · `Backspace` · `Delete` · `Space` |
| Arrows | `ArrowUp` · `ArrowDown` · `ArrowLeft` · `ArrowRight` |
| Letters / digits | `a`–`z` · `0`–`9` · `F1`–`F12` |
| Modifiers | `Mod-` (Cmd on macOS, Ctrl elsewhere — best for cross-platform) · `Ctrl-` · `Shift-` · `Alt-` · `Cmd-` / `Meta-` |

Examples: `Tab ArrowRight` (accept on either) · `Escape` · `Ctrl-Space` ·
`Mod-Enter` · `Shift-Tab`.

## Setup

1. Install [Ollama](https://ollama.com) and pull a model: `ollama pull gemma3`
2. Make sure Ollama is running (`ollama serve`; usually automatic)
3. Enable the plugin. It defaults to `http://localhost:11434/v1` with model
   `gemma3` — change the **Model** in Settings if you pulled a different one.

Any OpenAI-compatible server works too — point **Base URL** at it in Settings:

- **Local, no auth** (LM Studio, vLLM, …): just set the Base URL.
- **Remote, authenticated** (OpenAI, OpenRouter, …): set the Base URL and the
  **API key**. The key is sent as a `Bearer` token. Note this sends your note
  content to that service, so it is no longer local-only.

The status bar shows a `⟳` while a request is in flight. Each request gives up
after the **Request timeout** (Settings, default 30s) so a stalled model can't
silently jam later suggestions — raise it if a slow model's first response
(while it loads) gets cut off.

## Development

This project uses [pnpm](https://pnpm.io).

```bash
pnpm install   # install dependencies
pnpm dev       # development build (non-minified, inline sourcemaps)
pnpm build     # production build -> main.js (minified)
```

## License

MIT
