import { describe, it, expect } from 'vitest';
import { HealerLogger } from '../src/core/utils/HealerLogger';

describe('HealerLogger Security', () => {
    it('should redact sensitive keys from log data', () => {
        const logger = new HealerLogger('test', {} as any, { logLevel: 'debug' } as any);
        const data = {
            username: 'admin',
            password: 'secretPassword123',
            api_key: 'sk-1234567890abcdef',
            nested: {
                secret: 'hiddenValue',
            },
        };

        // We need to access safeStringify which is private, so we might need a workaround or test via a public method
        // Since I cannot change the visibility in tests easily, I'll test via the logged string
        const logBuffer = (logger as any).safeStringify(data);

        expect(logBuffer).toContain('"password":"***"');
        expect(logBuffer).toContain('"api_key":"***"');
        expect(logBuffer).toContain('"secret":"***"');
        expect(logBuffer).toContain('"username":"admin"');
    });
});
