import { Plugin, PluginSettingTab, App, Setting, Notice, Menu } from "obsidian";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  CorrectionConfig,
  TriggerMode,
  correctionExtension,
  triggerCurrent,
} from "./ghost-text";
import {
  CompletionError,
  CompletionRequestOptions,
  fetchTransform,
  OLLAMA_API_URL,
} from "./api";
import { DEFAULT_MODES, Mode, buildModePrompt } from "./modes";

interface AIRewriteSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  modes: Mode[];
  activeModeId: string;
  targetLang: string;
  triggerMode: TriggerMode;
  delay: number;
  acceptKeys: string;
  dismissKeys: string;
  enabled: boolean;
}

const DEFAULT_SETTINGS: AIRewriteSettings = {
  baseUrl: OLLAMA_API_URL,
  model: "gemma3",
  apiKey: "",
  modes: [],
  activeModeId: "proofread",
  targetLang: "English",
  triggerMode: "onDemand",
  delay: 800,
  acceptKeys: "Tab ArrowRight",
  dismissKeys: "Escape",
  enabled: true,
};

export default class AIRewritePlugin extends Plugin {
  settings: AIRewriteSettings = DEFAULT_SETTINGS;
  config!: CorrectionConfig;
  private editorExtensions: Extension[] = [];
  private statusBar: HTMLElement | null = null;
  private lastErrorNoticeAt = 0;

  async onload() {
    await this.loadSettings();

    this.config = {
      correct: (content, multiline) =>
        fetchTransform(
          this.getCompletionOptions(),
          buildModePrompt(this.getActiveMode(), this.settings.targetLang),
          content,
          multiline
        ),
      getTriggerMode: () => this.settings.triggerMode,
      getDelay: () => this.settings.delay,
      isEnabled: () => this.settings.enabled,
      onError: (e) => this.showCompletionError(e),
    };

    this.editorExtensions = this.buildExtensions();
    this.registerEditorExtension(this.editorExtensions);

    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("mod-clickable");
    this.statusBar.addEventListener("click", (e) => this.showModeMenu(e));
    this.updateStatusBar();

    this.addCommand({
      id: "correct-line",
      name: "Correct current line or selection",
      editorCallback: (editor) => {
        const view = (editor as unknown as { cm?: EditorView }).cm;
        if (view) void triggerCurrent(view, this.config);
      },
    });

    for (const mode of this.settings.modes) {
      this.addCommand({
        id: `apply-${mode.id}`,
        name: `Apply ${mode.name} to current line or selection`,
        editorCallback: (editor) => {
          void this.setActiveMode(mode.id);
          const view = (editor as unknown as { cm?: EditorView }).cm;
          if (view) void triggerCurrent(view, this.config);
        },
      });
    }

    this.addCommand({
      id: "cycle-mode",
      name: "Cycle mode",
      callback: () => this.cycleMode(),
    });

    this.addCommand({
      id: "toggle",
      name: "Toggle suggestions",
      callback: () => {
        this.settings.enabled = !this.settings.enabled;
        void this.saveSettings();
        new Notice(`AI suggestions: ${this.settings.enabled ? "on" : "off"}`);
      },
    });

    this.addCommand({
      id: "test-connection",
      name: "Test connection",
      callback: () => {
        void this.testConnection();
      },
    });

    this.addSettingTab(new AIRewriteSettingTab(this.app, this));
  }

  buildExtensions(): Extension[] {
    return correctionExtension(
      this.config,
      this.settings.acceptKeys,
      this.settings.dismissKeys
    );
  }

