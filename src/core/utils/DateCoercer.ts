import { isRecord } from './DatacoreUtils';

/**
 * Coerces unknown values (number or Luxon DateTime) to milliseconds without
 * requiring a runtime dependency on Luxon.
 */
export function coerceToMillis(v: unknown): number | null {
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) return null;
        return v < 10000000000 ? v * 1000 : v;
    }
    if (v instanceof Date) {
        const ms = v.getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    if (!isRecord(v)) return null;
    const fn = v['toMillis'];
    if (typeof fn !== 'function') return null;
    const result: unknown = Reflect.apply(fn, v, []);
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
}

/**
 * Truncate a date to midnight while preserving Luxon identity when possible.
 */
export function coerceToStartOfDay(v: unknown, fallbackMillis: number): unknown {
    if (isRecord(v)) {
        const fn = v['startOf'];
        if (typeof fn === 'function') {
            const result: unknown = Reflect.apply(fn, v, ['day']);
            if (isRecord(result) && typeof result['toMillis'] === 'function') return result;
        }
    }
    const win = window as unknown as {
        luxon?: {
            DateTime?: {
                fromMillis(ms: number, opts?: { zone?: string }): { startOf(unit: string): unknown };
            };
        };
    };
    if (win.luxon?.DateTime && typeof win.luxon.DateTime.fromMillis === 'function') {
        const dt = win.luxon.DateTime.fromMillis(coerceToMillis(v) ?? fallbackMillis, { zone: 'local' });
        const startOfFn = dt['startOf'] as (unit: string) => unknown;
        return Reflect.apply(startOfFn, dt, ['day']);
    }
    const d = new Date(coerceToMillis(v) ?? fallbackMillis);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Preserves Luxon identity for "Date with Time" objects when possible.
 */
export function coerceToDateTime(
    v: unknown,
    fallbackMillis: number,
    dv?: { date?: (v: string) => unknown } | null,
): unknown {
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? new Date(fallbackMillis) : v;
    if (isRecord(v) && typeof v['toMillis'] === 'function') return v;
    if (typeof v === 'string') {
        const normalized = /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
        if (dv && typeof dv.date === 'function') {
            try {
                const parsed = dv.date(normalized);
                if (parsed != null) return parsed;
            } catch {
                /* no-op */
            }
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            const d = new Date(`${normalized}T00:00:00`);
            if (!Number.isNaN(d.getTime())) return d;
        }
        const d = new Date(normalized);
        if (!Number.isNaN(d.getTime())) return d;
    }
    const win = window as unknown as {
        luxon?: {
            DateTime?: { fromMillis(ms: number, opts?: { zone?: string }): unknown };
        };
    };
    if (win.luxon?.DateTime && typeof win.luxon.DateTime.fromMillis === 'function') {
        return win.luxon.DateTime.fromMillis(coerceToMillis(v) ?? fallbackMillis, {
            zone: 'local',
        });
    }
    return new Date(coerceToMillis(v) ?? fallbackMillis);
}

/**
 * Strict Date Parsing aligned with Dataview inference.
 */
export function normalizeStrictDateString(value: string): string | null {
    const v = value.trim();
    if (/^\d{8}$/.test(v)) {
        return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(v)) {
        return v;
    }
    return null;
}

export function parseDateStrict(
    value: unknown,
    dcApi: unknown,
    dvApi: unknown,
    opts: { allowEpochNumbers?: boolean } = {},
): unknown {
    if (value == null) return undefined;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? undefined : value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return undefined;
        if (!opts.allowEpochNumbers) return undefined;
        const ms = value < 10000000000 ? value * 1000 : value;
        return coerceToDateTime(ms, ms);
    }
    if (isRecord(value) && typeof value['toMillis'] === 'function') {
        return value;
    }
    if (typeof value !== 'string') return undefined;

    const normalized = normalizeStrictDateString(value);
    if (!normalized) return undefined;

    const coerce = isRecord(dcApi) ? dcApi['coerce'] : null;
    if (isRecord(coerce) && typeof coerce['date'] === 'function') {
        try {
            const parsed = Reflect.apply(coerce['date'] as (...args: unknown[]) => unknown, coerce, [normalized]);
            if (parsed != null) return parsed;
        } catch {
            /* no-op */
        }
    }

    const dv = dvApi as { date?: (v: string) => unknown } | null;
    if (dv && typeof dv.date === 'function') {
        try {
            const parsed = dv.date(normalized);
            if (parsed != null) return parsed;
        } catch {
            /* no-op */
        }
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        const d = new Date(`${normalized}T00:00:00`);
        return Number.isNaN(d.getTime()) ? undefined : d;
    }

    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
