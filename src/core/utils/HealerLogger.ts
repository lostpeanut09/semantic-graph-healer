/**
 * HealerLogger intentionally uses console.warn/error/debug/info for Obsidian logging.
 * The global ESLint config already allows these methods, but the above file-level
 * annotation makes the intent explicit for reviewers (STRIDE T-13-02-01).
 */

import { Plugin, TFile, TFolder, normalizePath } from 'obsidian';
import type { SemanticGraphHealerSettings } from '../../types';
import { sanitizeForLog, redactObject } from './RedactUtils';

/**
 * High-Fidelity API Augmentation (SOTA 2026)
 * Enables type-safe detection of the optimized 'append' method.
 */
interface VaultWithAppend {
    append(file: TFile, data: string): Promise<void>;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2MB Rotation Cap

function truncate(s: string, max = 10000): string {
    if (s.length <= max) return s;
    return s.slice(0, max) + `...[truncated ${s.length - max} chars]`;
}

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    data?: unknown;
}

/**
 * Configuration for log deduplication and rate-limiting (Phase 25 — ERR-03).
 */
interface DedupConfig {
    /** Time window in milliseconds during which identical fingerprints are collapsed. */
    windowMs: number;
    /** Max accepted log calls per module per window. */
    perModuleCap: number;
    /** Max accepted log calls across all modules per window. */
    globalCap: number;
}

const DEFAULT_DEDUP_CONFIG: DedupConfig = {
    windowMs: 5000,
    perModuleCap: 10,
    globalCap: 100,
};

/**
 * HealerLogger
 *
 * Advanced logging utility for the Semantic Graph Healer plugin.
 * Features:
 * - Level-based filtering (debug, info, warn, error).
 * - Circular in-memory buffer for exportable logs.
 * - Secure logging: masks sensitive keys and patterns (API keys, tokens, JWT).
 * - Control character neutralization to prevent log injection.
 * - Persistent file logging with size-based rotation and auto-disable on failure.
 * - Per-call deduplication of identical (level + module + normalized message) fingerprints
 *   inside a sliding time window (default 5000ms).
 * - Per-module and global rate caps enforced inside the same window.
 * - Static convenience methods that delegate to a registered singleton instance.
 */
export class HealerLogger {
    private static _singletonInstance: HealerLogger | null = null;

    /**
     * Registers a process-wide singleton instance. Subsequent static calls
     * (`HealerLogger.info`, `HealerLogger.warn`, `HealerLogger.error`,
     * `HealerLogger.debug`) delegate to this instance, which routes them
     * through the dedup / rate-limit pipeline. Pre-`setInstance` static
     * calls fall back to the console with the legacy `[SemanticHealer][LEVEL]`
     * prefix so no log line is silently lost during early module init.
     *
     * @param instance - The logger to route static calls to.
     */
    public static setInstance(instance: HealerLogger): void {
        HealerLogger._singletonInstance = instance;
    }

    /**
     * Static convenience: logs an info message via the registered singleton,
     * or via the console fallback if no instance has been registered yet.
     * @param message - The message to log.
     * @param args - Additional structured arguments.
     */
    public static info(message: string, ...args: unknown[]): void {
        if (HealerLogger._singletonInstance) {
            HealerLogger._singletonInstance.info(message, ...args);
        } else {
            console.info('[SemanticHealer][INFO]', message, ...args);
        }
    }

    /**
     * Static convenience: logs a warning via the registered singleton, or
     * via the console fallback if no instance has been registered yet.
     * @param message - The message to log.
     * @param args - Additional structured arguments.
     */
    public static warn(message: string, ...args: unknown[]): void {
        if (HealerLogger._singletonInstance) {
            HealerLogger._singletonInstance.warn(message, ...args);
        } else {
            console.warn('[SemanticHealer][WARN]', message, ...args);
        }
    }

    /**
     * Static convenience: logs an error via the registered singleton, or
     * via the console fallback if no instance has been registered yet.
     * @param message - The message to log.
     * @param args - Additional structured arguments.
     */
    public static error(message: string, ...args: unknown[]): void {
        if (HealerLogger._singletonInstance) {
            HealerLogger._singletonInstance.error(message, ...args);
        } else {
            console.error('[SemanticHealer][ERROR]', message, ...args);
        }
    }

    /**
     * Static convenience: logs a debug message via the registered singleton,
     * or via the console fallback if no instance has been registered yet.
     * @param message - The message to log.
     * @param args - Additional structured arguments.
     */
    public static debug(message: string, ...args: unknown[]): void {
        if (HealerLogger._singletonInstance) {
            HealerLogger._singletonInstance.debug(message, ...args);
        } else {
            console.debug('[SemanticHealer][DEBUG]', message, ...args);
        }
    }

