# AI Specification: Semantic Graph Healing Logic

> Phase 4: AI Integration · April 2026

## AI Objectives

Trasformare i risultati dell'analisi topologica (orphan nodes, broken links, clusters) in azioni correttive semantiche (nuovi link, tag suggeriti, refactoring di cartelle).

## Model Strategy

| Layer               | Model                 | Provider   | Priority | Reason                                                             |
| ------------------- | --------------------- | ---------- | -------- | ------------------------------------------------------------------ |
| **Local (Privacy)** | Llama 3.3 (8B/70B)    | Ollama     | 1        | Analisi di note sensibili, suggerimenti inline.                    |
| **Cloud (Scale)**   | Gemini 2.5 Flash-Lite | Google API | 2        | Indexing semantico iniziale del vault, analisi di cluster massivi. |

## AI Contract: "The Healer"

### Input Interface

- **Context**: Grafo locale (JSON), note correlate, metadati (YAML).
- **Task**: "Identifica la relazione mancante tra Note A e Note B basandoti sul contenuto semantico."

### System Prompt (Sample)

```text
Sei un Graph Architect esperto in Obsidian. Il tuo compito è analizzare incongruenze topologiche.
- Se un nodo è isolato ma contiene tag simili al Cluster X, suggerisci un link.
- Se due note hanno un co-citation score alto (>0.8) ma non sono linkate, crea una proposta di connessione.
- Non inventare mai note che non esistono nell'indice fornito.
```

## Evaluation Strategy (Evals)

Per ogni intervento dell'AI, il sistema misurerà:

1. **Topological Gain**: Di quanto è aumentata la coesione del grafo?
2. **Hallucination Rate**: Numero di link proposti verso note inesistenti.
3. **User Acceptance**: Protocollo di approvazione manuale prima di ogni scrittura su file.

## Integration Hook

- `LlmService.ts` interfaccerà i worker core con i provider selezionati tramite il Model Context Protocol (MCP).
