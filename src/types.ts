export interface PluginSettings {
	ai: {
		enabled: boolean;
		provider: 'disabled' | 'ollama' | 'openai';
		endpoint: string;
		model: string;
		apiKey?: string;
	};
	diagnostics: {
		autoRunOnOpen: boolean;
		minScoreThreshold: number;
	};
	thresholds: {
		minLinkDensity: number;
		maxOrphanLinks: number;
	};
}

export const AI_PROVIDERS = ['disabled', 'ollama', 'openai'] as const;

export function validateSettings(data: unknown): PluginSettings {
	if (typeof data !== 'object' || data === null) {
		return DEFAULT_SETTINGS;
	}
	const d = data as Record<string, unknown>;
	const ai = (d.ai ?? {}) as Record<string, unknown>;
	const diagnostics = (d.diagnostics ?? {}) as Record<string, unknown>;
	const thresholds = (d.thresholds ?? {}) as Record<string, unknown>;
	return {
		ai: {
			enabled: typeof ai.enabled === 'boolean' ? ai.enabled : DEFAULT_SETTINGS.ai.enabled,
			provider: (() => {
				const prov = ai.provider;
				const found = typeof prov === 'string' ? AI_PROVIDERS.find((p) => p === prov) : undefined;
				return found ?? DEFAULT_SETTINGS.ai.provider;
			})(),
			endpoint: typeof ai.endpoint === 'string' ? ai.endpoint : DEFAULT_SETTINGS.ai.endpoint,
			model: typeof ai.model === 'string' ? ai.model : DEFAULT_SETTINGS.ai.model,
			apiKey: typeof ai.apiKey === 'string' ? ai.apiKey : undefined,
		},
		diagnostics: {
			autoRunOnOpen: typeof diagnostics.autoRunOnOpen === 'boolean'
				? diagnostics.autoRunOnOpen
				: DEFAULT_SETTINGS.diagnostics.autoRunOnOpen,
			minScoreThreshold: typeof diagnostics.minScoreThreshold === 'number' && !isNaN(diagnostics.minScoreThreshold)
				? diagnostics.minScoreThreshold
				: DEFAULT_SETTINGS.diagnostics.minScoreThreshold,
		},
		thresholds: {
			minLinkDensity: typeof thresholds.minLinkDensity === 'number' && !isNaN(thresholds.minLinkDensity)
				? thresholds.minLinkDensity
				: DEFAULT_SETTINGS.thresholds.minLinkDensity,
			maxOrphanLinks: typeof thresholds.maxOrphanLinks === 'number' && !isNaN(thresholds.maxOrphanLinks)
				? thresholds.maxOrphanLinks
				: DEFAULT_SETTINGS.thresholds.maxOrphanLinks,
		},
	};
}

const DEFAULT_SETTINGS: PluginSettings = {
	ai: {
		enabled: false,
		provider: 'disabled',
		endpoint: 'http://localhost:11434',
		model: 'nomic-embed-text',
		apiKey: undefined,
	},
	diagnostics: {
		autoRunOnOpen: true,
		minScoreThreshold: 0.3,
	},
	thresholds: {
		minLinkDensity: 0.1,
		maxOrphanLinks: 5,
	},
};

export { DEFAULT_SETTINGS };
