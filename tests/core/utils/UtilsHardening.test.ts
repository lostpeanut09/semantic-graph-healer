// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealerLogger } from '../../../src/core/utils/HealerLogger';
import { CryptoUtils } from '../../../src/core/utils/CryptoUtils';
import { TFile } from 'obsidian';

vi.mock('obsidian', () => ({
    TFile: class MockTFile {
        path: string = '';
    },
    Plugin: class MockPlugin {
        app: any;
        constructor() {
            this.app = {};
        }
    },
}));

describe('Utils Hardening', () => {
    describe('HealerLogger (Safe Stringify & Atomic I/O)', () => {
        let plugin: any;
        let settings: any;

        beforeEach(() => {
            settings = {
                logLevel: 'debug',
                enableFileLogging: true,
                logFilePath: 'logs',
                logBufferSize: 1000,
            };

            plugin = {
                app: {
                    vault: {
                        getAbstractFileByPath: vi.fn(),
                        createFolder: vi.fn(),
                        create: vi.fn(),
                        read: vi.fn(),
                        modify: vi.fn(),
                        process: vi.fn(async (file: TFile, fn: (data: string) => string) => {
                            const current = await plugin.app.vault.read(file);
                            const updated = fn(current);
                            return updated;
                        }),
                    },
                },
                saveSettings: vi.fn(),
            };
        });

        it('CRIT-1: safeStringify prevents crash on circular references', () => {
            const logger = new HealerLogger('Test', plugin as any, settings);
            const circular: any = { name: 'top' };
            circular.self = circular;

            // Should not throw
            expect(() => logger.info('Logging circular', circular)).not.toThrow();
            expect(logger.exportLogs()).toContain('[Circular]');
        });

        it('CRIT-1: safeStringify handles BigInt', () => {
            const logger = new HealerLogger('Test', plugin as any, settings);
            const data = { val: 100n };

            // Should not throw and format as 100n
            expect(() => logger.info('Logging BigInt', data)).not.toThrow();
            expect(logger.exportLogs()).toContain('100n');
        });

        it('MED-1: writeToFile uses Vault.process for atomic updates', async () => {
            const logger = new HealerLogger('Test', plugin as any, settings);
            const mockFile = new TFile();
            mockFile.path = 'logs/healer-today.log';

            plugin.app.vault.getAbstractFileByPath.mockReturnValueOnce({} /* folder */);
            plugin.app.vault.getAbstractFileByPath.mockReturnValueOnce(mockFile);
            plugin.app.vault.read.mockResolvedValue('existing');

            await (logger as any).writeToFile({
                timestamp: '2026-04-17',
                level: 'info',
                module: 'Test',
                message: 'hello',
            });

            expect(plugin.app.vault.process).toHaveBeenCalled();
        });

        it('MED-1: redact of apiKey/token/authorization', () => {
            const logger = new HealerLogger('Test', plugin as any, settings);
            const data = { apiKey: 'abc', token: 'xyz', Authorization: 'Bearer 123' };

            // @ts-ignore - access private formatLogLine
            const output = (logger as any).formatLogLine({
                timestamp: '2026-04-17',
                level: 'info',
                module: 'Test',
                message: 'secrets',
                data,
            });

            expect(output).toContain('"apiKey":"***"');
            expect(output).toContain('"token":"***"');
            expect(output).toContain('"Authorization":"***"');
            expect(output).not.toContain('abc');
            expect(output).not.toContain('xyz');
            expect(output).not.toContain('Bearer 123');
        });

        it('MED-2: sanità CR/LF nel message', () => {
            const logger = new HealerLogger('Test', plugin as any, settings);

            // @ts-ignore
            const output = (logger as any).formatLogLine({
                timestamp: '2026-04-17',
                level: 'info',
                module: 'Test',
                message: 'a\nb\r\nc',
            });

            expect(output).toContain('a\\nb\\r\\nc');
            expect(output).not.toContain('\n'); // Should be single line
        });
    });

    describe('CryptoUtils (Robust Chunked Base64)', () => {
        const master = 'master-key';
        const salt = 'vault-salt';

        it('LOW-1: encrypts and decrypts large payloads (>32KB) without stack overflow', async () => {
            // Generate 100KB of random-ish string data
            const largeData = 'A'.repeat(100 * 1024);

            const encrypted = await CryptoUtils.encrypt(largeData, master, salt);
            expect(typeof encrypted).toBe('string');
            expect(encrypted.length).toBeGreaterThan(100 * 1024);

            const decrypted = await CryptoUtils.decrypt(encrypted, master, salt);
            expect(decrypted).toBe(largeData);
        });

        it('correctly handles small payloads and empty strings', async () => {
            const testStrings = ['hello', '', '   ', '🚀 emoji test'];

            for (const text of testStrings) {
                const encrypted = await CryptoUtils.encrypt(text, master, salt);
                const decrypted = await CryptoUtils.decrypt(encrypted, master, salt);
                expect(decrypted).toBe(text);
            }
        });
    });
});
