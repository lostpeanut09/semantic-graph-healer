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

## First Run

To start the plugin in development mode and observe the live changes in your Obsidian vault:

1. In your terminal, within the plugin directory, start the esbuild compiler:
   ```bash
   npm run dev
   ```
2. Open Obsidian and create or open a development vault.
3. Open Obsidian settings, go to **Community plugins**, and ensure that **Semantic Graph Healer** is toggled on.
4. If you make code modifications, the plugin will automatically rebuild, and you can reload the plugin inside Obsidian using the `Reload` command in the Obsidian Command Palette.

## Common Setup Issues

- **Node.js and npm Versions:** Ensure you are using Node.js version 24.0.0 or higher, and npm version 11.0.0 or higher. Running older versions can lead to compilation errors with esbuild or dependency resolution issues.
- **Datacore Dependency:** The plugin's primary query engine strictly requires the [Datacore](https://github.com/blacksmithgu/datacore) plugin. If Datacore is missing, disabled, or not configured properly, the Semantic Graph Healer dashboard will display a warning and fall back to native MetadataCache queries, which are significantly slower.
- **API Key Configuration:** For features utilizing the **AI Tribunal** or **Smart Connections** embeddings, make sure to enter valid API keys in the Settings panel. If keys are missing, these features will be disabled.

## Next Steps

Now that you have the plugin installed and configured, you can learn more by checking these documents:
- [DEVELOPMENT.md](DEVELOPMENT.md) — Learn about building, linting, formatting, and branch conventions.
- [TESTING.md](TESTING.md) — Information on how to run our unit tests, integration tests, and benchmarks.
- [CONFIGURATION.md](CONFIGURATION.md) — Detailed guide on all options available in Obsidian settings.
