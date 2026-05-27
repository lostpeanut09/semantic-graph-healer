<script lang="ts">
  import type { Suggestion } from '../../../types';

  let { 
    suggestion, 
    isFixed = false, 
    onExecute, 
    onIgnore, 
    onReasoning, 
    onVerifyAI,
    onShowReasoning,
    onResolveChoice
  } = $props<{
    suggestion: Suggestion;
    isFixed?: boolean;
    onExecute: (s: Suggestion) => void;
    onIgnore: (s: Suggestion) => void;
    onReasoning: (s: Suggestion) => void;
    onVerifyAI?: (s: Suggestion) => void;
    onShowReasoning?: (s: Suggestion) => void;
    onResolveChoice?: (s: Suggestion, winner: string, losers: string[]) => void;
  }>();

  let category = $derived(suggestion.category || 'suggestion');
  let confidence = $derived(suggestion.meta?.confidence);
</script>

<div class="healer-suggestion-card healer-{category}-card" style="background-color: var(--background-secondary); border: 1px solid var(--background-modifier-border); padding: 1em; margin-bottom: 0.5em; border-radius: 4px; {isFixed ? 'opacity: 0.6;' : ''}">
  <h4 class="healer-card-title" style="margin-top: 0; color: var(--text-normal);">
    {suggestion.link}
    {#if isFixed}
      <span style="color: var(--text-success); font-size: 0.8em; margin-left: 8px;">✓ Fixed</span>
    {/if}
  </h4>
  <p class="healer-card-p" style="color: var(--text-muted); font-size: 0.9em;">{suggestion.source}</p>

  {#if confidence != null}
    <div class="healer-confidence-text" style="font-size: 0.85em; color: var(--text-accent);">
      <span class="healer-font-bold" style="font-weight: bold;">Confidence: {confidence}%</span>
    </div>
  {/if}

  {#if suggestion.reasoning}
    <div class="healer-reasoning-summary" style="margin-top: 8px; padding: 8px; background: var(--background-primary); border-radius: 4px; font-size: 0.85em; border-left: 3px solid var(--interactive-accent);">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span><strong>AI Verdict:</strong> {suggestion.reasoning.verdict || (suggestion.reasoning.winner ? 'STABLE' : 'UNCERTAIN')}</span>
        {#if onShowReasoning}
          <button class="healer-btn-link" aria-label="View log for {suggestion.link}" style="background: none; border: none; color: var(--text-accent); cursor: pointer; padding: 0; font-size: 0.9em; text-decoration: underline;" onclick={() => onShowReasoning(suggestion)}>View Log</button>
        {/if}
      </div>
      {#if suggestion.reasoning.winner}
        <div style="margin-top: 4px; color: var(--text-muted); font-style: italic; display: flex; justify-content: space-between; align-items: center;">
          <span>Recommended: {suggestion.reasoning.winner}</span>
          {#if onResolveChoice && suggestion.meta?.competingValues}
            <button 
              class="healer-btn-apply" 
              aria-label="Apply recommended fix for {suggestion.link}"
              style="padding: 2px 8px; font-size: 0.85em; cursor: pointer; background-color: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px;"
              onclick={() => onResolveChoice!(
                suggestion, 
                suggestion.reasoning!.winner!, 
                suggestion.meta!.competingValues!.filter((v: string) => v !== suggestion.reasoning!.winner)
              )}
            >
              Apply
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if suggestion.verificationResult}
    <div class="healer-verification-badge" style="margin-top: 8px; font-weight: bold; color: {suggestion.verificationResult === 'Valid' ? 'var(--text-success)' : suggestion.verificationResult === 'Contradiction' ? 'var(--text-error)' : 'var(--text-warning)'};">
      Verification: {suggestion.verificationResult}
    </div>
  {/if}

  <div class="healer-btn-container" style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
    <button class="healer-btn-execute" aria-label="Execute fix for {suggestion.link}" disabled={isFixed} onclick={() => onExecute(suggestion)}>Execute</button>
    <button class="healer-btn-reason" aria-label="{suggestion.reasoning ? 'Re-reason' : 'Reasoning'} for {suggestion.link}" disabled={isFixed || suggestion.isVerifying} onclick={() => onReasoning(suggestion)}>
      {suggestion.reasoning ? 'Re-reason' : 'Reasoning'}
    </button>
    {#if onVerifyAI && (suggestion.type === 'ai' || suggestion.id.startsWith('branch_') || suggestion.id.startsWith('tag_'))}
      <button class="healer-btn-verify" aria-label="{suggestion.isVerifying ? 'Verifying...' : 'AI Verify'} fix for {suggestion.link}" disabled={isFixed || suggestion.isVerifying} onclick={() => onVerifyAI(suggestion)}>
        {suggestion.isVerifying ? 'Verifying...' : 'AI Verify'}
      </button>
    {/if}
    <button class="healer-btn-ignore" aria-label="Ignore suggestion for {suggestion.link}" disabled={isFixed} onclick={() => onIgnore(suggestion)}>Ignore</button>
  </div>
</div>

