/* eslint-disable */
/**
 * assemble_v8.cjs: Legacy build script for Phase 3 snapshots.
 * This file is NOT part of the production bundle but is used for technical audits.
 */
const fs = require('fs');
const path = require('path');

const vaultPath = 'c:\\Scuola 2\\.obsidian\\plugins\\semantic-graph-healer';
const desktopPath = 'C:\\Users\\gabri\\Desktop\\SemanticGraphHealer_v1.4.3_FULL_SOURCE.md';

const files = [
    'main.ts',
    'types.ts',
    'DashboardView.ts',
    'SettingsTab.ts',
    'core/CacheService.ts',
    'core/TopologyAnalyzer.ts',
    'core/LinkPredictionEngine.ts',
    'core/LlmService.ts',
    'core/QualityAnalyzer.ts',
    'core/ReasoningService.ts',
    'core/SuggestionExecutor.ts',
    'core/HealerUtils.ts',
    'styles.css',
    'manifest.json',
];

let content = '# 🚀 Semantic Graph Healer: v1.4.3 FULL SOURCE\n\n';

for (const relPath of files) {
    const fullPath = path.join(vaultPath, relPath);
    if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        content += `\n## 📄 ${relPath}\n`;
        content += '```typescript\n';
        content += fileContent;
        content += '\n```\n';
    } else {
        content += `\n## 📄 ${relPath} (NOT FOUND)\n`;
    }
}

fs.writeFileSync(desktopPath, content, 'utf8');
console.log('Done! Check desktop.');
