import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseJsonSafe, validateInput, withErrorBoundary } from '../../../src/core/utils/ValidationUtils';
import { HealerError, ValidationError, AdapterError } from '../../../src/core/errors/HealerError';
import { Result } from '../../../src/core/errors/Result';

/**
 * Helper: extract the error from a Result<T, HealerError> known to be Err.
 * Result.unwrap() throws the contained error when Err — we catch and re-cast.
 * This avoids relying on private fields of Result (which has no
 * `unwrap_err_safe` accessor in the 25-01 delivery).
 */
function extractErr<T>(r: Result<T, HealerError>): HealerError {
    try {
        r.unwrap();
    } catch (e) {
        return e as HealerError;
    }
    throw new Error('expected Result to be Err, was Ok');
}

// ---------------------------------------------------------------------------
// parseJsonSafe
// ---------------------------------------------------------------------------
describe('parseJsonSafe', () => {
    it('test_parseJsonSafe_valid: parses a valid JSON object to Ok', () => {
        const r = parseJsonSafe('{"a":1}');
        expect(r.isOk()).toBe(true);
        if (r.isOk()) {
            expect(r.unwrap()).toEqual({ a: 1 });
        }
    });

    it('test_parseJsonSafe_malformedJson: returns ValidationError with code JSON_PARSE_ERROR, never throws', () => {
        let r: Result<unknown, HealerError> | undefined;
        expect(() => {
            r = parseJsonSafe('not json');
        }).not.toThrow();
        expect(r).toBeDefined();
        expect(r!.isErr()).toBe(true);
        const err = extractErr(r!);
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err;
        expect(ve.code).toBe('JSON_PARSE_ERROR');
        expect(ve.module).toBe('ValidationUtils');
        expect(ve.recoverable).toBe(true);
        expect(ve.context).toBeDefined();
        expect(ve.context!.rawLength).toBe('not json'.length);
    });

    it('test_parseJsonSafe_withSchema_match: narrows parsed value via Zod schema', () => {
        const schema = z.object({ a: z.number() });
        const r = parseJsonSafe<{ a: number }>('{"a":42}', schema);
        expect(r.isOk()).toBe(true);
        if (r.isOk()) {
            const v = r.unwrap();
            expect(v.a).toBe(42);
        }
    });

    it('test_parseJsonSafe_withSchema_mismatch: returns ValidationError with zodIssues in context', () => {
        const schema = z.object({ a: z.number() });
        const r = parseJsonSafe<{ a: number }>('{"a":"x"}', schema);
        expect(r.isErr()).toBe(true);
        const err = extractErr(r);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.code).toBe('SCHEMA_VALIDATION_ERROR');
        expect(err.context).toBeDefined();
        expect(Array.isArray(err.context!.zodIssues)).toBe(true);
        expect((err.context!.zodIssues as unknown[]).length).toBeGreaterThan(0);
    });

    it('test_parseJsonSafe_noThrow_onBinaryGarbage: returns Err, never throws', () => {
        const garbage = '\x00\x01\x02';
        let r: Result<unknown, HealerError> | undefined;
        expect(() => {
            r = parseJsonSafe(garbage);
        }).not.toThrow();
        expect(r!.isErr()).toBe(true);
        const err = extractErr(r!);
        expect(err.code).toBe('JSON_PARSE_ERROR');
    });
});

