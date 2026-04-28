// src/core/services/PluginContext.ts
// Minimal dependency interfaces to break runtime circular dependencies.
// Pattern: GraphWorkerService already uses PluginWithSettings successfully.

import type { App } from 'obsidian';
import type { SemanticGraphHealerSettings } from '../../types';
import type { CacheService } from '../CacheService';
import type { GraphWorkerService } from './GraphWorkerService';

/** Context injected into TopologyAnalyzer to avoid importing main plugin class */
export interface AnalysisContext {
    app: App;
    settings: SemanticGraphHealerSettings;
    cache: Pick<CacheService, 'suggestions' | 'save' | 'pushHistory'>;
    graphWorkerService: GraphWorkerService;
}

/** Context injected into SuggestionExecutor (extends AnalysisContext) */
export interface ExecutionContext extends AnalysisContext {
    manifest: { dir?: string };
    saveSettings(): Promise<void>;
    refreshDashboard(): Promise<void>;
}

/** Context injected into GraphEngine */
export interface GraphContext {
    app: App;
    settings: SemanticGraphHealerSettings;
    graphWorkerService: GraphWorkerService;
}

/** Context injected into KeychainService */
export interface KeychainContext {
    app: App;
    settings: SemanticGraphHealerSettings;
    saveSettings(): Promise<void>;
}
