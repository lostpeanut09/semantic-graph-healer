<script lang="ts">
  import type { DashboardStore } from '../DashboardStore.svelte';
  import type SemanticGraphHealer from '../../../main';
  import SuggestionCard from './SuggestionCard.svelte';
  import type { Suggestion, HistoryItem } from '../../../types';
  import { Notice } from 'obsidian';

  let { store, plugin } = $props<{
    store: DashboardStore;
    plugin: SemanticGraphHealer;
  }>();

  let activeTab = $state('all');

  const tabs = [
    { id: 'all', label: 'All Issues' },
    { id: 'structural', label: 'Structural Gaps' },
    { id: 'logic', label: 'Logic Loops' },
    { id: 'blackholes', label: 'Black Holes' },
    { id: 'ai', label: 'AI Suggestions' }
  ];

  let currentItems = $derived.by(() => {
    switch (activeTab) {
      case 'structural': return store.structuralGaps;
      case 'logic': return store.logicLoops;
      case 'blackholes': return store.blackHoles;
      case 'ai': return store.aiSuggestions;
      case 'all':
      default: return store.suggestions;
    }
  });

  async function handleExecute(suggestion: Suggestion) {
    if (suggestion.id.startsWith('bridge_gap')) {
        const success = await plugin.executor.executeRelink(suggestion);
        if (success) store.refresh();
    } else {
        const success = await plugin.executor.execute(suggestion);
        if (success) store.refresh();
    }
  }

  async function handleIgnore(suggestion: Suggestion) {
    if (!plugin.settings.proximityIgnoreList.includes(suggestion.link)) {
        plugin.settings.proximityIgnoreList.push(suggestion.link);
    }
    plugin.cache.suggestions = plugin.cache.suggestions.filter((s: Suggestion) => s.id !== suggestion.id);
    plugin.cache.save();
    await plugin.saveSettings();
    store.refresh();
    new Notice(`${suggestion.link} ignored.`);
  }

  async function handleReasoning(suggestion: Suggestion) {
    const notice = new Notice('Gathering context for AI reasoning...', 0);
    try {
        const result = await plugin.reasoner.analyze(suggestion);
        notice.hide();
        if (result) {
            suggestion.reasoning = result;
            plugin.cache.save();
            await plugin.saveSettings();
            store.refresh();
            new Notice('AI reasoning complete.');
        } else {
            new Notice('AI Reasoning failed. Check console.');
        }
    } catch(e) {
        notice.hide();
        console.error(e);
    }
  }

  let bannerPath = $derived.by(() => {
    const manifest = plugin.manifest as any;
    const dir = manifest.dir ?? '';
    return plugin.app.vault.adapter.getResourcePath(`${dir}/assets/banner.png`);
  });
</script>

<div class="healer-dashboard-container">
  <img src={bannerPath} alt="Banner" class="healer-dashboard-banner" style="width: 100%; height: auto; border-radius: 4px; margin-bottom: 1em;" />

  <div class="healer-dashboard-header-row" style="margin-bottom: 1em;">
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">Semantic health</div>
        <div class="setting-item-description">Review unresolved topological and structural issues.</div>
      </div>
    </div>
  </div>

  <div class="healer-tabs" style="display: flex; gap: 8px; margin-bottom: 1em; border-bottom: 1px solid var(--background-modifier-border); padding-bottom: 8px; overflow-x: auto;">
    {#each tabs as tab}
      <button 
        class="healer-tab-btn" 
        style="background: {activeTab === tab.id ? 'var(--interactive-accent)' : 'transparent'}; color: {activeTab === tab.id ? 'var(--text-on-accent)' : 'var(--text-normal)'}; border: none; padding: 4px 12px; cursor: pointer; border-radius: 4px;"
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="healer-dashboard-list-area">
    {#if currentItems.length > 0}
      {#each currentItems as item (item.id)}
        <SuggestionCard 
          suggestion={item}
          onExecute={handleExecute}
          onIgnore={handleIgnore}
          onReasoning={handleReasoning}
        />
      {/each}
    {:else}
      <div class="healer-card" style="padding: 1em; text-align: center; color: var(--text-muted);">
        <p>No issues found for this category.</p>
      </div>
    {/if}
  </div>

  <div class="setting-item setting-item-heading" style="margin-top: 2em;">
    <div class="setting-item-info">
      <div class="setting-item-name">History</div>
    </div>
  </div>
  <div class="healer-history-list">
    {#if store.history.length === 0}
      <p class="log-muted" style="color: var(--text-muted);">No actions performed yet.</p>
    {:else}
      {#each store.history.slice(-5).reverse() as item}
        <div class="healer-history-row" style="display: flex; gap: 8px; font-size: 0.9em; margin-bottom: 4px;">
          <span class="healer-history-timestamp" style="color: var(--text-muted);">
            [{new Date(item.timestamp).toLocaleTimeString()}]
          </span>
          <span>{item.action} ↔ <b>{item.file}</b></span>
          <span class="healer-history-badge" style="background-color: var(--background-modifier-active-hover); padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">
            {item.type.toUpperCase()}
          </span>
        </div>
      {/each}
    {/if}
  </div>
</div>
