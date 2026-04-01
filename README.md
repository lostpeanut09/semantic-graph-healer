# Semantic Graph Healer 🩺✨

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blue.svg)](https://obsidian.md)
[![Version](https://img.shields.io/badge/version-2.0.0-success.svg)](#)
[![AI Engine](https://img.shields.io/badge/AI-Ollama%20%7C%20OpenAI-purple.svg)](#)

A topological restoration engine that utilizes AI inference and structural graph algorithms to identify, diagnose, and resolve deep inconsistencies inside your Obsidian knowledge base.

_Repair your second brain. One edge at a time._

## 🧠 What is it?

As a vault grows beyond 5,000+ nodes, maintaining a pristine network of links, tags, and hierarchies becomes impossible. MOCs detach, flows stagnate, and conceptual boundaries blur.

Semantic Graph Healer operates on the concept of **Topological Resilience**:

1. **Scans** your vault asynchronously on a dedicated Web Worker using algorithms like _PageRank_ and _Louvain Community Detection_.
2. **Identifies** anomalies (e.g. broken chains, missing backlinks, conceptual stagnation).
3. **Resolves** conflicts using a **Local LLM Engine** (Ollama/LM Studio) or a Cloud Provider (OpenAI/Anthropic) to validate if a structural change makes _semantic sense_ based on the text inside your notes.

---

## 🚀 Features (v2.0.0)

### 🤖 AI Inference & Validation

- **Smart Connections**: Recommends conceptual links between dynamically discovered hubs.
- **The Tribunal Engine**: A secondary consensus model to double-check automated reasoning before pushing it to your dashboard.
- **Semantic Tag Propagation**: Evaluates if a child concept should inherit its parent's taxonomical tags by reading up to 5,000 characters of both notes and asking an AI (using a zero-shot Binary Prompt).
- **Branch Validation**: Assesses if parallel topics break narrative/chronological flow or if they represent a valid "choice map".

### 🛡️ Guardrails & Performance

- **Asynchronous Web Workers**: Intense graph math happens out-of-bounds. Rest assured your Obsidian UI won't freeze.
- **In-Memory Query Caches**: 5-minute TTL constraints on identical LLM requests to defend your token expenditures against aggressive re-rendering.
- **Timeout Protection**: Intelligent `Promise.race` handlers instantly detach from locked OS files after 10 seconds of context-gathering.

### ⚙️ Enterprise Settings Administration

- **Keychain Security**: Full integration with Obsidian v1.11.4+ `SecretStorage` to natively encrypt API Keys at the OS level.
- **Visual Presets**: One-click deployments (⚖️ _Balanced_, 🔒 _Privacy-First_, 🤖 _AI-Maximal_, ⚡ _Performance_) directly from the settings tab.
- **JSON Configuration Sync**: Clean Zod-validated Imports and Exports (API keys stripped) for safely maintaining backups across vaults.

---

## 📋 Installation

_(Until published on the Official Community Plugins directory)_

1. Navigate to your vault's plugin directory: `<vault>/.obsidian/plugins/`
2. Create `semantic-graph-healer`
3. Drop in the latest `main.js`, `manifest.json`, and `styles.css`.
4. Refresh the community plugins list inside Obsidian and toggle it ON.

---

## ⚙️ Providers & Models

Semantic Healer connects natively to OpenAI-compliant endpoints.

### **Local & Private (Recommended)**

1. Download [Ollama](https://ollama.com/) or [LM Studio](https://lmstudio.ai/).
2. Run a 7B-8B local model (e.g., `llama3.1:8b`).
3. Set your endpoint in the plugin to `http://localhost:11434/v1` and leave the API key blank.

### **Cloud (For Massive Vaults)**

To achieve the absolute highest context accuracy, input your keys for cloud endpoints:

- OpenAI: `https://api.openai.com/v1`
- Anthropic: `https://api.anthropic.com/v1`
- DeepSeek: `https://api.deepseek.com/v1`

---

## 🔒 Security Notice

**Always run on Obsidian v1.11.4 or higher.** If the version detects a legacy environment, API keys will fall back to being stored in plaintext in the plugin `data.json`. The engine will explicitly warn you inside the settings tab if this behavior activates.

---

## 🤝 Contributing

Contributions are highly welcomed. Graph algorithms rely on `graphology` and AI inference uses zero-shot structured prompts tailored for high-speed deterministic outputs.

_Developed for the Vaults of 2026. Made with ❤️._
