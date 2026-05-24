import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrossThematicProvider } from '../../../src/core/services/CrossThematicProvider';
import { DEFAULT_SETTINGS } from '../../../src/types';

describe('CrossThematicProvider', () => {
    let provider: CrossThematicProvider;
    let mockGraphEngine: any;
    let mockStorage: any;
    let mockSettings: any;

    beforeEach(() => {
        mockGraphEngine = {
            getTopologicalMetrics: vi.fn(),
        };
        mockStorage = {
            getThemeMetadata: vi.fn(),
            saveThemeMetadata: vi.fn(),
        };
        mockSettings = { ...DEFAULT_SETTINGS };

        provider = new CrossThematicProvider(mockGraphEngine, mockStorage, mockSettings);
    });

    it('should be initialized with correct settings', () => {
        expect(provider).toBeDefined();
    });
});
