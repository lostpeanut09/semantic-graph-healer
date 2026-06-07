import { HealerError } from './HealerError';

/**
 * Internal discriminator used by the Result class to distinguish
 * the Ok and Err variants without exposing the storage shape.
 */
type ResultState<T, E> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'err'; readonly error: E };

/**
 * Class-based Result type for fallible operations.
 *
 * Forces construction through `Result.ok(value)` or `Result.err(error)`
 * (the public constructor is private) so the internal state is always
 * one of the two well-formed variants — never both, never neither.
 *
 * Default error type `E` is `HealerError`, matching the project's typed
 * error hierarchy. The previous `HealerError | undefined` shape is
 * preserved at call sites by reading `.isOk()` / `.isErr()` first.
 *
 * Pattern:
 * ```ts
 * const r: Result<User, AdapterError> = await adapter.fetchUser(id);
 * if (r.isOk()) {
 *     console.log(r.unwrap().name);
 * } else {
 *     HealerLogger.error('fetch failed', r.unwrap_err_safe());
 * }
 * ```
 */
export class Result<T, E = HealerError> {
    private readonly _state: ResultState<T, E>;

    /**
     * Private constructor — use {@link Result.ok} or {@link Result.err}.
     * The compiler will not allow direct invocation from outside this class.
     */
    private constructor(state: ResultState<T, E>) {
        this._state = state;
    }

    /**
     * Wraps a successful value in a Result.
     * @param value - The success value.
     */
    public static ok<T, E = HealerError>(value: T): Result<T, E> {
        return new Result<T, E>({ kind: 'ok', value });
    }

    /**
     * Wraps a failure in a Result.
     * @param error - The error value (typically a HealerError subclass).
     */
    public static err<T, E = HealerError>(error: E): Result<T, E> {
        return new Result<T, E>({ kind: 'err', error });
    }

    /**
     * @returns `true` if this Result holds an Ok value.
     */
    public isOk(): boolean {
        return this._state.kind === 'ok';
    }

    /**
     * @returns `true` if this Result holds an Err value.
     */
    public isErr(): boolean {
        return this._state.kind === 'err';
    }

    /**
     * Returns the contained value when Ok. When Err, throws the contained
     * error. If the contained value is not an `Error` instance, wraps it
     * in a new `Error` so the throw is always a proper `Error`.
     */
    public unwrap(): T {
        if (this._state.kind === 'ok') {
            return this._state.value;
        }
        const e = this._state.error;
        if (e instanceof Error) {
            throw e;
        }
        throw new Error(String(e));
    }

    /**
     * Maps a function over the Ok value. On Err the mapper is not invoked
     * and the error is propagated unchanged.
     */
    public map<U>(fn: (value: T) => U): Result<U, E> {
        if (this._state.kind === 'ok') {
            return Result.ok<U, E>(fn(this._state.value));
        }
        return Result.err<U, E>(this._state.error);
    }
}
