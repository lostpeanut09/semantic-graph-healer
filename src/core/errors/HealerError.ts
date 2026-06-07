/**
 * Severity classification for HealerError instances.
 * - 'error': Hard failure that breaks an operation (default).
 * - 'warn':  Recoverable issue worth surfacing to the user.
 */
export type Severity = 'error' | 'warn';

/**
 * Options bag for constructing a HealerError or one of its domain subclasses.
 *
 * Required fields: code, message, severity, module, recoverable.
 * Optional fields: cause, context, timestamp (defaults to Date.now()).
 */
export interface HealerErrorOptions {
    /** Stable, machine-readable error code (e.g. 'LLM_TIMEOUT', 'ADAPTER_NOT_FOUND'). */
    readonly code: string;
    /** Human-readable error message. */
    readonly message: string;
    /** Severity classification. */
    readonly severity: Severity;
    /** Originating module/service name (e.g. 'LlmService', 'DatacoreAdapter'). */
    readonly module: string;
    /** Upstream cause to attach to the Error.cause chain. */
    readonly cause?: Error | undefined;
    /** Free-form context bag. MUST NOT contain raw secrets, API keys, or PII — HealerLogger will redact known sensitive keys when serializing. */
    readonly context?: Record<string, unknown> | undefined;
    /** Unix epoch milliseconds. Defaults to Date.now() when not provided. */
    readonly timestamp?: number | undefined;
    /** Whether the calling layer is expected to retry / fall back. */
    readonly recoverable: boolean;
}

/**
 * Base class for all typed errors raised inside Semantic Graph Healer.
 *
 * Each instance carries 8 structured fields (D-02) so downstream
 * consumers (HealerLogger, dashboards, error reporters) can route,
 * display, and aggregate errors by code, module, or severity without
 * resorting to string parsing.
 *
 * Subclassing: extend with a thin wrapper that sets `this.name` and
 * forwards all options to `super()`. The `name` property is used by
 * V8/Chromium to attribute stack frames.
 */
export class HealerError extends Error {
    public readonly code: string;
    public readonly severity: Severity;
    public readonly module: string;
    public readonly cause: Error | undefined;
    public readonly context: Record<string, unknown> | undefined;
    public readonly timestamp: number;
    public readonly recoverable: boolean;

    /**
     * @param options - Structured options bag with all 8 D-02 fields.
     */
    constructor(options: HealerErrorOptions) {
        super(options.message, options.cause ? { cause: options.cause } : undefined);
        this.name = 'HealerError';
        this.code = options.code;
        this.severity = options.severity;
        this.module = options.module;
        this.cause = options.cause;
        this.context = options.context;
        this.timestamp = options.timestamp ?? Date.now();
        this.recoverable = options.recoverable;
        // Restore the prototype chain when targeting older transpilers.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Errors raised by metadata/graph adapters (Datacore, LadybugDB, Breadcrumbs, etc.).
 */
export class AdapterError extends HealerError {
    constructor(options: HealerErrorOptions) {
        super(options);
        this.name = 'AdapterError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Errors raised by input validation / schema checks.
 */
export class ValidationError extends HealerError {
    constructor(options: HealerErrorOptions) {
        super(options);
        this.name = 'ValidationError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Errors raised by plugin configuration / settings operations.
 */
export class ConfigError extends HealerError {
    constructor(options: HealerErrorOptions) {
        super(options);
        this.name = 'ConfigError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Options accepted by the new LlmError(options) form.
 * Extends HealerErrorOptions with optional LLM-specific fields.
 */
export interface LlmErrorOptions extends HealerErrorOptions {
    /** LLM model identifier associated with the failure. */
    readonly model?: string;
    /** HTTP status code returned by the upstream LLM API, if any. */
    readonly status?: number;
}

/**
 * Errors raised by the LlmService. Accepts BOTH signatures for back-compat:
 *
 * - Legacy: `new LlmError(model, status, message)` — preserves the call site
 *   at LlmService.ts:265 and any external consumers that read `.model` / `.status`.
 * - New: `new LlmError(options)` — full D-02 options bag plus optional
 *   `model` / `status` for richer context.
 */
export class LlmError extends HealerError {
    public readonly model: string | undefined;
    public readonly status: number | undefined;

    /**
     * New options-based form.
     * @param options - HealerErrorOptions plus optional LLM-specific fields.
     */
    constructor(options: LlmErrorOptions);
    /**
     * Legacy 3-arg form preserved for the existing call site in LlmService.
     * @param model - The name of the model that failed.
     * @param status - The HTTP status code of the failure.
     * @param message - The error message.
     */
    constructor(model: string, status: number, message: string);
    constructor(optionsOrModel: LlmErrorOptions | string, legacyStatus?: number, legacyMessage?: string) {
        if (typeof optionsOrModel === 'string') {
            const model = optionsOrModel;
            // 0 is not a valid HTTP status; keep the field undefined when
            // the legacy caller does not pass one so downstream consumers
            // can use a presence check rather than treating 0 as meaningful.
            const status = legacyStatus;
            const message = legacyMessage ?? '';
            super({
                code: 'LLM_ERROR',
                message: `LLM [${model}] failed: ${status} - ${message}`,
                severity: 'error',
                module: 'LlmService',
                recoverable: status !== undefined && (status === 429 || status >= 500),
            });
            this.model = model;
            this.status = status;
        } else {
            super(optionsOrModel);
            this.model = optionsOrModel.model;
            this.status = optionsOrModel.status;
        }
        this.name = 'LlmError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Errors raised by the StructuralCache and related cache layers.
 */
export class CacheError extends HealerError {
    constructor(options: HealerErrorOptions) {
        super(options);
        this.name = 'CacheError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Errors raised by background workers (graph analysis, indexing, etc.).
 */
export class WorkerError extends HealerError {
    constructor(options: HealerErrorOptions) {
        super(options);
        this.name = 'WorkerError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
