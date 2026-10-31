# Semantic Graph Healer

An Obsidian plugin that diagnoses and repairs structural problems in large knowledge graphs (orphans, semantic conflicts, asymmetric links, missing chain links, hierarchy cycles, sink notes) and suggests — and applies — fixes. Desktop-first; open source over GPL-3.0; published on GitHub and the Obsidian community directory.

## Requirements

- **Obsidian 1.14.5** or later (desktop)
- `minAppVersion`: **1.13.0**

## Development

All development and testing happens in the dedicated `test-vault/` directory. This is a **local-only, no-network** development model: the plugin runs entirely offline within Obsidian and does not make any external API calls unless you explicitly configure a local-only AI provider (Ollama on `localhost`). The author's personal vault (`E:\Scuola 2`) is never a dev/test target.

```bash
npm ci        # install dependencies
npm run build # bundle with esbuild
npm run dev   # build in watch mode
npm run lint  # eslint
npm run test  # vitest with coverage
```

## License

This project is licensed under the **GPL-3.0-or-later** license. See [LICENSE](LICENSE) for details.
