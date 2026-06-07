import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResetKeychainModal } from '../../../src/views/components/ResetKeychainModal';
import { Modal, Setting, Notice } from 'obsidian';
import type { KeychainService } from '../../../src/core/services/KeychainService';
import type { ExtendedApp } from '../../../src/types';

describe('ResetKeychainModal', () => {
    let modal: ResetKeychainModal;
    let mockApp: ExtendedApp;
    let mockKeychainService: KeychainService;

    beforeEach(() => {
        vi.clearAllMocks();

        mockApp = {} as unknown as ExtendedApp;
        mockKeychainService = {
            resetKeychain: vi.fn().mockResolvedValue(undefined),
        } as unknown as KeychainService;

        modal = new ResetKeychainModal(mockApp, mockKeychainService);
    });

    it('should render correctly on open', () => {
        modal.onOpen();

        const content = modal.contentEl;
        expect(content.querySelector('h2')?.textContent).toBe('Keychain security reset');
        expect(content.innerHTML).toContain('lost or corrupted');
        expect(content.innerHTML).toContain('Reset and re-enter API keys');
    });

    it('should call resetKeychain and show notice when reset button is clicked', async () => {
        modal.onOpen();

        const resetButton = Array.from(modal.contentEl.querySelectorAll('button')).find(
            (btn) => btn.textContent === 'Reset and re-enter API keys',
        );

        expect(resetButton).toBeDefined();

        // Simulate click
        // Note: In our mock, Setting.addButton.onClick is called, but we need to trigger the actual handler.
        // Since we are using real-ish DOM from JSDOM, and Setting is mocked in obsidian.ts to add to DOM.

        const closeSpy = vi.spyOn(modal, 'close');

        await (resetButton as HTMLButtonElement).click();

        expect(mockKeychainService.resetKeychain).toHaveBeenCalled();
        expect((Notice as unknown as { recordCall: ReturnType<typeof vi.fn> }).recordCall).toHaveBeenCalledWith(
            expect.stringContaining('Keychain has been reset'),
            undefined,
        );
        expect(closeSpy).toHaveBeenCalled();
    });

    it('should close when cancel button is clicked', () => {
        modal.onOpen();

        const cancelButton = Array.from(modal.contentEl.querySelectorAll('button')).find(
            (btn) => btn.textContent === 'Cancel',
        );

        expect(cancelButton).toBeDefined();

        const closeSpy = vi.spyOn(modal, 'close');

        (cancelButton as HTMLButtonElement).click();

        expect(mockKeychainService.resetKeychain).not.toHaveBeenCalled();
        expect(closeSpy).toHaveBeenCalled();
    });
});
