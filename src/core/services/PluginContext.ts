// src/core/services/PluginContext.ts
// Minimal dependency interfaces to break runtime circular dependencies.
// Pattern: GraphWorkerService already uses PluginWithSettings successfully.

import type { App } from 'obsidian';
import type { SemanticGraphHealerSettings, HealerNotifier } from '../../types';
import type { CacheService } from '../CacheService';
import type { GraphWorkerService } from './GraphWorkerService';
import type { PerformanceService } from './PerformanceService';

/**
 * Context injected into TopologyAnalyzer to avoid importing main plugin class.
 * Breaks circular dependencies by providing minimal required interfaces.
 */
export interface AnalysisContext {
    /** The Obsidian App instance */
    app: App;
    /** Plugin settings */
    settings: SemanticGraphHealerSettings;
    /** Cache service with restricted access to specific methods/properties */
    cache: Pick<CacheService, 'suggestions' | 'save' | 'pushHistory' | 'topologicalScores' | 'vectorEmbeddings'>;
    /** Service for offloading graph computations to workers */
    graphWorkerService: GraphWorkerService;
    /** Service for monitoring and managing performance */
    performanceService: PerformanceService;
    /** Notifier for user-facing alerts and updates */
    notifier: HealerNotifier;
}

/**
 * Context injected into SuggestionExecutor (extends AnalysisContext).
 * Adds capabilities required for executing healing suggestions.
 */
export interface ExecutionContext extends AnalysisContext {
    /** Plugin manifest information */
    manifest: { dir?: string };
    /**
     * Persists current plugin settings to disk.
     * @returns A promise that resolves when settings are saved.
     */
    saveSettings(): Promise<void>;
    /**
     * Triggers a refresh of the dashboard view.
     * @returns A promise that resolves when the dashboard is refreshed.
     */
    refreshDashboard(): Promise<void>;
}

/**
 * Context injected into GraphEngine.
 * Provides necessary services and settings for graph operations.
 */
export interface GraphContext {
    /** The Obsidian App instance */
    app: App;
    /** Plugin settings */
    settings: SemanticGraphHealerSettings;
    /** Cache service with restricted access to graph-related properties */
    cache: Pick<CacheService, 'topologicalScores' | 'save' | 'vectorEmbeddings'>;
    /** Service for offloading graph computations to workers */
    graphWorkerService: GraphWorkerService;
    /** Service for monitoring and managing performance */
    performanceService: PerformanceService;
}

/**
 * Context injected into KeychainService.
 * Provides access to App, settings, and persistence methods.
 */
export interface KeychainContext {
    /** The Obsidian App instance */
    app: App;
    /** Plugin settings */
    settings: SemanticGraphHealerSettings;
    /**
     * Persists current plugin settings to disk.
     * @returns A promise that resolves when settings are saved.
     */
    saveSettings(): Promise<void>;
    /**
     * Optional callback invoked when keychain corruption is detected.
     */
    onCorruptionDetected?(): void;
}