  // Rebuild the editor extension after the accept/dismiss keys change so the new
  // bindings apply to open editors without a reload.
  applyKeymapChange() {
    this.editorExtensions.length = 0;
    this.editorExtensions.push(...this.buildExtensions());
    this.app.workspace.updateOptions();
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
    if (!Array.isArray(this.settings.modes) || this.settings.modes.length === 0) {
      this.settings.modes = DEFAULT_MODES.map((m) => ({ ...m }));
    }
    if (!this.settings.modes.some((m) => m.id === this.settings.activeModeId)) {
      this.settings.activeModeId = this.settings.modes[0].id;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getActiveMode(): Mode {
    return (
      this.settings.modes.find((m) => m.id === this.settings.activeModeId) ??
      this.settings.modes[0]
    );
  }

  async setActiveMode(id: string) {
    this.settings.activeModeId = id;
    await this.saveSettings();
    this.updateStatusBar();
  }

  cycleMode() {
    const modes = this.settings.modes;
    if (!modes.length) return;
    const idx = modes.findIndex((m) => m.id === this.settings.activeModeId);
    const next = modes[(idx + 1) % modes.length];
    void this.setActiveMode(next.id);
    new Notice(`AI mode: ${next.name}`);
  }

  showModeMenu(event: MouseEvent) {
    const menu = new Menu();
    for (const mode of this.settings.modes) {
      menu.addItem((item) =>
        item
          .setTitle(mode.name)
          .setChecked(mode.id === this.settings.activeModeId)
          .onClick(() => void this.setActiveMode(mode.id))
      );
    }
    menu.showAtMouseEvent(event);
  }

  updateStatusBar() {
    if (!this.statusBar) return;
    const mode = this.getActiveMode();
    this.statusBar.setText(mode ? `AI: ${mode.name}` : "AI");
  }

  getCompletionOptions(): CompletionRequestOptions {
    return {
      model: this.settings.model,
      baseUrl: this.settings.baseUrl,
      apiKey: this.settings.apiKey,
    };
  }

  async testConnection() {
    try {
      const result = await fetchTransform(
        this.getCompletionOptions(),
        buildModePrompt(this.getActiveMode(), this.settings.targetLang),
        "helo wrld"
      );
      new Notice(`AI suggestions: connected${result ? ` (${result})` : ""}`);
    } catch (e) {
      this.showCompletionError(e, true);
    }
  }

  showCompletionError(error: unknown, forceNotice = false) {
    console.error("AI suggestions: completion error", error);

    const now = Date.now();
    if (!forceNotice && now - this.lastErrorNoticeAt < 10000) return;
    this.lastErrorNoticeAt = now;

    const message =
      error instanceof CompletionError || error instanceof Error
        ? error.message
        : "Unknown completion error";
    new Notice(`AI suggestions failed: ${message}`);
  }
}

class AIRewriteSettingTab extends PluginSettingTab {
  plugin: AIRewritePlugin;

  constructor(app: App, plugin: AIRewritePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderBehaviorSettings(containerEl);
    this.renderModeSettings(containerEl);
    this.renderConnectionSettings(containerEl);
  }

  private renderBehaviorSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Trigger")
      .setDesc(
        "On demand: only via hotkey/command. On leave: when you move off a line. While typing: after each pause"
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("onDemand", "On demand (hotkey only)")
          .addOption("onLeave", "When leaving a line")
          .addOption("typing", "While typing")
          .setValue(this.plugin.settings.triggerMode)
          .onChange(async (value) => {
            this.plugin.settings.triggerMode = value as TriggerMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Trigger delay (ms)")
      .setDesc("Debounce before an automatic trigger fetches a suggestion")
      .addSlider((slider) =>
        slider
          .setLimits(300, 2000, 100)
          .setValue(this.plugin.settings.delay)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.delay = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Accept keys")
      .setDesc(
        createFragment((frag) => {
          frag.appendText(
            "Keys that apply the suggestion. Space-separated CodeMirror names, e.g. Tab ArrowRight, Ctrl-Space, Mod-Enter. "
          );
          frag.createEl("a", {
            text: "Key name reference",
            href: "https://github.com/masaki39/obsidian-ai-rewrite#key-name-reference",
          });
        })
      )
      .addText((text) =>
        text
          .setPlaceholder("Tab ArrowRight")
          .setValue(this.plugin.settings.acceptKeys)
          .onChange(async (value) => {
            this.plugin.settings.acceptKeys = value;
            await this.plugin.saveSettings();
            this.plugin.applyKeymapChange();
          })
      );

    new Setting(containerEl)
      .setName("Dismiss keys")
      .setDesc("Keys that dismiss the suggestion. Same notation as accept keys, e.g. Escape")
      .addText((text) =>
        text
          .setPlaceholder("Escape")
          .setValue(this.plugin.settings.dismissKeys)
          .onChange(async (value) => {
            this.plugin.settings.dismissKeys = value;
            await this.plugin.saveSettings();
            this.plugin.applyKeymapChange();
          })
      );

    new Setting(containerEl)
      .setName("Target language")
      .setDesc("Language used by Translate mode")
      .addText((text) =>
        text
          .setPlaceholder("English")
          .setValue(this.plugin.settings.targetLang)
          .onChange(async (value) => {
            this.plugin.settings.targetLang = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enabled")
      .setDesc("Toggle suggestions on/off")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabled)
          .onChange(async (value) => {
            this.plugin.settings.enabled = value;
            await this.plugin.saveSettings();
          })
      );
  }

  private renderModeSettings(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Modes")
      .setDesc(
        "Each mode is an editable instruction. Switch via the status bar or the cycle command. Add a per-mode hotkey in Settings → Hotkeys (search 'Apply'). Adding or removing a mode takes effect after a reload"
      )
      .setHeading();

    this.plugin.settings.modes.forEach((mode, index) => {
      new Setting(containerEl)
        .setName(`Mode ${index + 1}`)
        .addText((text) =>
          text
            .setPlaceholder("Name")
            .setValue(mode.name)
            .onChange(async (value) => {
              mode.name = value;
              await this.plugin.saveSettings();
              this.plugin.updateStatusBar();
            })
        )
        .addExtraButton((button) =>
          button
            .setIcon("trash")
            .setTooltip("Delete mode")
            .onClick(async () => {
              this.plugin.settings.modes.splice(index, 1);
              if (this.plugin.settings.modes.length === 0) {
                this.plugin.settings.modes = DEFAULT_MODES.map((m) => ({
                  ...m,
                }));
              }
              if (
                !this.plugin.settings.modes.some(
                  (m) => m.id === this.plugin.settings.activeModeId
                )
              ) {
                await this.plugin.setActiveMode(
                  this.plugin.settings.modes[0].id
                );
              }
              await this.plugin.saveSettings();
              this.display();
            })
        );

      new Setting(containerEl)
        .setClass("ai-mode-prompt")
        .addTextArea((text) => {
          text.inputEl.rows = 3;
          text
            .setValue(mode.prompt)
            .onChange(async (value) => {
              mode.prompt = value;
              await this.plugin.saveSettings();
            });
        });
    });

    new Setting(containerEl)
      .addButton((button) =>
        button.setButtonText("Add mode").onClick(async () => {
          this.plugin.settings.modes.push({
            id: `mode-${Date.now()}`,
            name: "New mode",
            prompt:
              "Rewrite the text. Output ONLY the result, with no quotes and no explanation.",
          });
          await this.plugin.saveSettings();
          this.display();
        })
      )
      .addButton((button) =>
        button.setButtonText("Reset to defaults").onClick(async () => {
          this.plugin.settings.modes = DEFAULT_MODES.map((m) => ({ ...m }));
          await this.plugin.setActiveMode(this.plugin.settings.modes[0].id);
          await this.plugin.saveSettings();
          this.display();
          new Notice("AI suggestions: modes reset");
        })
      );
  }

  private renderConnectionSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Connection").setHeading();

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("OpenAI-compatible endpoint (Ollama by default)")
      .addText((text) =>
        text
          .setPlaceholder(OLLAMA_API_URL)
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Any model you have pulled (e.g. gemma3, gemma3:12b, qwen3:4b)")
      .addText((text) =>
        text
          .setPlaceholder("gemma3")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API key")
      .setDesc(
        "Optional. Leave blank for local servers (Ollama, LM Studio). Set it for authenticated endpoints (OpenAI, OpenRouter); sent as a Bearer token"
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Send a short test request with the current settings")
      .addButton((button) =>
        button.setButtonText("Test").onClick(() => {
          void this.plugin.testConnection();
        })
      );
  }
}
