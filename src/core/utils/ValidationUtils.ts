import { safeJsonParse } from './SecurityUtils';
import type { ZodType } from 'zod';
import { HealerError, ValidationError } from '../errors/HealerError';
import { Result } from '../errors/Result';

/**
 * Safe JSON.parse wrapper that optionally narrows the parsed value via a
 * Zod schema. Per design decision D-11, omitting a schema returns
 * `Result<unknown>` so callers must explicitly opt into typed parsing
 * — this prevents unverified generic-type assumptions.
 *
 * **Never throws.** Every failure mode (malformed JSON, schema rejection)
 * is captured into a `ValidationError` and returned as `Result.err`.
 *
 * @typeParam T - When a schema is provided, the schema's output type.
 *                Defaults to `unknown` so callers must narrow explicitly.
 * @param json - The raw JSON string to parse.
 * @param schema - Optional Zod schema to validate the parsed value.
 * @returns `Result.ok<T>(value)` on success, `Result.err(ValidationError)` on failure.
 */
export function parseJsonSafe<T = unknown>(json: string, schema?: ZodType<T>): Result<T> {
    let parsed: unknown;
    try {
        parsed = safeJsonParse(json);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const cause = e instanceof Error ? e : undefined;
        return Result.err<T>(
            new ValidationError({
                code: 'JSON_PARSE_ERROR',
                module: 'ValidationUtils',
                severity: 'error',
                recoverable: true,
                message: 'Failed to parse JSON: ' + message,
                cause,
                context: { rawLength: json.length },
            }),
        );
    }

    if (schema === undefined) {
        return Result.ok<T>(parsed as T);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
        return Result.err<T>(
            new ValidationError({
                code: 'SCHEMA_VALIDATION_ERROR',
                module: 'ValidationUtils',
                severity: 'error',
                recoverable: false,
                message: 'Schema validation failed',
                cause: undefined,
                context: { zodIssues: result.error.issues },
            }),
        );
    }
    return Result.ok<T>(result.data);
}

/**
 * Validates `data` against a Zod schema, returning the parsed value on
 * success. Per design decision D-12, an optional `fallback` short-circuits
 * the error path: when validation fails AND a fallback is provided,
 * `Result.ok(fallback)` is returned instead of an error. When the data
 * is valid the fallback is ignored — fresh valid data is never overridden
 * by a stale default.
 *
 * **Never throws.** All schema rejections are captured into
 * `ValidationError` instances and returned as `Result.err` (or as
 * `Result.ok(fallback)` when a fallback was provided).
 *
 * @typeParam T - The Zod schema's output type.
 * @param schema - The Zod schema to validate against.
 * @param data - The value to validate (typed as `unknown` — no trust assumed).
 * @param fallback - Optional fallback value to return when validation fails.
 * @returns `Result.ok<T>(value)` on success, `Result.ok(fallback)` on failure
 *          when a fallback is provided, otherwise `Result.err(ValidationError)`.
 */
export function validateInput<T>(schema: ZodType<T>, data: unknown, fallback?: T): Result<T> {
    const result = schema.safeParse(data);
    if (result.success) {
        return Result.ok<T>(result.data);
    }
    if (fallback !== undefined) {
        return Result.ok<T>(fallback);
    }
    return Result.err<T>(
        new ValidationError({
            code: 'SCHEMA_VALIDATION_ERROR',
            module: 'ValidationUtils',
            severity: 'error',
            recoverable: false,
            message: 'Schema validation failed',
            cause: undefined,
            context: { zodIssues: result.error.issues },
        }),
    );
}

/**
 * Options accepted by {@link withErrorBoundary}.
 *
 * - `module`      — name of the calling module (attached to the wrapped error).
 * - `recoverable` — whether the calling layer is expected to retry / fall back.
 * - `errorType`   — optional `HealerError` subclass constructor. When set,
 *                   unexpected throws are wrapped in an instance of that
 *                   subclass instead of plain `HealerError`. Existing
 *                   `HealerError` instances thrown by `fn` are preserved
 *                   unchanged (no double-wrapping).
 */
export interface WithErrorBoundaryOptions {
    module: string;
    recoverable: boolean;
    errorType?: new (...args: unknown[]) => HealerError;
}

