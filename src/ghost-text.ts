import {
  ViewPlugin,
  ViewUpdate,
  EditorView,
  Decoration,
  WidgetType,
  keymap,
} from "@codemirror/view";
import {
  StateEffect,
  StateField,
  Text,
  Prec,
  EditorSelection,
  Extension,
  TransactionSpec,
} from "@codemirror/state";
import { stripLinePrefix } from "./modes";

export type TriggerMode = "onDemand" | "onLeave" | "typing";

// What the engine needs from the host plugin. Kept as getters so settings
// changes take effect without rebuilding the editor extension.
export interface CorrectionConfig {
  // Transform a piece of text. For line corrections the markdown prefix is
  // already stripped; for a selection `multiline` is true. Returns the rewritten
  // text (WITHOUT any re-applied prefix), or null to skip.
  correct: (content: string, multiline: boolean) => Promise<string | null>;
  getTriggerMode: () => TriggerMode;
  getDelay: () => number;
  isEnabled: () => boolean;
  onError?: (e: unknown) => void;
  // Called only for an explicit (manual) request that produced no preview
  // because the text was already fine. Automatic triggers stay silent.
  onNoChange?: () => void;
}

// --- State + preview decoration ---

// A suggestion is the full replacement for the range [from, to]; `anchor` is the
// end-of-line position where the preview block is rendered.
export const SuggestionEffect = StateEffect.define<{
  text: string;
  from: number;
  to: number;
  doc: Text;
}>();

export const ClearSuggestionEffect = StateEffect.define<null>();

// Rendered as a block widget so the corrected text sits on its own line below
// the source — outside the .cm-line box, so its spacing is fully controlled by
// the .ai-correction-ghost CSS rather than the editor's line layout.
class CorrectionWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: CorrectionWidget) {
    return other.text === this.text;
  }

  toDOM() {
    const el = document.createElement("div");
    el.className = "ai-correction-ghost";
    el.textContent = this.text;
    return el;
  }
}

interface SuggestionState {
  text: string | null;
  anchor: number;
  from: number;
  to: number;
}

const EMPTY_SUGGESTION: SuggestionState = {
  text: null,
  anchor: 0,
  from: 0,
  to: 0,
};

export const SuggestionField = StateField.define<SuggestionState>({
  create() {
    return EMPTY_SUGGESTION;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(ClearSuggestionEffect)) return EMPTY_SUGGESTION;
    }

    for (const effect of tr.effects) {
      if (effect.is(SuggestionEffect)) {
        // Only accept if the doc has not changed since the request was sent.
        if (tr.state.doc === effect.value.doc) {
          const { text, from, to, doc } = effect.value;
          return { text, from, to, anchor: doc.lineAt(to).to };
        }
      }
    }

    // Any later doc change or cursor move dismisses the preview.
    if (tr.docChanged || tr.selection) return EMPTY_SUGGESTION;

    return value;
  },
  // Block decorations must be provided from the state, not a view plugin.
  provide: (field) =>
    EditorView.decorations.from(field, (value) =>
      value.text == null
        ? Decoration.none
        : Decoration.set([
            Decoration.widget({
              widget: new CorrectionWidget(value.text),
              block: true,
              side: 1,
            }).range(value.anchor),
          ])
    ),
});

// --- Accept / Dismiss ---

function acceptSuggestion(view: EditorView): boolean {
  const { text, from, to } = view.state.field(SuggestionField);
  if (text == null) return false;

  const head = view.state.selection.main.head;
  const spec: TransactionSpec = {
    changes: { from, to, insert: text },
    userEvent: "input.complete",
  };
  // If the cursor sits on the line being corrected, drop it at the end of the
  // new text so you can keep writing. If it is elsewhere (e.g. the "on leave"
  // trigger already moved you to the next line), leave the selection out so
  // CodeMirror maps it through the change and you stay where you are.
  if (head >= from && head <= to) {
    spec.selection = EditorSelection.cursor(from + text.length);
  }
  view.dispatch(spec);
  return true;
}

function dismissSuggestion(view: EditorView): boolean {
  if (view.state.field(SuggestionField).text == null) return false;
  view.dispatch({ effects: ClearSuggestionEffect.of(null) });
  return true;
}

// --- Configurable keymap ---