    private module: string;
    private plugin: Plugin;
    private settings: SemanticGraphHealerSettings;
    private logBuffer: LogEntry[] = [];
    private maxBufferSize: number = 1000; // Circular buffer
    private fileLoggingEnabled: boolean = false;
    private fileWriteFailures: number = 0;
    private logFilePath: string = 'SemanticGraphHealer/logs';
    private dedupConfig: DedupConfig = { ...DEFAULT_DEDUP_CONFIG };
    private recentFingerprints: Map<string, number> = new Map();
    private moduleLogCounts: Map<string, number[]> = new Map();
    private globalLogTimestamps: number[] = [];

    /**
     * Creates a new HealerLogger instance for a specific module.
     *
     * @param module - Name of the module/service being logged.
     * @param plugin - The main Plugin instance.
     * @param settings - Current plugin settings for configuration.
     */
    constructor(module: string, plugin: Plugin, settings: SemanticGraphHealerSettings) {
        this.module = module;
        this.plugin = plugin;
        this.settings = settings;
        if (this.settings) {
            this.maxBufferSize = this.settings.logBufferSize || 1000;
            this.fileLoggingEnabled = this.settings.enableFileLogging || false;
            this.logFilePath = this.settings.logFilePath || 'SemanticGraphHealer/logs';
            if (this.settings.logDedupWindowMs !== undefined) {
                this.dedupConfig.windowMs = this.settings.logDedupWindowMs;
            }
            if (this.settings.logPerModuleCap !== undefined) {
                this.dedupConfig.perModuleCap = this.settings.logPerModuleCap;
            }
            if (this.settings.logGlobalCap !== undefined) {
                this.dedupConfig.globalCap = this.settings.logGlobalCap;
            }
        }
    }

    /**
     * Updates the active log level.
     * @param level - The new LogLevel.
     */
    setLevel(level: LogLevel): void {
        if (this.settings) this.settings.logLevel = level;
    }

    /**
     * Configures file-based logging.
     *
     * @param enabled - Whether to write logs to a file.
     * @param path - Optional folder path for logs.
     */
    setFileLogging(enabled: boolean, path?: string): void {
        this.fileLoggingEnabled = enabled;
        if (path) {
            this.logFilePath = path;
        }
    }

    /**
     * Live-updates the deduplication / rate-limit configuration. The new
     * values are applied to subsequent log calls without re-instantiation.
     * Existing fingerprint and per-module counts are preserved; tighter caps
     * are enforced immediately on the next call.
     *
     * @param cfg - Partial config: only the keys you want to change.
     */
    setDedupConfig(cfg: { windowMs?: number; perModuleCap?: number; globalCap?: number }): void {
        if (cfg.windowMs !== undefined && Number.isFinite(cfg.windowMs)) {
            this.dedupConfig.windowMs = Math.max(0, Math.floor(cfg.windowMs));
        }
        if (cfg.perModuleCap !== undefined && Number.isFinite(cfg.perModuleCap)) {
            this.dedupConfig.perModuleCap = Math.max(0, Math.floor(cfg.perModuleCap));
        }
        if (cfg.globalCap !== undefined && Number.isFinite(cfg.globalCap)) {
            this.dedupConfig.globalCap = Math.max(0, Math.floor(cfg.globalCap));
        }
    }

    private shouldLog(level: LogLevel): boolean {
        if (!this.settings) return true;
        const currentLevel = this.settings.logLevel;
        return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
    }

    /**
     * Trims, collapses internal whitespace runs into a single space, and
     * lowercases the message so surface-level variations ("Failed: 500" vs
     * "failed:500") produce the same fingerprint.
     */
    private normalizeMessage(message: string): string {
        return message.trim().replace(/\s+/g, ' ').toLowerCase();
    }

    private computeFingerprint(level: LogLevel, module: string, message: string): string {
        return `${level}|${module}|${this.normalizeMessage(message)}`;
    }

    /**
     * Manually prunes timestamps older than `cutoff` from a monotonically
     * non-decreasing timestamp array. Uses a forward-iterating splice loop
     * (no spread/filter, no array re-allocation) to keep GC pressure flat on
     * hot paths.
     */
    private pruneTimestamps(arr: number[], cutoff: number): void {
        for (let i = 0; i < arr.length; ) {
            if (arr[i] < cutoff) arr.splice(i, 1);
            else i++;
        }
    }