/**
 * Async overload — declared FIRST so the more specific `Promise<T>` shape
 * is matched before the generic `T` overload when `fn` returns a thenable.
 * Wraps an asynchronous function so that both synchronous throws and
 * rejected promises are captured as `Result.err(HealerError)` instead
 * of propagating. Per design decision D-13, the dual overload guarantees
 * that async inputs return `Promise<Result<T>>` (never a raw rejected
 * promise).
 *
 * **Never throws and never rejects.** Existing `HealerError` rejections
 * are resolved as `Result.err(originalError)`; other rejection reasons
 * are wrapped in a new `HealerError` (or the configured `errorType`)
 * with `code: 'UNCAUGHT_THROW'`.
 */
export function withErrorBoundary<T>(fn: () => Promise<T>, options: WithErrorBoundaryOptions): Promise<Result<T>>;
/**
 * Sync overload — declared SECOND. Wraps a synchronous function so that
 * any thrown value is captured as `Result.err(HealerError)` instead of
 * propagating. Per design decision D-13, explicit overloads guarantee the
 * right return-type inference for sync vs. async inputs.
 *
 * **Never throws.** Existing `HealerError` instances are returned as-is
 * (no double-wrap); other thrown values are wrapped in a new
 * `HealerError` (or the configured `errorType`) with
 * `code: 'UNCAUGHT_THROW'`.
 */
export function withErrorBoundary<T>(fn: () => T, options: WithErrorBoundaryOptions): Result<T>;
/**
 * Shared implementation of the sync/async overloads. The signature uses
 * `unknown` for the runtime return type because TypeScript cannot prove
 * that `T | Promise<T>` is well-formed when `T` itself could be a
 * Promise type — using `unknown` is the standard escape hatch. The
 * overloads above preserve the precise public types.
 */
export function withErrorBoundary(
    fn: () => unknown,
    options: WithErrorBoundaryOptions,
): Result<unknown> | Promise<Result<unknown>> {
    let syncResult: unknown;
    try {
        syncResult = fn();
    } catch (e: unknown) {
        return wrapError(e, options);
    }
    if (isPromiseLike(syncResult)) {
        return wrapAsync(syncResult, options);
    }
    return Result.ok<unknown>(syncResult);
}

/**
 * Internal: type-narrowed check for thenables. Returns true only for
 * objects that expose a callable `.then` method.
 */
function isPromiseLike(v: unknown): v is Promise<unknown> {
    return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
}

/**
 * Internal: wrap a synchronously thrown value into a `Result.err`.
 * HealerError instances are preserved (no double-wrap); other thrown
 * values are wrapped in a new HealerError (or the configured
 * `errorType`) with `code: 'UNCAUGHT_THROW'`.
 */
function wrapError(e: unknown, options: WithErrorBoundaryOptions): Result<never> {
    if (e instanceof HealerError) {
        return Result.err<never>(e);
    }
    const Ctor = options.errorType ?? HealerError;
    const cause = e instanceof Error ? e : undefined;
    return Result.err<never>(
        new Ctor({
            code: 'UNCAUGHT_THROW',
            module: options.module,
            severity: 'error',
            recoverable: options.recoverable,
            cause,
            context: { thrownType: typeof e },
        }),
    );
}

/**
 * Internal: await a known-promise result, catching both synchronous
 * throws (from the await machinery itself) and asynchronous rejections.
 * HealerError rejections are preserved (no double-wrap); other rejection
 * reasons are wrapped in a new HealerError (or the configured
 * `errorType`) with `code: 'UNCAUGHT_THROW'`.
 */
async function wrapAsync(p: Promise<unknown>, options: WithErrorBoundaryOptions): Promise<Result<unknown>> {
    try {
        const v = await p;
        return Result.ok<unknown>(v);
    } catch (e: unknown) {
        if (e instanceof HealerError) {
            return Result.err<unknown>(e);
        }
        const Ctor = options.errorType ?? HealerError;
        const cause = e instanceof Error ? e : undefined;
        return Result.err<unknown>(
            new Ctor({
                code: 'UNCAUGHT_THROW',
                module: options.module,
                severity: 'error',
                recoverable: options.recoverable,
                cause,
                context: { thrownType: typeof e },
            }),
        );
    }
}
