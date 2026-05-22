# Getting Started

## Prerequisites

- Obsidian (v1.0+)
- Node.js (v18+)

## Installation

1. Clone this repository into your Obsidian plugins folder.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to compile the TypeScript sources.
4. Enable the plugin in the Obsidian settings under "Community plugins".

## Configuration

Upon first run, the plugin will create a default configuration. Use the Settings Tab to:

- Configure API Keys for LLM services (Keychain).
- Select active Adapters to import data from your favorite plugins.
- Adjust performance throttles in `Performance & Safety Settings`.

## Basic Usage

1. Open the dashboard (the icon in the left ribbon).
2. Click "Run Analysis" to perform an initial structural graph audit.
3. Review "Heal Suggestions" on the dashboard.
4. Accept suggestions to apply structural improvements directly to your notes.