// ---------------------------------------------------------------------------
// validateInput
// ---------------------------------------------------------------------------
describe('validateInput', () => {
    const schema = z.object({ a: z.number() });

    it('test_validateInput_valid: returns Ok with parsed data', () => {
        const r = validateInput(schema, { a: 7 });
        expect(r.isOk()).toBe(true);
        if (r.isOk()) {
            expect(r.unwrap().a).toBe(7);
        }
    });

    it('test_validateInput_invalid: returns Err ValidationError when data is invalid and no fallback', () => {
        const r = validateInput(schema, { a: 'x' });
        expect(r.isErr()).toBe(true);
        const err = extractErr(r);
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.code).toBe('SCHEMA_VALIDATION_ERROR');
        expect(Array.isArray(err.context!.zodIssues)).toBe(true);
    });

    it('test_validateInput_withFallback_returnsOk: returns Ok(fallback) on invalid data', () => {
        const r = validateInput(schema, { a: 'x' }, { a: 0 });
        expect(r.isOk()).toBe(true);
        if (r.isOk()) {
            expect(r.unwrap()).toEqual({ a: 0 });
        }
    });

    it('test_validateInput_withoutFallback_returnsErr: returns Err when no fallback', () => {
        const r = validateInput(schema, { a: 'x' });
        expect(r.isErr()).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// withErrorBoundary
// ---------------------------------------------------------------------------
// Note on type inference: in TypeScript, `() => { throw x; }` infers a
// return type of `never`, and `never` is assignable to BOTH `T` and
// `Promise<T>` — so the overload picker matches the async overload,
// returning a Promise where the test expects a sync Result. To keep
// the test code intent clear (these are sync tests), we annotate the
// callback's return type explicitly. This is a standard TypeScript
// pattern and does not require `any` or `@ts-ignore`.
describe('withErrorBoundary', () => {
    it('test_withErrorBoundary_sync_resolve: returns Ok with value when fn resolves sync', () => {
        const r = withErrorBoundary((): number => 42, {
            module: 'X',
            recoverable: false,
        });
        expect(r.isOk()).toBe(true);
        if (r.isOk()) {
            expect(r.unwrap()).toBe(42);
        }
    });

    it('test_withErrorBoundary_sync_throw: wraps thrown error in HealerError with code UNCAUGHT_THROW', () => {
        const r = withErrorBoundary(
            (): number => {
                throw new Error('boom');
            },
            { module: 'X', recoverable: false },
        );
        expect(r.isErr()).toBe(true);
        const err = extractErr(r);
        expect(err).toBeInstanceOf(HealerError);
        expect(err.code).toBe('UNCAUGHT_THROW');
        expect(err.module).toBe('X');
        expect(err.recoverable).toBe(false);
        expect(err.cause).toBeInstanceOf(Error);
        expect((err.cause as Error).message).toBe('boom');
    });

    it('test_withErrorBoundary_sync_preservesHealerError: returns original HealerError instance, no double-wrap', () => {
        const original = new ValidationError({
            code: 'CUSTOM_CODE',
            module: 'Y',
            severity: 'error',
            recoverable: true,
            message: 'orig',
        });
        const r = withErrorBoundary(
            (): number => {
                throw original;
            },
            { module: 'X', recoverable: false },
        );
        expect(r.isErr()).toBe(true);
        const err = extractErr(r);
        expect(err).toBe(original);
        expect(err.code).toBe('CUSTOM_CODE');
    });

    it('test_withErrorBoundary_sync_customErrorType: wraps in AdapterError when errorType=AdapterError', () => {
        const r = withErrorBoundary(
            (): number => {
                throw new Error('adapter down');
            },
            { module: 'X', recoverable: true, errorType: AdapterError },
        );
        expect(r.isErr()).toBe(true);
        const err = extractErr(r);
        expect(err).toBeInstanceOf(AdapterError);
        expect(err).toBeInstanceOf(HealerError);
        expect(err.code).toBe('UNCAUGHT_THROW');
        expect(err.module).toBe('X');
        expect(err.recoverable).toBe(true);
    });

    it('test_withErrorBoundary_async_resolve: returns Promise<Ok> when async fn resolves', async () => {
        const r = await withErrorBoundary(async () => 42, {
            module: 'X',
            recoverable: false,
        });
        expect(r.isOk()).toBe(true);
        if (r.isOk()) {
            expect(r.unwrap()).toBe(42);
        }
    });

    it('test_withErrorBoundary_async_reject: wraps rejected promise in HealerError, never rejects', async () => {
        let r: Result<number, HealerError> | undefined;
        await expect(
            (async () => {
                r = await withErrorBoundary(
                    async (): Promise<number> => {
                        return Promise.reject(new Error('async boom'));
                    },
                    { module: 'Y', recoverable: true },
                );
            })(),
        ).resolves.toBeUndefined();
        expect(r).toBeDefined();
        expect(r!.isErr()).toBe(true);
        const err = extractErr(r!);
        expect(err).toBeInstanceOf(HealerError);
        expect(err.code).toBe('UNCAUGHT_THROW');
        expect(err.module).toBe('Y');
        expect(err.recoverable).toBe(true);
        expect((err.cause as Error).message).toBe('async boom');
    });

    it('test_withErrorBoundary_async_preservesHealerError: returns original HealerError for async throws', async () => {
        const original = new AdapterError({
            code: 'ASDF',
            module: 'Z',
            severity: 'error',
            recoverable: false,
            message: 'orig async',
        });
        const r = await withErrorBoundary(
            async (): Promise<number> => {
                return Promise.reject(original);
            },
            { module: 'X', recoverable: false },
        );
        expect(r.isErr()).toBe(true);
        const err = extractErr(r);
        expect(err).toBe(original);
    });

    it('test_withErrorBoundary_neverThrows: sync throw and async reject both return Result, never propagate', async () => {
        const syncR = withErrorBoundary(
            (): number => {
                throw new Error('sync bang');
            },
            { module: 'M', recoverable: false },
        );
        expect(syncR.isErr()).toBe(true);

        let asyncR: Result<number, HealerError> | undefined;
        await expect(
            (async () => {
                asyncR = await withErrorBoundary(
                    async (): Promise<number> => {
                        return Promise.reject(new Error('async bang'));
                    },
                    { module: 'M', recoverable: true },
                );
            })(),
        ).resolves.toBeUndefined();
        expect(asyncR).toBeDefined();
        expect(asyncR!.isErr()).toBe(true);
    });
});
