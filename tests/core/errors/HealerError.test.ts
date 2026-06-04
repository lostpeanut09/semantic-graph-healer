import { describe, it, expect } from 'vitest';
import {
    HealerError,
    AdapterError,
    ValidationError,
    ConfigError,
    LlmError,
    CacheError,
    WorkerError,
    type HealerErrorOptions,
} from '../../../src/core/errors/HealerError';

const baseOptions: HealerErrorOptions = {
    code: 'TEST_CODE',
    message: 'Something went wrong',
    severity: 'error',
    module: 'TestModule',
    recoverable: false,
};

describe('HealerError base class', () => {
    it('extends Error and is instanceof Error', () => {
        const err = new HealerError(baseOptions);
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(HealerError);
    });

    it('sets name to "HealerError"', () => {
        const err = new HealerError(baseOptions);
        expect(err.name).toBe('HealerError');
    });

    it('populates all 8 fields from D-02', () => {
        const cause = new Error('upstream');
        const context = { extra: 'value' };
        const ts = 1700000000000;
        const err = new HealerError({
            ...baseOptions,
            cause,
            context,
            timestamp: ts,
        });
        expect(err.code).toBe('TEST_CODE');
        expect(err.message).toBe('Something went wrong');
        expect(err.severity).toBe('error');
        expect(err.module).toBe('TestModule');
        expect(err.cause).toBe(cause);
        expect(err.context).toBe(context);
        expect(err.timestamp).toBe(ts);
        expect(err.recoverable).toBe(false);
    });

    it('captures cause via super(message, { cause }) so Error.cause chain works', () => {
        const root = new Error('root cause');
        const err = new HealerError({ ...baseOptions, cause: root });
        // Modern Node/Chromium expose cause on Error prototype
        expect((err as unknown as { cause?: unknown }).cause).toBe(root);
    });

    it('defaults timestamp to a recent number when not provided', () => {
        const before = Date.now();
        const err = new HealerError(baseOptions);
        const after = Date.now();
        expect(typeof err.timestamp).toBe('number');
        expect(err.timestamp).toBeGreaterThanOrEqual(before);
        expect(err.timestamp).toBeLessThanOrEqual(after);
    });

    it('defaults cause and context to undefined when not provided', () => {
        const err = new HealerError(baseOptions);
        expect(err.cause).toBeUndefined();
        expect(err.context).toBeUndefined();
    });

    it('supports severity "warn"', () => {
        const err = new HealerError({ ...baseOptions, severity: 'warn' });
        expect(err.severity).toBe('warn');
    });
});

describe('HealerError subclasses', () => {
    const subclasses: Array<{
        ctor: new (options: HealerErrorOptions) => HealerError;
        name: string;
    }> = [
        { ctor: AdapterError, name: 'AdapterError' },
        { ctor: ValidationError, name: 'ValidationError' },
        { ctor: ConfigError, name: 'ConfigError' },
        { ctor: CacheError, name: 'CacheError' },
        { ctor: WorkerError, name: 'WorkerError' },
    ];

    for (const { ctor, name } of subclasses) {
        it(`${name} extends HealerError, sets name = '${name}', forwards all options`, () => {
            const cause = new Error('boom');
            const ctx = { k: 'v' };
            const err = new ctor({
                ...baseOptions,
                code: `${name.toUpperCase()}_CODE`,
                cause,
                context: ctx,
            });
            expect(err).toBeInstanceOf(HealerError);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe(name);
            expect(err.code).toBe(`${name.toUpperCase()}_CODE`);
            expect(err.message).toBe(baseOptions.message);
            expect(err.severity).toBe(baseOptions.severity);
            expect(err.module).toBe(baseOptions.module);
            expect(err.recoverable).toBe(baseOptions.recoverable);
            expect(err.cause).toBe(cause);
            expect(err.context).toBe(ctx);
        });
    }
});

describe('LlmError dual constructor', () => {
    it('accepts the legacy 3-arg form (model, status, message) used by LlmService.ts:265', () => {
        const err = new LlmError('gpt-4', 502, 'Bad Gateway');
        expect(err).toBeInstanceOf(LlmError);
        expect(err).toBeInstanceOf(HealerError);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('LlmError');
        expect(err.model).toBe('gpt-4');
        expect(err.status).toBe(502);
        // Message is normalized to include model + status context per original class
        expect(err.message).toContain('gpt-4');
        expect(err.message).toContain('502');
        expect(err.message).toContain('Bad Gateway');
        // D-02 fields populated by the legacy 3-arg path
        expect(err.code).toBe('LLM_ERROR');
        expect(err.severity).toBe('error');
        expect(err.module).toBe('LlmService');
        expect(err.recoverable).toBe(false);
        // timestamp populated
        expect(typeof err.timestamp).toBe('number');
    });

    it('accepts the new options form', () => {
        const cause = new Error('upstream');
        const err = new LlmError({
            code: 'LLM_TIMEOUT',
            message: 'Request timed out',
            severity: 'warn',
            module: 'CustomModule',
            recoverable: true,
            model: 'claude-3',
            status: 504,
            cause,
        });
        expect(err.name).toBe('LlmError');
        expect(err.code).toBe('LLM_TIMEOUT');
        expect(err.message).toBe('Request timed out');
        expect(err.severity).toBe('warn');
        expect(err.module).toBe('CustomModule');
        expect(err.recoverable).toBe(true);
        expect(err.model).toBe('claude-3');
        expect(err.status).toBe(504);
        expect(err.cause).toBe(cause);
    });

    it('omits model/status on options form when not provided', () => {
        const err = new LlmError({
            code: 'LLM_ERROR',
            message: 'Generic',
            severity: 'error',
            module: 'LlmService',
            recoverable: false,
        });
        expect(err.model).toBeUndefined();
        expect(err.status).toBeUndefined();
    });
});
