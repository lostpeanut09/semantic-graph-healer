<script lang="ts">
  import type { Suggestion } from '../../../types';

  let { suggestion, onExecute, onIgnore, onReasoning } = $props<{
    suggestion: Suggestion;
    onExecute: (s: Suggestion) => void;
    onIgnore: (s: Suggestion) => void;
    onReasoning: (s: Suggestion) => void;
  }>();

  let category = $derived(suggestion.category || 'suggestion');
  let confidence = $derived(suggestion.meta?.confidence);
</script>

<div class="healer-suggestion-card healer-{category}-card" style="background-color: var(--background-secondary); border: 1px solid var(--background-modifier-border); padding: 1em; margin-bottom: 0.5em; border-radius: 4px;">
  <h4 class="healer-card-title" style="margin-top: 0; color: var(--text-normal);">{suggestion.link}</h4>
  <p class="healer-card-p" style="color: var(--text-muted); font-size: 0.9em;">{suggestion.source}</p>

  {#if confidence != null}
    <div class="healer-confidence-text" style="font-size: 0.85em; color: var(--text-accent);">
      <span class="healer-font-bold" style="font-weight: bold;">Confidence: {confidence}%</span>
    </div>
  {/if}

  <div class="healer-btn-container" style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
    <button class="healer-btn-execute" onclick={() => onExecute(suggestion)}>Execute</button>
    <button class="healer-btn-reason" onclick={() => onReasoning(suggestion)}>Re-reason / Verify</button>
    <button class="healer-btn-ignore" onclick={() => onIgnore(suggestion)}>Ignore</button>
  </div>
</div>
