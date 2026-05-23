import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Nyquist Validation Audit - Deep Architectural Alignment', () => {
    describe('Phase 13: Hardening & Release Readiness', () => {
        it('should have Husky pre-commit hook with lint:fix and format', () => {
            const path = join(process.cwd(), '.husky', 'pre-commit');
            expect(existsSync(path)).toBe(true);
            const content = readFileSync(path, 'utf-8');
            expect(content).toContain('npm run lint:fix');
            expect(content).toContain('npm run format');
        });

        it('should have Husky pre-push hook with build, lint and test', () => {
            const path = join(process.cwd(), '.husky', 'pre-push');
            expect(existsSync(path)).toBe(true);
            const content = readFileSync(path, 'utf-8');
            expect(content).toContain('npm run build');
            expect(content).toContain('npm run lint');
            expect(content).toContain('npm test');
        });

        it('should have ESLint config that includes svelte rules or runes', () => {
            const path = join(process.cwd(), '.config', 'eslint.config.js');
            expect(existsSync(path)).toBe(true);
            const content = readFileSync(path, 'utf-8');
            expect(content.toLowerCase()).toContain('svelte');
            expect(content).toContain('$state');
            expect(content).toContain('$derived');
        });

        it('should have strict typing in core workers (no any)', () => {
            const workerPath = join(process.cwd(), 'src', 'core', 'workers', 'graph-analysis-core.ts');
            const content = readFileSync(workerPath, 'utf-8');
            const anyMatches = content.match(/: any/g);
            expect(anyMatches).toBeNull();
        });

        it('should have sentence-case compliant settings', () => {
            const settingsPath = join(process.cwd(), 'src', 'views', 'sections', 'RulesSettings.ts');
            const content = readFileSync(settingsPath, 'utf-8');
            expect(content).toContain('Regex exclusion filter');
            expect(content).not.toContain("'regex exclusion filter'");
        });
    });

    describe('Phase 7: AI Tribunal & HTR Integration', () => {
        it('NYQ-07-06: should implement explicit Primary and Secondary model selection in Settings UI', () => {
            const settingsPath = join(process.cwd(), 'src', 'views', 'sections', 'PrimaryModelSettings.ts');
            const content = readFileSync(settingsPath, 'utf-8');
            expect(content).toContain('Primary model selection');
            expect(content).toContain('Secondary model selection');
            expect(content).toContain('plugin.settings.primaryModel');
            expect(content).toContain('plugin.settings.secondaryModel');
        });

        it('NYQ-07-07: should implement Safe Zone Threshold slider in Tribunal Settings', () => {
            const tribunalPath = join(process.cwd(), 'src', 'views', 'sections', 'TribunalSettings.ts');
            const content = readFileSync(tribunalPath, 'utf-8');
            expect(content).toContain('Safe zone threshold');
            expect(content).toContain('plugin.settings.safeZoneThreshold');
        });

        it('NYQ-07-08: should implement HTR Structural Weight slider in Tribunal Settings', () => {
            const tribunalPath = join(process.cwd(), 'src', 'views', 'sections', 'TribunalSettings.ts');
            const content = readFileSync(tribunalPath, 'utf-8');
            expect(content).toContain('Healer trust rate structural weight');
            expect(content).toContain('plugin.settings.htrStructuralWeight');
        });

        it('NYQ-07-09: should implement Audit Transparency UI in ReasoningView', () => {
            const dashboardPath = join(process.cwd(), 'src', 'views', 'DashboardView.ts');
            const content = readFileSync(dashboardPath, 'utf-8');
            expect(content).toContain('Tribunal audit');
            expect(content).toContain('verdict-banner');
            expect(content).toContain('secondaryReasoning');
            expect(content).toContain('details'); // Collapsible section
        });

        it('NYQ-07-10: should strictly separate audit data from primary reasoning during parsing', () => {
            const llmServicePath = join(process.cwd(), 'src', 'core', 'LlmService.ts');
            const content = readFileSync(llmServicePath, 'utf-8');
            expect(content).toContain('Strip audit tags before parsing');
            expect(content).toContain('.replace(/<tribunal_audit>[\\s\\S]*?<\\/tribunal_audit>/g');
        });
    });

    describe('Phase 3: Setting Resilience & UX Stability', () => {
        it('should implement onExternalSettingsChange for hot-reload in main.ts', () => {
            const mainPath = join(process.cwd(), 'src', 'main.ts');
            const content = readFileSync(mainPath, 'utf-8');
            expect(content).toContain('onExternalSettingsChange()');
            expect(content).toContain('External settings change detected');
        });

        it('should use SettingsSchema for validation in loadSettings', () => {
            const mainPath = join(process.cwd(), 'src', 'main.ts');
            const content = readFileSync(mainPath, 'utf-8');
            expect(content).toContain('SettingsSchema.safeParse(baseSettings)');
        });

        it('should have PerformanceService with Safety Mode logic', () => {
            const svcPath = join(process.cwd(), 'src', 'core', 'services', 'PerformanceService.ts');
            const content = readFileSync(svcPath, 'utf-8');
            expect(content).toContain('Performance Mode Transition');
            expect(content).toContain('getRecommendedBatchSize()');
        });
    });

    describe('Phase 17: Obsidian CLI Integration & Automation', () => {
        it('should have Husky configuration for hooks', () => {
            const preCommitPath = join(process.cwd(), '.husky', 'pre-commit');
            const prePushPath = join(process.cwd(), '.husky', 'pre-push');
            expect(existsSync(preCommitPath)).toBe(true);
            expect(existsSync(prePushPath)).toBe(true);

            const preCommitContent = readFileSync(preCommitPath, 'utf-8');
            expect(preCommitContent).toContain('npm run lint:fix');
            expect(preCommitContent).toContain('npm run format');

            const prePushContent = readFileSync(prePushPath, 'utf-8');
            expect(prePushContent).toContain('npm run build');
            expect(prePushContent).toContain('npm run lint');
            expect(prePushContent).toContain('npm test');
        });

        it('should instantiate this.api on class load in src/main.ts', () => {
            const mainPath = join(process.cwd(), 'src', 'main.ts');
            expect(existsSync(mainPath)).toBe(true);
            const content = readFileSync(mainPath, 'utf-8');
            expect(content).toContain('this.api = new AutomationApi(this)');
        });

        it('should register healer-action protocol handlers in src/main.ts', () => {
            const mainPath = join(process.cwd(), 'src', 'main.ts');
            expect(existsSync(mainPath)).toBe(true);
            const content = readFileSync(mainPath, 'utf-8');
            expect(content).toContain("registerObsidianProtocolHandler('healer-action'");
            expect(content).toContain("action === 'scan'");
            expect(content).toContain("action === 'apply-batch'");
            expect(content).toContain("action === 'undo-batch'");
        });

        it('should register CLI handlers in src/main.ts', () => {
            const mainPath = join(process.cwd(), 'src', 'main.ts');
            expect(existsSync(mainPath)).toBe(true);
            const content = readFileSync(mainPath, 'utf-8');
            expect(content).toContain('registerCliHandler(');
            expect(content).toContain("'healer:scan'");
            expect(content).toContain("'healer:export-suggestions'");
            expect(content).toContain("'healer:apply-batch'");
            expect(content).toContain("'healer:undo-batch'");
        });
    });
});
