import { Plugin, TFile } from 'obsidian';
import { SemanticGraphHealerSettings } from '../../types';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

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
        // Native fallback if moment is not available (March 2026 Resilience)
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

    private addToBuffer(entry: LogEntry): void {
        this.logBuffer.push(entry);

        // Circular buffer: remove old entries if limit exceeded
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
        }
    }

    private async writeToFile(entry: LogEntry): Promise<void> {
        if (!this.fileLoggingEnabled || !this.plugin) return;

        try {
            const fileName = this.getSafeLogFileName();

            // Ensure folder exists
            const folder = this.plugin.app.vault.getAbstractFileByPath(this.logFilePath);
            if (!folder) {
                await this.plugin.app.vault.createFolder(this.logFilePath);
            }

            const abstractFile = this.plugin.app.vault.getAbstractFileByPath(fileName);
            let file: TFile;
            if (abstractFile instanceof TFile) {
                file = abstractFile;
            } else if (!abstractFile) {
                file = await this.plugin.app.vault.create(fileName, '');
            } else {
                return; // Not a file
            }

            const logLine = this.formatLogLine(entry);
            const existingContent = await this.plugin.app.vault.read(file);
            await this.plugin.app.vault.modify(file, existingContent + '\n' + logLine);
        } catch (error) {
            console.error(`[HealerLogger] Error writing to log file:`, error);
        }
    }

    private formatLogLine(entry: LogEntry): string {
        const dataStr = entry.data ? JSON.stringify(entry.data) : '';
        return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message} ${dataStr}`;
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

        // Console output (always, for immediate debug)
        if (level === 'error') console.error(this.formatLogLine(entry));
        else if (level === 'warn') console.warn(this.formatLogLine(entry));
        else console.debug(this.formatLogLine(entry));

        // File output (if enabled)
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

    // Utility for log export
    exportLogs(): string {
        return this.logBuffer.map((entry) => this.formatLogLine(entry)).join('\n');
    }

    // Utility for buffer cleanup
    clearBuffer(): void {
        this.logBuffer = [];
        this.info('Log buffer cleared');
    }

    // Utility for stats
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
