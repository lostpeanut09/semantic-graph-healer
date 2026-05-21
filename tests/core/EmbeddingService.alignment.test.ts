import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '../../src/core/EmbeddingService';
import { requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn(),
}));

describe('EmbeddingService Alignment', () => {
    let service: EmbeddingService;
    let mockSettings: any;

    beforeEach(() => {
        mockSettings = {
            ...DEFAULT_SETTINGS,
            embeddingProvider: 'ollama',
            embeddingDimensions: 768,
        };
        service = new EmbeddingService(mockSettings);
        vi.clearAllMocks();
    });

    it('should mark status as STABLE if alignment check passes', async () => {
        // Mock cosine similarity by returning specific vectors
        // king (1,0), queen (0.9, 0.1) -> high similarity
        // cat (1,0), car (0,1) -> low similarity

        vi.mocked(requestUrl).mockImplementation(async (options: any) => {
            const body = JSON.parse(options.body);
            const prompt = body.prompt;

            let vector = new Array(768).fill(0);
            if (
                prompt === 'king' ||
                prompt === 'apple' ||
                prompt === 'fast' ||
                prompt === 'physics' ||
                prompt === 'blue' ||
                prompt === 'walk' ||
                prompt === 'pencil'
            ) {
                vector[0] = 1;
            } else if (
                prompt === 'queen' ||
                prompt === 'fruit' ||
                prompt === 'quick' ||
                prompt === 'science' ||
                prompt === 'color' ||
                prompt === 'run' ||
                prompt === 'eraser'
            ) {
                vector[0] = 0.9;
                vector[1] = 0.1;
            } else if (prompt === 'cat') {
                vector[2] = 1;
            } else if (prompt === 'dog') {
                vector[2] = 0.8;
            } else if (prompt === 'car') {
                vector[3] = 1;
            } else if (prompt === 'cold') {
                vector[4] = 1;
            } else if (prompt === 'hot') {
                vector[4] = 0.2; // Low similarity for hot/cold
            }

            return {
                status: 200,
                json: { embedding: vector },
            } as any;
        });

        const result = await service.checkModelAlignment();

        expect(result).toBe(true);
        expect(service.modelStatus).toBe('STABLE');
    });

    it('should mark status as MISALIGNED if alignment check fails', async () => {
        // Return alternating vectors -> low similarity for most pairs
        let toggle = false;
        vi.mocked(requestUrl).mockImplementation(async () => {
            toggle = !toggle;
            const vector = new Array(768).fill(toggle ? 1 : 0);
            return {
                status: 200,
                json: { embedding: vector },
            } as any;
        });

        const result = await service.checkModelAlignment();

        expect(result).toBe(false);
        expect(service.modelStatus).toBe('MISALIGNED');
    });

    it('should mark status as OFFLINE if request fails', async () => {
        vi.mocked(requestUrl).mockRejectedValue(new Error('Network error'));

        const result = await service.checkModelAlignment();

        expect(result).toBe(false);
        expect(service.modelStatus).toBe('OFFLINE');
    });
});
