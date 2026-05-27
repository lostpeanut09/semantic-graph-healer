import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResetKeychainModal } from '../../../src/views/components/ResetKeychainModal';
import { Modal, Setting, Notice } from 'obsidian';

describe('ResetKeychainModal', () => {
    let modal: ResetKeychainModal;
    let mockApp: any;
    let mockKeychainService: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockApp = {};
        mockKeychainService = {
            resetKeychain: vi.fn().mockResolvedValue(undefined),
        };

        modal = new ResetKeychainModal(mockApp as any, mockKeychainService as any);
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
        expect((Notice as any).recordCall).toHaveBeenCalledWith(
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