// Parse a key spec, falling back to `fallback` when the spec is empty or only
// whitespace/separators (so clearing the field never disables the action).
function parseKeys(spec: string, fallback: string): string[] {
  const keys = spec
    .split(/[,\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  return keys.length ? keys : fallback.split(/[,\s]+/);
}

function buildCorrectionKeymap(
  acceptKeys: string,
  dismissKeys: string
): Extension {
  const bindings = [
    ...parseKeys(acceptKeys, "Tab").map((key) => ({
      key,
      run: acceptSuggestion,
    })),
    ...parseKeys(dismissKeys, "Escape").map((key) => ({
      key,
      run: dismissSuggestion,
    })),
  ];
  return Prec.highest(keymap.of(bindings));
}

// --- Core: request a correction for a range and show the preview ---

interface Target {
  from: number;
  to: number;
  content: string;
  prefix: string;
  multiline: boolean;
}

function lineTarget(view: EditorView, lineNumber: number): Target | null {
  const doc = view.state.doc;
  if (lineNumber < 1 || lineNumber > doc.lines) return null;
  const line = doc.line(lineNumber);
  const { prefix, content } = stripLinePrefix(line.text);
  return { from: line.from, to: line.to, content, prefix, multiline: false };
}

async function showCorrection(
  view: EditorView,
  target: Target,
  config: CorrectionConfig,
  manual = false
): Promise<void> {
  if (!config.isEnabled()) return;
  // Skip empty / whitespace-only ranges (e.g. blank lines).
  if (target.content.trim().length === 0) return;

  const doc = view.state.doc;
  try {
    const transformed = await config.correct(target.content, target.multiline);
    if (transformed == null) return;
    // Nothing meaningful changed — don't bother the user with a preview, but
    // let an explicit request acknowledge that it ran (and found nothing).
    if (transformed.trim() === target.content.trim()) {
      if (manual) config.onNoChange?.();
      return;
    }

    view.dispatch({
      effects: SuggestionEffect.of({
        text: target.prefix + transformed,
        from: target.from,
        to: target.to,
        doc,
      }),
    });
  } catch (e) {
    config.onError?.(e);
  }
}

// --- Automatic trigger plugin (onLeave / typing) ---

function createTriggerPlugin(config: CorrectionConfig) {
  return ViewPlugin.fromClass(
    class {
      private timer: ReturnType<typeof setTimeout> | null = null;
      private lastLine = -1;
      private dirty = false;

      update(update: ViewUpdate) {
        const mode = config.getTriggerMode();
        if (mode === "onDemand") return;
        if (!update.docChanged && !update.selectionSet) return;

        const view = update.view;
        const currentLine = update.state.doc.lineAt(
          update.state.selection.main.head
        ).number;

        if (mode === "typing") {
          if (update.docChanged) this.schedule(view, currentLine);
          return;
        }

        // onLeave: only correct a line you actually edited, and only once you
        // move off it. Plain navigation (arrows, clicks) never fires.
        if (currentLine === this.lastLine) {
          if (update.docChanged) this.dirty = true;
          return;
        }
        const leftLine = this.lastLine;
        const leftDirty = this.dirty;
        this.lastLine = currentLine;
        this.dirty = false;
        if (leftLine !== -1 && leftDirty) this.schedule(view, leftLine);
      }

      private schedule(view: EditorView, lineNumber: number) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          const target = lineTarget(view, lineNumber);
          if (target) void showCorrection(view, target, config);
        }, config.getDelay());
      }

      destroy() {
        if (this.timer) clearTimeout(this.timer);
      }
    }
  );
}

// --- Public API ---

// On-demand entry point used by commands. With a selection it rewrites the whole
// selection (multi-line allowed); otherwise it corrects the current line.
export function triggerCurrent(
  view: EditorView,
  config: CorrectionConfig
): Promise<void> {
  const sel = view.state.selection.main;
  if (!sel.empty) {
    return showCorrection(
      view,
      {
        from: sel.from,
        to: sel.to,
        content: view.state.sliceDoc(sel.from, sel.to),
        prefix: "",
        multiline: true,
      },
      config,
      true
    );
  }
  const lineNumber = view.state.doc.lineAt(sel.head).number;
  const target = lineTarget(view, lineNumber);
  return target ? showCorrection(view, target, config, true) : Promise.resolve();
}

export function correctionExtension(
  config: CorrectionConfig,
  acceptKeys: string,
  dismissKeys: string
): Extension[] {
  return [
    SuggestionField,
    createTriggerPlugin(config),
    buildCorrectionKeymap(acceptKeys, dismissKeys),
  ];
}
