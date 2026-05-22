# Semantic Graph Healer Wiki

Welcome to the official guide for **Semantic Graph Healer**.

## 📊 Healing Dashboard

The Dashboard is your command center for topological curation. It displays a prioritized list of "Graph Issues" detected by the engine.

### Issue Types

- **Orphan Notes:** Notes with no hierarchical links (no up/down/next/prev).
- **Structural Gaps:** Breaks in a sequential chain where a logical "middle" note exists but is bypassed.
- **Missing Reciprocals:** One-way links that should likely be bidirectional.
- **Logic Loops (Ouroboros):** Infinite hierarchical cycles (e.g., A -> B -> A).
- **Information Sinks (Black Holes):** Notes that receive many links but have zero outgoing links.
- **AI Suggestions:** Semantically similar notes identified by LLM analysis or vector embeddings.

### Actions

- **Execute:** Applies the recommended fix automatically.
- **Re-reason:** Invokes the AI Tribunal for a deeper analysis of the conflict.
- **Ignore:** Blacklists the suggestion permanently for that note pair.

## 🕸️ High-Fidelity Graph

A 3D visualization of your knowledge network.

- **LOD (Level of Detail):** Automatically degrades rendering quality in large vaults to maintain performance.
- **Community Coloring:** Uses the Louvain algorithm to color nodes based on semantic clusters.

## ⚙️ Settings

- **Safety Mode:** Adjust the node thresholds for automatic performance scaling.
- **AI Tribunal:** Configure your primary and secondary LLM providers.
- **Rules:** Enable or disable specific topological diagnostic rules.

## 🛡️ Security

- All API keys are stored in your system's secure keychain or encrypted at rest using AES-256-GCM.
- Local model support (Ollama/LM Studio) ensures your data never leaves your machine.