    /**
     * Returns true if the (level, module, message) triple is allowed to
     * emit under the current dedup/rate-limit config. When accepted, the
     * fingerprint, per-module and global timestamp arrays are updated as
     * a side-effect so future calls observe the new state immediately.
     */
    private shouldEmit(level: LogLevel, module: string, message: string): boolean {
        const cfg = this.dedupConfig;
        const now = Date.now();
        const cutoff = now - cfg.windowMs;

        this.pruneTimestamps(this.globalLogTimestamps, cutoff);
        const moduleTimes = this.moduleLogCounts.get(module) ?? [];
        this.moduleLogCounts.set(module, moduleTimes);
        this.pruneTimestamps(moduleTimes, cutoff);

        const fp = this.computeFingerprint(level, module, message);
        const last = this.recentFingerprints.get(fp);
        if (last !== undefined && now - last < cfg.windowMs) {
            return false;
        }

        if (cfg.perModuleCap > 0 && moduleTimes.length >= cfg.perModuleCap) {
            return false;
        }
        if (cfg.globalCap > 0 && this.globalLogTimestamps.length >= cfg.globalCap) {
            return false;
        }

        this.recentFingerprints.set(fp, now);
        moduleTimes.push(now);
        this.globalLogTimestamps.push(now);
        return true;
    }

    private formatTimestamp(): string {
        interface MomentLike {
            (): { format(f: string): string };
        }
        const m = (window as unknown as { moment: MomentLike }).moment;
        if (typeof m === 'function') {
            return m().format('YYYY-MM-DD HH:mm:ss.SSS');
        }
        return new Date().toISOString().replace('T', ' ').substring(0, 23);
    }

    private getSafeLogFileName(): string {
        interface MomentLike {
            (): { format(f: string): string };
        }
        const m = (window as unknown as { moment: MomentLike }).moment;
        const dateStr = typeof m === 'function' ? m().format('YYYY-MM-DD') : new Date().toISOString().split('T')[0];
        return `${this.logFilePath}/healer-${dateStr}.log`;
    }

    /**
     * Ultra-Hardening: Ensures log folder exists and handles path collisions with files.
     */
    private async ensureLogFolder(): Promise<TFolder | null> {
        const vault = this.plugin.app.vault;
        const folderPath = normalizePath(this.logFilePath);

        const existing = vault.getAbstractFileByPath(folderPath);
        if (existing) {
            if (existing instanceof TFolder) return existing;
            // Path collision: a file exists where we need a folder
            console.warn(`[HealerLogger] Path collision: "${folderPath}" is a file. Disabling file logging.`);
            return null;
        }

        try {
            await vault.createFolder(folderPath);
            const created = vault.getAbstractFileByPath(folderPath);
            return created instanceof TFolder ? created : null;
        } catch (e) {
            console.error(`[HealerLogger] Failed to create log folder:`, e);
            return null;
        }
    }

    /**
     * Ultra-Hardening: Size-based rotation (Cap at 2MB).
     */
    private async maybeRotate(file: TFile): Promise<TFile> {
        if (file.stat.size < MAX_LOG_BYTES) return file;

        const originalPath = file.path; // Cache path before mutation
        const rotatedPath = file.path.replace(/\.log$/, `.${Date.now()}.log`);
        try {
            await this.plugin.app.vault.rename(file, rotatedPath);
            return await this.plugin.app.vault.create(originalPath, '');
        } catch (e) {
            console.warn(`[HealerLogger] Rotation failed:`, e);
            return file;
        }
    }

    /**
     * Ultra-Hardening: Optimized append using prioritized feature detection.
     */
    private async appendLogLine(file: TFile, line: string): Promise<void> {
        const vault = this.plugin.app.vault;
        const vaultWithAppend = vault as unknown as VaultWithAppend;

        try {
            // 1. Prefer Vault.append (Native, fast, reliable optimized I/O)
            if (typeof vaultWithAppend.append === 'function') {
                await vaultWithAppend.append(file, line + '\n');
                return;
            }

            // 2. Fallback to DataAdapter.append (Direct FS access)
            if (typeof vault.adapter.append === 'function') {
                await vault.adapter.append(file.path, line + '\n');
                return;
            }

            // 3. Final Fallback: Atomic process (Slowest, O(n) on file size)
            await vault.process(file, (existing) => (existing ? existing + '\n' + line : line));
        } catch (e) {
            console.error(`[HealerLogger] Append failed:`, e);
        }
    }

