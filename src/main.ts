import { Plugin, PluginSettingTab, App, Setting, Notice } from "obsidian";
import { Extension } from "@codemirror/state";
import { inlineSuggestionExtension } from "./ghost-text";
import { fetchGroqCompletion } from "./groq-api";

interface AIAutocompleteSettings {
  apiKey: string;
  model: string;
  delay: number;
  enabled: boolean;
}

const DEFAULT_SETTINGS: AIAutocompleteSettings = {
  apiKey: "",
  model: "llama-3.3-70b-versatile",
  delay: 800,
  enabled: true,
};

export default class AIAutocompletePlugin extends Plugin {
  settings: AIAutocompleteSettings = DEFAULT_SETTINGS;
  private editorExtensions: Extension[] = [];

  async onload() {
    await this.loadSettings();

    this.editorExtensions = inlineSuggestionExtension(
      async (prefix, suffix) => {
        if (!this.settings.enabled || !this.settings.apiKey) return null;
        return fetchGroqCompletion(
          this.settings.apiKey,
          this.settings.model,
          prefix,
          suffix
        );
      },
      this.settings.delay
    );

    this.registerEditorExtension(this.editorExtensions);

    this.addCommand({
      id: "toggle",
      name: "Toggle auto-completion",
      callback: () => {
        this.settings.enabled = !this.settings.enabled;
        void this.saveSettings();
        new Notice(
          `AI Autocomplete: ${this.settings.enabled ? "ON" : "OFF"}`
        );
      },
    });

    this.addSettingTab(new AIAutocompleteSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      await this.loadData()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class AIAutocompleteSettingTab extends PluginSettingTab {
  plugin: AIAutocompletePlugin;

  constructor(app: App, plugin: AIAutocompletePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Groq API key")
      .setDesc("Get your key from console.groq.com")
      .addText((text) =>
        text
          .setPlaceholder("Enter your API key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Groq model to use for completions")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("llama-3.3-70b-versatile", "Llama 3.3 70b (recommended)")
          .addOption("llama-3.1-8b-instant", "Llama 3.1 8b (faster)")
          .addOption("gemma2-9b-it", "Gemma 2 9b")
          .addOption("mixtral-8x7b-32768", "Mixtral 8x7b")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Trigger delay (ms)")
      .setDesc("How long to wait after typing before triggering completion")
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
      .setName("Enabled")
      .setDesc("Toggle auto-completion on/off")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabled)
          .onChange(async (value) => {
            this.plugin.settings.enabled = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
