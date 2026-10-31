import { Plugin } from 'obsidian';
import { COMMANDS } from './commands';
import { SemanticGraphHealerSettingTab, validateSettings } from './settings';

export default class SemanticGraphHealerPlugin extends Plugin {
	override async onload() {
		this.settings = validateSettings(await this.loadData());
		this.addSettingTab(new SemanticGraphHealerSettingTab(this.app, this));
		for (const cmd of COMMANDS) {
			this.addCommand(cmd);
		}
	}

	override onunload() {}
}
