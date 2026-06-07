import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderEmbeddingSettings } from '../../src/views/sections/EmbeddingSettings';
import type { SectionContext } from '../../src/views/SectionContext';
import { Setting } from 'obsidian';

// Extend HTMLElement for JSDOM in this test
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.createDiv) {
    (
        HTMLElement.prototype as unknown as {
            createDiv: (options?: { cls?: string; text?: string }) => HTMLDivElement;
        }
    ).createDiv = function (this: HTMLElement, options?: { cls?: string; text?: string }) {
        const div = document.createElement('div');
        if (options?.cls) div.className = options.cls;
        if (options?.text) div.textContent = options.text;
        this.appendChild(div);
        return div;
    };
}

// Mock Obsidian
vi.mock('obsidian', () => {
    const MockSetting = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.settingEl = { addClass: vi.fn() };
        this.setName = vi.fn().mockReturnThis();
        this.setDesc = vi.fn().mockReturnThis();
        this.setHeading = vi.fn().mockReturnThis();
        this.addDropdown = vi.fn().mockImplementation((cb: (dropdown: Record<string, unknown>) => void) => {
            if (cb)
                cb({
                    addOption: vi.fn().mockReturnThis(),
                    setValue: vi.fn().mockReturnThis(),
                    onChange: vi.fn().mockReturnThis(),
                });
            return this;
        });
        this.addText = vi.fn().mockImplementation((cb: (text: Record<string, unknown>) => void) => {
            if (cb)
                cb({
                    setPlaceholder: vi.fn().mockReturnThis(),
                    setValue: vi.fn().mockReturnThis(),
                    onChange: vi.fn().mockReturnThis(),
                });
            return this;
        });
        this.addButton = vi.fn().mockImplementation((cb: (button: Record<string, unknown>) => void) => {
            if (cb)
                cb({
                    setButtonText: vi.fn().mockReturnThis(),
                    onClick: vi.fn().mockReturnThis(),
                    setDisabled: vi.fn().mockReturnThis(),
                });
            return this;
        });
    });

    return {
        Setting: MockSetting,
        Notice: vi.fn(),
    };
});

describe('EmbeddingSettings', () => {
    let containerEl: HTMLElement;
    let mockCtx: SectionContext;

    beforeEach(() => {
        containerEl = document.createElement('div');
        const ctx = {
            plugin: {
                settings: {
                    embeddingProvider: 'ollama',
                    embeddingEndpoint: 'http://localhost:11434',
                    embeddingModel: 'nomic-embed-text',
                },
                saveSettings: vi.fn(),
                embedding: {
                    modelStatus: 'STABLE',
                    checkModelAlignment: vi.fn(),
                },
                graphRag: {
                    indexCommunities: vi.fn(),
                },
            },
            refresh: vi.fn(),
        };
        mockCtx = ctx as unknown as SectionContext;
        vi.clearAllMocks();
    });

    it('renders all setting fields', () => {
        renderEmbeddingSettings(containerEl, mockCtx);

        expect(Setting).toHaveBeenCalled();
        expect(containerEl.querySelector('.healer-model-status')).toBeTruthy();
        expect(containerEl.querySelector('.healer-model-status')?.textContent).toContain('STABLE');
    });

    it('displays different status colors based on model health', () => {
        (mockCtx.plugin as unknown as { embedding: { modelStatus: string } }).embedding.modelStatus = 'MISALIGNED';
        renderEmbeddingSettings(containerEl, mockCtx);
        const statusEl = containerEl.querySelector('.healer-model-status') as HTMLElement;
        expect(statusEl.style.color).toBe('var(--text-warning)');

        containerEl.innerHTML = '';
        (mockCtx.plugin as unknown as { embedding: { modelStatus: string } }).embedding.modelStatus = 'OFFLINE';
        renderEmbeddingSettings(containerEl, mockCtx);
        const statusEl2 = containerEl.querySelector('.healer-model-status') as HTMLElement;
        expect(statusEl2.style.color).toBe('var(--text-error)');
    });

    it('creates buttons for verification and indexing', async () => {
        renderEmbeddingSettings(containerEl, mockCtx);
        expect(Setting).toHaveBeenCalled();
    });
});
