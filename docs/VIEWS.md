# Views

The plugin provides several UI views for monitoring graph health and applying suggestions.

## Dashboard

- Built with Svelte.
- Entry point: `views/dashboard/components/Dashboard.svelte`.
- Manages global state via `DashboardStore.svelte.ts`.
- Displays `SuggestionCard` components for user-reviewable graph healing.

## Visualizer

- Entry point: `views/GraphVisualizerView.ts`.
- Provides an interactive view of the graph structural anomalies.

## Settings

- Managed by `views/SettingsTab.ts`.
- Defines all configuration categories, utilizing modules in `views/sections/`.