    private async writeToFile(entry: LogEntry): Promise<void> {
        if (!this.fileLoggingEnabled || !this.plugin) return;

        try {
            const folder = await this.ensureLogFolder();
            if (!folder) return;

            const fileName = this.getSafeLogFileName();
            const abstractFile = this.plugin.app.vault.getAbstractFileByPath(fileName);
            let file: TFile;

            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else if (!abstractFile) {
                file = await this.plugin.app.vault.create(fileName, '');
            } else {
                return; // Collision at filename level
            }

            // Perform size-based rotation check
            file = await this.maybeRotate(file);

            const logLine = this.formatLogLine(entry);
            await this.appendLogLine(file, logLine);

            // Reset failure counter on success
            this.fileWriteFailures = 0;
        } catch (error) {
            this.fileWriteFailures++;
            console.error(`[HealerLogger] Error writing to log file:`, error);

            if (this.fileWriteFailures >= 3 && this.fileLoggingEnabled) {
                this.fileLoggingEnabled = false;
                console.warn(
                    `[HealerLogger] Disabling file logging after 3 consecutive failures to prevent performance degradation.`,
                );
            }
        }
    }

    private safeStringify(data: unknown): string {
        try {
            const redacted = redactObject(data);
            const json = JSON.stringify(redacted);
            return truncate(json);
        } catch (e) {
            return `[Serialization Error: ${e instanceof Error ? e.message : String(e)}]`;
        }
    }

    private formatLogLine(entry: LogEntry): string {
        const msg = sanitizeForLog(entry.message);
        const dataStr = entry.data ? ' ' + this.safeStringify(entry.data) : '';
        return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${msg}${dataStr}`;
    }

    private log(level: LogLevel, message: string, data?: unknown): void {
        if (!this.shouldLog(level)) return;
        if (!this.shouldEmit(level, this.module, message)) return;

        const entry: LogEntry = {
            timestamp: this.formatTimestamp(),
            level,
            module: this.module,
            message,
            data,
        };

        this.addToBuffer(entry);

        // Console output
        const logLine = this.formatLogLine(entry);
        if (level === 'error') console.error(logLine);
        else if (level === 'warn') console.warn(logLine);
        else if (level === 'info') console.info(logLine);
        else console.debug(logLine);

        // File output
        void this.writeToFile(entry);
    }

    /**
     * Logs a debug message.
     * @param message - The message text.
     * @param data - Optional data object to stringify.
     */
    debug(message: string, data?: unknown): void {
        this.log('debug', message, data);
    }

    /**
     * Logs an info message.
     * @param message - The message text.
     * @param data - Optional data object to stringify.
     */
    info(message: string, data?: unknown): void {
        this.log('info', message, data);
    }

    /**
     * Logs a warning message.
     * @param message - The message text.
     * @param data - Optional data object to stringify.
     */
    warn(message: string, data?: unknown): void {
        this.log('warn', message, data);
    }

    /**
     * Logs an error message and extracts error details.
     *
     * @param message - The message text.
     * @param error - Optional error object or context.
     */
    error(message: string, error?: unknown): void {
        const errorData =
            error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : error;
        this.log('error', message, errorData);
    }

    /**
     * Exports all logs currently in the buffer as a single string.
     * @returns A multi-line string of formatted logs.
     */
    exportLogs(): string {
        return this.logBuffer.map((entry) => this.formatLogLine(entry)).join('\n');
    }

    /**
     * Clears the in-memory log buffer.
     */
    clearBuffer(): void {
        const prevSize = this.logBuffer.length;
        this.logBuffer = [];

        // Optional audit: write to console/file WITHOUT re-buffering to maintain strict empty state
        const entry: LogEntry = {
            timestamp: this.formatTimestamp(),
            level: 'info',
            module: this.module,
            message: `Log buffer cleared (prevSize=${prevSize})`,
        };

        if (this.shouldLog('info')) {
            console.debug(this.formatLogLine(entry));
        }

        void this.writeToFile(entry);
    }

    private addToBuffer(entry: LogEntry): void {
        this.logBuffer.push(entry);

        // Respect configured max buffer size (default: 1000)
        const max = Number.isFinite(this.maxBufferSize) ? Math.floor(this.maxBufferSize) : 1000;
        const safeMax = Math.max(1, max);

        const excess = this.logBuffer.length - safeMax;
        if (excess > 0) {
            // Remove the oldest entries in one shot (less overhead than repeated shift)
            this.logBuffer.splice(0, excess);
        }
    }

    /**
     * Retrieves statistics about the current log buffer.
     * @returns Object with total count and counts per level.
     */
    getStats(): { total: number; byLevel: Record<LogLevel, number> } {
        const stats = {
            total: this.logBuffer.length,
            byLevel: { debug: 0, info: 0, warn: 0, error: 0 } as Record<LogLevel, number>,
        };
        this.logBuffer.forEach((entry) => {
            stats.byLevel[entry.level]++;
        });
        return stats;
    }
}
