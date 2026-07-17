<script lang="ts">
  import type SemanticGraphHealer from '../main';
  import { Notice } from 'obsidian';
  import type { CommunitySummary } from '../core/services/GraphRagService';

  let { plugin } = $props<{
    plugin: SemanticGraphHealer;
  }>();

  let query = $state('');
  let loading = $state(false);
  let answer = $state('');
  let communities = $state<(CommunitySummary & { score: number })[]>([]);

  async function handleSearch() {
    if (!query.trim()) return;

    loading = true;
    answer = '';
    communities = [];

    try {
      const result = await plugin.graphRag.query(query);
      if (typeof result === 'string') {
          // Fallback if service wasn't updated yet or returns string
          answer = result;
      } else {
          answer = result.answer;
          communities = result.communities;
      }
    } catch (e) {
      new Notice('GraphRAG query failed. Check logs.');
      plugin.logger.error('GraphRAG query failed', e);
    } finally {
      loading = false;
    }
  }
</script>

<div class="healer-graphrag-container" style="padding: 1em; display: flex; flex-direction: column; gap: 1em;">
  <div class="healer-search-bar" style="display: flex; gap: 8px;">
    <input
      type="text"
      bind:value={query}
      placeholder="Ask a global question about your vault..."
      aria-label="Search query"
      disabled={loading}
      style="flex-grow: 1;"
      onkeydown={(e) => e.key === 'Enter' && handleSearch()}
    />
    <button
      class="mod-cta"
      disabled={loading}
      aria-busy={loading}
      onclick={handleSearch}
    >
      {loading ? 'Searching...' : 'Search'}
    </button>
  </div>

  {#if !loading && !answer && communities.length === 0}
    <div class="healer-empty-state" style="border: 1px dashed var(--background-modifier-border); padding: 2em; text-align: center; border-radius: 8px; color: var(--text-muted); margin-top: 1em;">
      <span aria-hidden="true" style="font-size: 2em; display: block; margin-bottom: 0.5em;">✨</span>
      <p style="margin: 0;">Enter a query to explore your knowledge graph.</p>
    </div>
  {/if}

  {#if loading}
    <div style="text-align: center; padding: 2em;">
      <div class="healer-spinner"></div>
      <p style="color: var(--text-muted); margin-top: 1em;">Synthesizing answer from knowledge graph clusters...</p>
    </div>
  {/if}

  {#if answer}
    <div class="healer-card healer-rag-result" style="padding: 1.5em; background: var(--background-secondary); border-radius: 8px; border: 1px solid var(--background-modifier-border);">
      <h3 style="margin-top: 0;">Answer</h3>
      <div class="healer-rag-answer" style="line-height: 1.6; white-space: pre-wrap;">
        {answer}
      </div>
    </div>
  {/if}

  {#if communities.length > 0}
    <div class="healer-rag-context" style="margin-top: 1em;">
      <h4 style="color: var(--text-muted); font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.05em;">Community Context</h4>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
        {#each communities as comm}
          <div class="healer-comm-pill" style="padding: 8px 12px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 6px; font-size: 0.9em;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="color: var(--text-accent);">Cluster {comm.communityId}</strong>
              <span style="font-size: 0.8em; color: var(--text-muted);">Similarity: {(comm.score * 100).toFixed(1)}%</span>
            </div>
            <div style="margin-top: 4px; color: var(--text-normal);">{comm.summary}</div>
            <div style="margin-top: 4px; font-size: 0.8em; color: var(--text-muted);">
              {comm.notes.length} notes: {comm.notes.slice(0, 3).join(', ')}{comm.notes.length > 3 ? '...' : ''}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .healer-spinner {
    width: 30px;
    height: 30px;
    border: 3px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: healer-spin 1s linear infinite;
    display: inline-block;
  }

  @keyframes healer-spin {
    to { transform: rotate(360deg); }
  }
</style>
