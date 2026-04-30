import { Plugin, PluginSettingTab, App, Setting, Notice } from "obsidian";
import { Extension } from "@codemirror/state";
import { inlineSuggestionExtension } from "./ghost-text";
import {
  CompletionError,
  CompletionRequestOptions,
  fetchCompletion,
  OPENROUTER_API_URL,
} from "./groq-api";

interface AIAutocompleteSettings {
  apiKey: string;
  model: string;
  baseUrl: string;
  reasoningEffort: string;
  excludeReasoning: boolean;
  providerOnly: string;
  providerSort: string;
  allowFallbacks: boolean;
  httpReferer: string;
  appTitle: string;
  delay: number;
  enabled: boolean;
}

const DEFAULT_SETTINGS: AIAutocompleteSettings = {
  apiKey: "",
  model: "openai/gpt-oss-120b:nitro",
  baseUrl: OPENROUTER_API_URL,
  reasoningEffort: "minimal",
  excludeReasoning: true,
  providerOnly: "groq",
  providerSort: "throughput",
  allowFallbacks: false,
  httpReferer: "https://github.com/Leoyishou/obsidian-ai-autocomplete",
  appTitle: "AI Autocomplete",
  delay: 800,
  enabled: true,
};

export default class AIAutocompletePlugin extends Plugin {
  settings: AIAutocompleteSettings = DEFAULT_SETTINGS;
  private editorExtensions: Extension[] = [];
  private lastErrorNoticeAt = 0;

  async onload() {
    await this.loadSettings();

    this.editorExtensions = inlineSuggestionExtension(
      async (prefix, suffix) => {
        if (!this.settings.enabled || !this.settings.apiKey) return null;
        try {
          return await fetchCompletion(
            this.getCompletionOptions(),
            prefix,
            suffix
          );
        } catch (e) {
          this.showCompletionError(e);
          return null;
        }
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

    this.addCommand({
      id: "test-connection",
      name: "Test connection",
      callback: () => {
        void this.testConnection();
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

  getCompletionOptions(): CompletionRequestOptions {
    return {
      apiKey: this.settings.apiKey,
      model: this.settings.model,
      baseUrl: this.settings.baseUrl,
      reasoningEffort: this.settings.reasoningEffort,
      excludeReasoning: this.settings.excludeReasoning,
      providerOnly: this.settings.providerOnly,
      providerSort: this.settings.providerSort,
      allowFallbacks: this.settings.allowFallbacks,
      httpReferer: this.settings.httpReferer,
      appTitle: this.settings.appTitle,
    };
  }

  async testConnection() {
    if (!this.settings.apiKey) {
      new Notice("AI Autocomplete: API key is empty");
      return;
    }

    try {
      const result = await fetchCompletion(
        this.getCompletionOptions(),
        "Reply with exactly: ok",
        ""
      );
      new Notice(`AI Autocomplete: connected${result ? ` (${result})` : ""}`);
    } catch (e) {
      this.showCompletionError(e, true);
    }
  }

  showCompletionError(error: unknown, forceNotice = false) {
    console.error("AI Autocomplete: completion error", error);

    const now = Date.now();
    if (!forceNotice && now - this.lastErrorNoticeAt < 10000) return;
    this.lastErrorNoticeAt = now;

    const message =
      error instanceof CompletionError || error instanceof Error
        ? error.message
        : "Unknown completion error";
    new Notice(`AI Autocomplete failed: ${message}`);
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
      .setName("API key")
      .setDesc("Use an OpenRouter key for the default Groq provider route")
      .addText((text) =>
        text
          .setPlaceholder("sk-or-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API base URL")
      .setDesc("OpenAI-compatible chat completions endpoint")
      .addText((text) =>
        text
          .setPlaceholder(OPENROUTER_API_URL)
          .setValue(this.plugin.settings.baseUrl)
          .onChange(async (value) => {
            this.plugin.settings.baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    const modelOptions: Record<string, string> = {
      "openai/gpt-oss-120b:nitro":
        "OpenAI GPT OSS 120B via Groq (smartest)",
      "meta-llama/llama-3.3-70b-instruct:nitro":
        "Llama 3.3 70B via Groq (stable)",
      "moonshotai/kimi-k2-0905:nitro":
        "Kimi K2 0905 via Groq (code/long context)",
      "qwen/qwen3-32b:nitro": "Qwen3 32B via Groq (Chinese/reasoning)",
      "meta-llama/llama-3.1-8b-instruct:nitro":
        "Llama 3.1 8B via Groq (lowest latency)",
      "openai/gpt-oss-20b:nitro": "OpenAI GPT OSS 20B via Groq (reasoning)",
      "llama-3.3-70b-versatile": "Groq direct: Llama 3.3 70B",
      "openai/gpt-oss-120b": "Groq direct: GPT OSS 120B",
    };

    new Setting(containerEl)
      .setName("Model")
      .setDesc("OpenRouter model slug")
      .addDropdown((dropdown) => {
        for (const [value, label] of Object.entries(modelOptions)) {
          dropdown.addOption(value, label);
        }
        if (!modelOptions[this.plugin.settings.model]) {
          dropdown.addOption(this.plugin.settings.model, "Custom current model");
        }
        return dropdown
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
            this.display();
          });
      })
      .addText((text) =>
        text
          .setPlaceholder("openai/gpt-oss-120b:nitro")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reasoning effort")
      .setDesc("Use minimal/low for inline autocomplete to keep responses fast")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("minimal", "Minimal")
          .addOption("low", "Low")
          .addOption("medium", "Medium")
          .addOption("high", "High")
          .addOption("none", "None")
          .addOption("", "API default")
          .setValue(this.plugin.settings.reasoningEffort)
          .onChange(async (value) => {
            this.plugin.settings.reasoningEffort = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Hide reasoning")
      .setDesc("Keep reasoning tokens out of the returned suggestion text")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.excludeReasoning)
          .onChange(async (value) => {
            this.plugin.settings.excludeReasoning = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Use groq to force OpenRouter's Groq provider")
      .addText((text) =>
        text
          .setPlaceholder("groq")
          .setValue(this.plugin.settings.providerOnly)
          .onChange(async (value) => {
            this.plugin.settings.providerOnly = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Provider sort")
      .setDesc("throughput prioritizes speed on OpenRouter")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("throughput", "Throughput")
          .addOption("latency", "Latency")
          .addOption("price", "Price")
          .addOption("", "OpenRouter default")
          .setValue(this.plugin.settings.providerSort)
          .onChange(async (value) => {
            this.plugin.settings.providerSort = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Allow fallbacks")
      .setDesc("Off means OpenRouter will only use the selected provider")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.allowFallbacks)
          .onChange(async (value) => {
            this.plugin.settings.allowFallbacks = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("HTTP referer")
      .setDesc("Optional OpenRouter app attribution")
      .addText((text) =>
        text
          .setPlaceholder("https://github.com/...")
          .setValue(this.plugin.settings.httpReferer)
          .onChange(async (value) => {
            this.plugin.settings.httpReferer = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("App title")
      .setDesc("Optional OpenRouter app attribution")
      .addText((text) =>
        text
          .setPlaceholder("AI Autocomplete")
          .setValue(this.plugin.settings.appTitle)
          .onChange(async (value) => {
            this.plugin.settings.appTitle = value;
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

    new Setting(containerEl)
      .setName("Connection")
      .setDesc("Send a short test request with the current settings")
      .addButton((button) =>
        button.setButtonText("Test").onClick(() => {
          void this.plugin.testConnection();
        })
      );
  }
}
