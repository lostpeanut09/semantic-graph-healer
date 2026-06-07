import { describe, it, expect } from 'vitest';
import { Result } from '../../../src/core/errors/Result';
import { HealerError } from '../../../src/core/errors/HealerError';

describe('Result factories', () => {
    it('Result.ok(value) returns a Result in the Ok state', () => {
        const r = Result.ok(42);
        expect(r).toBeInstanceOf(Result);
        expect(r.isOk()).toBe(true);
        expect(r.isErr()).toBe(false);
    });

    it('Result.err(error) returns a Result in the Err state', () => {
        const err = new HealerError({
            code: 'X',
            message: 'oops',
            severity: 'error',
            module: 'm',
            recoverable: false,
        });
        const r = Result.err(err);
        expect(r).toBeInstanceOf(Result);
        expect(r.isOk()).toBe(false);
        expect(r.isErr()).toBe(true);
    });

    it('default error type E is HealerError (type-level check)', () => {
        const r = Result.ok(1); // inferred as Result<number, HealerError>
        // map preserves E=HealerError while transforming T=number -> string
        const mapped: Result<string, HealerError> = r.map((n) => String(n));
        expect(mapped.isOk()).toBe(true);
        expect(mapped.unwrap()).toBe('1');
    });
});

describe('Result.isOk / Result.isErr', () => {
    it('isOk and isErr are mutually exclusive on an Ok result', () => {
        const r = Result.ok('hello');
        expect(r.isOk()).toBe(true);
        expect(r.isErr()).toBe(false);
    });

    it('isOk and isErr are mutually exclusive on an Err result', () => {
        const r = Result.err(new Error('boom'));
        expect(r.isOk()).toBe(false);
        expect(r.isErr()).toBe(true);
    });
});

describe('Result.unwrap', () => {
    it('returns the contained value on Ok', () => {
        const r = Result.ok('payload');
        expect(r.unwrap()).toBe('payload');
    });

    it('throws the contained Error on Err', () => {
        const err = new Error('upstream failure');
        const r = Result.err(err);
        expect(() => r.unwrap()).toThrow(err);
    });

    it('throws the contained HealerError on Err (preserves class identity)', () => {
        const err = new HealerError({
            code: 'BOOM',
            message: 'kapow',
            severity: 'error',
            module: 'm',
            recoverable: false,
        });
        const r = Result.err(err);
        let caught: unknown;
        try {
            r.unwrap();
        } catch (e) {
            caught = e;
        }
        expect(caught).toBe(err);
        expect(caught).toBeInstanceOf(HealerError);
    });

    it('throws a wrapper Error on Err when the contained value is not an Error', () => {
        const r = Result.err<string, string>('stringy failure');
        expect(() => r.unwrap()).toThrow();
        try {
            r.unwrap();
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toContain('stringy failure');
        }
    });
});

describe('Result.map', () => {
    it('transforms the value when Ok', () => {
        const r = Result.ok(2).map((x) => x * 3);
        expect(r.isOk()).toBe(true);
        expect(r.unwrap()).toBe(6);
    });

    it('is a no-op on Err (does not invoke the mapper)', () => {
        let invoked = false;
        const err = new Error('fail');
        const r = Result.err<number, Error>(err).map<number>((x) => {
            invoked = true;
            return x + 1;
        });
        expect(r.isErr()).toBe(true);
        expect(invoked).toBe(false);
        // The same error object is preserved.
        expect(() => r.unwrap()).toThrow(err);
    });

    it('preserves the error type E when applied to an Err', () => {
        const err = new HealerError({
            code: 'X',
            message: 'oops',
            severity: 'error',
            module: 'm',
            recoverable: false,
        });
        const r: Result<number, HealerError> = Result.err<number, HealerError>(err);
        const mapped = r.map<number>((n) => n + 1);
        // mapped is Result<number, HealerError>
        expect(mapped.isErr()).toBe(true);
    });

    it('can be chained: Result.ok(2).map(x => x + 1).map(x => x * 2).unwrap() === 6', () => {
        const result = Result.ok(2)
            .map((x) => x + 1)
            .map((x) => x * 2)
            .unwrap();
        expect(result).toBe(6);
    });

    it('chains terminate at the first Err (no mapper invoked after Err)', () => {
        let invocations = 0;
        const err = new Error('stop');
        const result = Result.err<number, Error>(err)
            .map((x) => {
                invocations++;
                return x + 1;
            })
            .map((x) => {
                invocations++;
                return x * 2;
            });
        expect(invocations).toBe(0);
        expect(result.isErr()).toBe(true);
    });
});
