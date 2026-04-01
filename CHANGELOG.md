# Changelog

All notable changes to the Semantic Graph Healer plugin will be documented in this file.

## [2.0.0] - "AI Ready" Update - 2026-03-31

### 🚀 Major Features (Phase 3)

- **AI Council Verification (On-Demand)**: Added full semantic branching and tag propagation validation using local LLMs (Ollama, LM Studio) or Cloud endpoints (OpenAI, Anthropic).
- **Binary Prompting Architecture**: Standardized zero-shot prompt structures (YES/NO, VALID/CONTRADICTION) specifically tuned for 7B-8B local inference models.
- **Context Injection**: Graph reasoning now pulls exact content snippets (`MAX 5000 chars`) directly from the `.md` files to supply LLMs with true semantic context, avoiding "blind" hallucinations.
- **Settings Profiles**: Instantly switch configurations via Native UI Modals:
    - ⚖️ _Balanced_ (General usage)
    - 🔒 _Privacy-First_ (Local endpoints only)
    - 🤖 _AI-Maximal_ (Deep analysis & Tribunal enabled)
    - ⚡ _Performance_ (Stripped limits for 10,000+ node vaults)

### 🛡️ Security & Performance

- **SecretStorage API Integration**: Full compliance with Obsidian v1.11.4+. All API keys are now securely encrypted at the OS level, breaking away from plain-text `data.json`.
- **LLM Caching**: Built a `verificationCache` `Map` using a 5-minute TTL. Dramatically reduces token burns by preventing overlapping LLM queries on identical graph nodes.
- **UI Freeze Protections**: Wrapped disk IO context fetchers in a bounding `Promise.race()` (10 seconds) to prevent the Obsidian window from locking on heavy vaults.
- **Mobile Guardrails**: Safely disables `Web Worker` Graphology instantiation on iOS/Android environments to prevent `import.meta.url` Capacitor crashes, degrading gracefully.

### 🔧 Maintenance & Quality of Life

- **Enterprise Settings Backup**: Added `Export Settings` (JSON without API Keys) and `Import Settings` (with strict Zod type validation) natively into the settings tab.
- **Factory Reset**: A modal-guarded panic button to reset all schema properties back to default without destroying your keychain credentials.
- **UI Decoupling**: Separated and annotated automated features (like the AI Tribunal) from manual Phase 3 tools directly inside the Settings tab.

### 🐛 Bug Fixes

- Addressed memory bloat issues by completely isolating Deep Graph analytics to dedicated web workers.

---

_Semantic Graph Healer - Repairing your second brain, one edge at a time._
