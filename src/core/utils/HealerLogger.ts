import { Plugin, TFile, TFolder, normalizePath } from 'obsidian';
import { SemanticGraphHealerSettings } from '../../types';

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

// 1) SOTA 2026: Blacklist of sensitive keys to redact from logs (prevent accidental leaks)
const SECRET_KEYS = new Set([
    'apikey',
    'api_key',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'bearer',
    'password',
    'pass',
    'secret',
    'client_secret',
    'privatekey',
    'private_key',
]);

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2MB Rotation Cap

/**
 * Ultra-Hardening: Masks sensitive patterns (Bearer, JWT) in raw strings.
 */
function maskSensitiveStrings(s: string): string {
    // Mask Bearer tokens: Bearer <token>
    let masked = s.replace(/\bBearer\s+[A-Za-z0-9._~-]{10,}(?:\.[A-Za-z0-9._~-]+){0,2}\b/gi, 'Bearer ***');

    // Mask JWT-like structures (starts with eyJ... contains dots, minimum length)
    masked = masked.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '***JWT***');

    return masked;
}

/**
 * Ultra-Hardening: Neutralizes ALL control characters (ASCII 0x00-0x1F + 0x7F) to prevent log injection.
 */
function sanitizeForLog(s: string): string {
    // Mask sensitive sequences before escaping control chars
    const masked = maskSensitiveStrings(s);

    // Escape Line Breaks first for readability
    let sanitized = masked.replace(/\r/g, '\\r').replace(/\n/g, '\\n');

    // Neutralize other control chars (including Tab, Null, etc.)
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\u0000-\u001F\u007F]/g, (ch) => {
        if (ch === '\t') return '\\t';
        return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
    });

    return sanitized;
}

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

export class HealerLogger {
    private module: string;
    private plugin: Plugin;
    private settings: SemanticGraphHealerSettings;
    private logBuffer: LogEntry[] = [];
    private maxBufferSize: number = 1000; // Circular buffer
    private fileLoggingEnabled: boolean = false;
    private fileWriteFailures: number = 0;
    private logFilePath: string = 'SemanticGraphHealer/logs';

    constructor(module: string, plugin: Plugin, settings: SemanticGraphHealerSettings) {
        this.module = module;
        this.plugin = plugin;
        this.settings = settings;
        if (this.settings) {
            this.maxBufferSize = this.settings.logBufferSize || 1000;
            this.fileLoggingEnabled = this.settings.enableFileLogging || false;
            this.logFilePath = this.settings.logFilePath || 'SemanticGraphHealer/logs';
        }
    }

    setLevel(level: LogLevel): void {
        if (this.settings) this.settings.logLevel = level;
    }

    setFileLogging(enabled: boolean, path?: string): void {
        this.fileLoggingEnabled = enabled;
        if (path) {
            this.logFilePath = path;
        }
    }

    private shouldLog(level: LogLevel): boolean {
        if (!this.settings) return true;
        const currentLevel = this.settings.logLevel as LogLevel;
        return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
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
            const seen = new WeakSet<object>();
            const json = JSON.stringify(data, (key, value: unknown) => {
                if (key && SECRET_KEYS.has(key.toLowerCase())) {
                    return '***';
                }

                if (typeof value === 'string') {
                    // Apply both sanitization and inline masking for strings in data
                    return sanitizeForLog(value);
                }

                if (typeof value === 'bigint') {
                    return value.toString() + 'n';
                }

                if (value !== null && typeof value === 'object') {
                    if (seen.has(value)) {
                        return '[Circular]';
                    }
                    seen.add(value);
                }

                return value;
            });

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
        else console.debug(logLine);

        // File output
        void this.writeToFile(entry);
    }

    debug(message: string, data?: unknown): void {
        this.log('debug', message, data);
    }

    info(message: string, data?: unknown): void {
        this.log('info', message, data);
    }

    warn(message: string, data?: unknown): void {
        this.log('warn', message, data);
    }

    error(message: string, error?: unknown): void {
        const errorData =
            error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : error;
        this.log('error', message, errorData);
    }

    exportLogs(): string {
        return this.logBuffer.map((entry) => this.formatLogLine(entry)).join('\n');
    }

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
