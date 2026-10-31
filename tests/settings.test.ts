import { describe, it, expect } from 'vitest';
import { validateSettings, DEFAULT_SETTINGS, AI_PROVIDERS } from '../src/types';

describe('validateSettings', () => {
	describe('fallbacks for non-object input', () => {
		it('returns DEFAULT_SETTINGS for null', () => {
			expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
		});

		it('returns DEFAULT_SETTINGS for undefined', () => {
			expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		});

		it('returns DEFAULT_SETTINGS for a string', () => {
			expect(validateSettings('not-an-object')).toEqual(DEFAULT_SETTINGS);
		});

		it('returns DEFAULT_SETTINGS for an array', () => {
			expect(validateSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
		});

		it('returns DEFAULT_SETTINGS for a number', () => {
			expect(validateSettings(42)).toEqual(DEFAULT_SETTINGS);
		});
	});

	describe('deep fallback when fields are missing', () => {
		it('returns DEFAULT_SETTINGS for an empty object', () => {
			expect(validateSettings({})).toEqual(DEFAULT_SETTINGS);
		});

		it('falls back when ai is missing', () => {
			const result = validateSettings({ diagnostics: {} });
			expect(result.ai).toEqual(DEFAULT_SETTINGS.ai);
		});

		it('falls back when diagnostics is missing', () => {
			const result = validateSettings({ ai: {} });
			expect(result.diagnostics).toEqual(DEFAULT_SETTINGS.diagnostics);
		});

		it('falls back when thresholds is missing', () => {
			const result = validateSettings({ ai: {} });
			expect(result.thresholds).toEqual(DEFAULT_SETTINGS.thresholds);
		});
	});

	describe('provider validation', () => {
		it.each(AI_PROVIDERS)(
			'accepts valid provider: %s',
			(provider) => {
				const result = validateSettings({ ai: { provider } });
				expect(result.ai.provider).toBe(provider);
			},
		);

		it('falls back to disabled for unknown provider', () => {
			const result = validateSettings({ ai: { provider: 'claude' } });
			expect(result.ai.provider).toBe('disabled');
		});

		it('falls back to disabled for provider that is not a string', () => {
			const result = validateSettings({ ai: { provider: 42 } });
			expect(result.ai.provider).toBe(DEFAULT_SETTINGS.ai.provider);
		});
	});

	describe('field-level fallback', () => {
		it('preserves a valid endpoint string', () => {
			const result = validateSettings({ ai: { endpoint: 'http://localhost:8080' } });
			expect(result.ai.endpoint).toBe('http://localhost:8080');
		});

		it('falls back when endpoint is not a string', () => {
			const result = validateSettings({ ai: { endpoint: 123 } });
			expect(result.ai.endpoint).toBe(DEFAULT_SETTINGS.ai.endpoint);
		});

		it('preserves a valid model string', () => {
			const result = validateSettings({ ai: { model: 'gpt-4' } });
			expect(result.ai.model).toBe('gpt-4');
		});

		it('falls back when model is not a string', () => {
			const result = validateSettings({ ai: { model: true } });
			expect(result.ai.model).toBe(DEFAULT_SETTINGS.ai.model);
		});

		it('preserves apiKey when it is a string', () => {
			const result = validateSettings({ ai: { apiKey: 'sk-test-123' } });
			expect(result.ai.apiKey).toBe('sk-test-123');
		});

		it('does not preserve apiKey when it is not a string', () => {
			const result = validateSettings({ ai: { apiKey: 12345 } });
			expect(result.ai.apiKey).toBeUndefined();
		});
	});

	describe('diagnostics validation', () => {
		it('preserves a valid minScoreThreshold number', () => {
			const result = validateSettings({ diagnostics: { minScoreThreshold: 0.7 } });
			expect(result.diagnostics.minScoreThreshold).toBe(0.7);
		});

		it('falls back to default for NaN minScoreThreshold', () => {
			const result = validateSettings({ diagnostics: { minScoreThreshold: NaN } });
			expect(result.diagnostics.minScoreThreshold).toBe(DEFAULT_SETTINGS.diagnostics.minScoreThreshold);
		});

		it('falls back to default for non-number minScoreThreshold', () => {
			const result = validateSettings({ diagnostics: { minScoreThreshold: 'high' } });
			expect(result.diagnostics.minScoreThreshold).toBe(DEFAULT_SETTINGS.diagnostics.minScoreThreshold);
		});

		it('preserves a valid autoRunOnOpen boolean', () => {
			const result = validateSettings({ diagnostics: { autoRunOnOpen: false } });
			expect(result.diagnostics.autoRunOnOpen).toBe(false);
		});

		it('falls back to default for non-boolean autoRunOnOpen', () => {
			const result = validateSettings({ diagnostics: { autoRunOnOpen: 'yes' } });
			expect(result.diagnostics.autoRunOnOpen).toBe(DEFAULT_SETTINGS.diagnostics.autoRunOnOpen);
		});
	});

	describe('thresholds validation', () => {
		it('preserves a valid minLinkDensity number', () => {
			const result = validateSettings({ thresholds: { minLinkDensity: 0.05 } });
			expect(result.thresholds.minLinkDensity).toBe(0.05);
		});

		it('falls back to default for NaN minLinkDensity', () => {
			const result = validateSettings({ thresholds: { minLinkDensity: NaN } });
			expect(result.thresholds.minLinkDensity).toBe(DEFAULT_SETTINGS.thresholds.minLinkDensity);
		});

		it('preserves a valid maxOrphanLinks number', () => {
			const result = validateSettings({ thresholds: { maxOrphanLinks: 10 } });
			expect(result.thresholds.maxOrphanLinks).toBe(10);
		});

		it('falls back to default for non-number maxOrphanLinks', () => {
			const result = validateSettings({ thresholds: { maxOrphanLinks: 'many' } });
			expect(result.thresholds.maxOrphanLinks).toBe(DEFAULT_SETTINGS.thresholds.maxOrphanLinks);
		});
	});
});
