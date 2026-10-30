export const mockApp = {
	vault: {
		getMarkdownFiles: () => [],
		modify: async () => {},
		read: async () => '',
		getAbstractFileByPath: () => null,
	},
	metadataCache: {
		getTags: () => ({}),
		getInvertedRemoteLinks: () => ({}),
		getUnresolvedLinks: () => ({}),
	},
	workspace: {
		getActiveFile: () => null,
		getLeaf: () => null,
	},
};

export class App {
	vault = mockApp.vault;
	metadataCache = mockApp.metadataCache;
	workspace = mockApp.workspace;
}

export class Plugin {
	app: unknown;
	manifest: unknown;
	settings: unknown;
	loading = false;
	pluginId = '';
	async loadData(): Promise<unknown> {
		return {};
	}
	async saveData(data: unknown): Promise<void> {}
	addCommand(command: unknown): void {}
	addSettingTab(tab: unknown): this {
		return this;
	}
	registerCommand(): void {}
	registerEvent(): void {}
	registerDomEvent(): void {}
	registerMutationObserver(): void {}
	registerInterval(): void {}
}

export class PluginSettingTab extends Plugin {
	constructor(app: unknown, plugin: unknown) {
		super();
	}
}
