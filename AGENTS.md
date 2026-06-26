# AI Rewrite — Obsidian community plugin

## Project overview

- **AI Rewrite** (plugin id `ai-rewrite`): local-first, line-level AI rewriting for Obsidian (proofread / translate / custom modes) powered by OpenAI-compatible models (Ollama by default).
- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `src/main.ts`, bundled by esbuild into `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json` (and `styles.css` if non-empty).

## Environment & tooling

- Node.js: Node 22+ (the pinned `packageManager` pnpm needs Node ≥ 22.13; CI uses Node 22).
- **Package manager: pnpm** (`pnpm-lock.yaml` is the lockfile; `preinstall` enforces pnpm via `only-allow`). Always use `pnpm install`, `pnpm run build`, etc. Never commit `package-lock.json` / `yarn.lock`.
- **Bundler: esbuild** (`esbuild.config.mjs`). `obsidian`, `electron`, and the CodeMirror packages are marked external (provided by Obsidian at runtime).
- Types: `obsidian` type definitions.
- esbuild needs a build-approval to run its postinstall; see `pnpm-workspace.yaml` (`allowBuilds: esbuild`).

### Install

```bash
pnpm install
```

### Dev (watch, non-minified, inline sourcemaps)

```bash
pnpm run dev
```

### Production build (type-check + minified `main.js`)

```bash
pnpm run build
```

### Lint

```bash
pnpm run lint
```

Linting uses ESLint flat config (`eslint.config.mts`) with `eslint-plugin-obsidianmd`. CI runs build + lint on every push/PR (`.github/workflows/lint.yml`).

## File & folder conventions

- **Organize code into multiple files** under `src/`. Keep `main.ts` focused on plugin lifecycle (load, unload, registering commands/settings).
- Current modules:
  ```
  src/
    main.ts          # Plugin entry point, lifecycle, command/settings registration
    api.ts           # OpenAI-compatible request handling
    ghost-text.ts    # CodeMirror ghost preview (Tab to apply / Esc to dismiss)
    links.ts         # Auto-linking to existing vault notes
    modes.ts         # Rewrite modes (proofread / translate / custom)
  ```
- **Do not commit build artifacts**: `node_modules/`, `main.js`, and `data.json` are gitignored. They must never be committed.
- Keep the plugin small. Prefer browser-compatible packages.
- Release artifacts (`main.js`, `manifest.json`, `styles.css`) are produced by CI and attached to the GitHub release — not committed.

## Manifest rules (`manifest.json`)

- Must include: `id`, `name`, `version` (SemVer `x.y.z`), `minAppVersion`, `description`, `isDesktopOnly`. Optional: `author`, `authorUrl`, `fundingUrl`.
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Commands & settings

- Add user-facing commands via `this.addCommand(...)` with stable IDs (don't rename once released).
- Persist settings via `this.loadData()` / `this.saveData()`; provide sensible defaults and validation.

## Versioning & releases

The release pipeline is tag-driven: pushing a tag whose name equals the version (no leading `v`) triggers `.github/workflows/release.yml`, which builds with pnpm and creates a GitHub release. If a matching `changelog/<tag>.md` exists, it is used as the release notes.

To cut a release:

1. **Write the changelog** for the next version: `changelog/<version>.md` (see convention below) and commit it.
2. **Bump the version**:
   ```bash
   pnpm version patch   # or minor / major
   ```
   This bumps `package.json`, runs the `version` script (`version-bump.mjs`) to sync `manifest.json` + `versions.json`, stages them, then commits and tags. `.npmrc` sets `tag-version-prefix=""` so the tag has **no** leading `v` (e.g. `0.0.2`).
3. **Push with the tag**:
   ```bash
   git push --follow-tags
   ```
   The release workflow then builds and publishes the release with `main.js` + `manifest.json` (+ `styles.css` if present).

Notes:
- `versions.json` maps each plugin version → minimum app version; `version-bump.mjs` keeps it in sync from `manifest.json`'s `minAppVersion`.
- Tags must **exactly** match `manifest.json`'s `version`, with no `v` prefix.
- The workflow file must exist in the tagged commit, so commit workflow/changelog changes before tagging.

### Changelog

- One Markdown file per version under `changelog/`: `changelog/<version>.md` (e.g. `changelog/0.0.2.md`). Do **not** add or maintain a `CHANGELOG.md` at the repo root.
- Each file starts with a `## What's Changed` heading, followed by `###` sections such as `Bug Fixes`, `New Features`, `Added`, `Changed`, `Removed`.
- Bullets are written in **English** with a bold lead-in summarizing the change, then a colon and detail. Example:
  ```markdown
  ## What's Changed

  ### Bug Fixes

  - **Fix ghost preview not clearing**: after replacing a selection, the preview...
  ```

## Security, privacy, and compliance

Follow Obsidian's Developer Policies and Plugin Guidelines:

- Default to local/offline operation. This plugin defaults to a local Ollama endpoint; only sends note content over the network when the user points the Base URL at a remote service. Disclose this clearly in `README.md` and settings.
- No hidden telemetry. Any third-party service use requires explicit opt-in and documentation.
- Never execute remote code or auto-update plugin code outside normal releases.
- Read/write only what's necessary inside the vault. Don't access files outside the vault.
- Register and clean up all DOM, app, and interval listeners via `this.register*` helpers so the plugin unloads safely.

## UX & copy guidelines (UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives.
- Use **bold** for literal UI labels; prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and jargon-free.

## Performance

- Keep startup light; defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Debounce/throttle expensive operations triggered by editor/file events.

## Coding conventions

- TypeScript with `"strict": true` preferred (`strictNullChecks` is on in `tsconfig.json`).
- Keep `main.ts` focused on lifecycle; delegate feature logic to modules.
- Split files that grow past ~200–300 lines into smaller, single-responsibility modules.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs to keep mobile compatibility (`isDesktopOnly` is `false`).
- Prefer `async/await`; handle errors gracefully.

## Agent do/don't

**Do**
- Add commands with stable IDs.
- Provide defaults and validation in settings.
- Write idempotent load/unload paths; use `this.register*` for anything needing cleanup.

**Don't**
- Introduce network calls without an obvious user-facing reason and documentation.
- Store or transmit vault contents unless essential and consented.
- Commit `main.js`, `data.json`, or non-pnpm lockfiles.

## Testing

- Manual install for testing: copy `main.js`, `manifest.json` (and `styles.css` if any) to:
  ```
  <Vault>/.obsidian/plugins/ai-rewrite/
  ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Troubleshooting

- Plugin doesn't load: ensure `main.js` and `manifest.json` are at the top level of `<Vault>/.obsidian/plugins/ai-rewrite/`.
- Build issues: run `pnpm run build` (or `pnpm run dev`) to recompile.
- Commands not appearing: verify `addCommand` runs in `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and the UI re-renders after changes.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
