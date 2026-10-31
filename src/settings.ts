import { App, PluginSettingTab, SettingDefinitionItem, Plugin } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, validateSettings, AI_PROVIDERS } from './types';

export { DEFAULT_SETTINGS, validateSettings };

export class SemanticGraphHealerSettingTab extends PluginSettingTab {
	declare plugin: Plugin;

	constructor(app: App, plugin: Plugin) {
		super(app, plugin);
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Enable AI diagnostics',
				desc: 'Use local or remote AI to analyze semantic relationships',
				control: {
					type: 'toggle',
					key: 'ai-enabled',
				},
			},
			{
				name: 'AI Provider',
				desc: 'Choose how to connect to an AI model',
				control: {
					type: 'dropdown',
					key: 'ai-provider',
					options: {
						disabled: 'Disabled',
						ollama: 'Ollama',
						openai: 'OpenAI-compatible',
					},
				},
			},
			{
				name: 'AI Endpoint',
				desc: 'Server URL for AI API (e.g. http://localhost:11434)',
				control: {
					type: 'text',
					key: 'ai-endpoint',
				},
			},
			{
				name: 'AI Model',
				desc: 'Model identifier for the selected provider',
				control: {
					type: 'text',
					key: 'ai-model',
				},
			},
		];
	}

	override getControlValue(key: string): unknown {
		const s = this.plugin.settings as PluginSettings | undefined;
		if (!s) return undefined;
		switch (key) {
			case 'ai-enabled':
				return s.ai.enabled;
			case 'ai-provider':
				return s.ai.provider;
			default:
				return undefined;
		}
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		const data = (await this.plugin.loadData()) as Record<string, unknown> | null;
		const merged = validateSettings({ ...DEFAULT_SETTINGS, ...data });
		if (key === 'ai-enabled' && typeof value === 'boolean') {
			merged.ai = { ...merged.ai, enabled: value };
		} else if (key === 'ai-provider' && typeof value === 'string') {
			const prov = AI_PROVIDERS.find((p) => p === value);
			if (prov) merged.ai = { ...merged.ai, provider: prov };
		}
		await this.plugin.saveData(merged);
		this.plugin.settings = merged;
	}
}
