<!-- generated-by: gsd-doc-writer -->

# SECURITY.md

## Overview

Semantic Graph Healer is built with a **Local-First, Privacy-Focused** philosophy. The core topological analysis engine runs entirely within your Obsidian environment using high-performance Web Workers. For features requiring semantic intelligence, the plugin implements rigorous security layers to protect your data, credentials, and privacy.

## Data Privacy (LLM)

The plugin integrates with external Large Language Models (LLMs) for advanced semantic validation and suggestion generation. We prioritize data minimization and user control:

- **Local-First Processing**: The topological reasoning and graph processing are executed 100% locally.
- **Data Minimization**: Only the minimum necessary context (note titles, tags, and small content snippets/previews) is sent to LLM providers. Full note content is never uploaded unless explicitly batched for specific "Deep Analysis" tasks.
- **Local AI Support**: For 100% data privacy, the plugin supports local LLM providers such as **Ollama** and **LM Studio**. When using these, no data leaves your machine.
- **AI Tribunal (Consensus)**: Our `LlmService` implements a dual-LLM consensus mechanism. Suggestions are cross-verified between a Primary and Secondary model to ensure "Epistemic Stability" and prevent hallucinations.
- **Stage 0 Pre-filtering**: To save costs and reduce data exposure, the system uses semantic similarity thresholds. For example, if cosine similarity is `< 0.4`, the Tribunal is bypassed and the prompt is rejected locally before making external AI calls.
- **Batch Rate Limiting Protection**: Validation of parent-child relationships is executed in surgically chunked groups to prevent rate-limiting and protect against mass data-exposure in a single request.

## Credential Management (`KeychainService`)

Credentials and API keys are managed by the `KeychainService`, which implements a robust multi-layer security model:

- **Obsidian SecretStorage**: Utilizes Obsidian's native `SecretStorage` API (v1.11.4+) for OS-level secure credential management. It degrades gracefully to legacy Keychain APIs for older versions.
- **Double-Layer Protection**: To mitigate potential host-level plaintext vulnerabilities, keys stored in SecretStorage are "double-locked" with an additional internal encryption layer (`enc:` prefix).
- **Sync-Resilient Encryption**: For users syncing their vault, keys can be stored encrypted in `data.json` using **AES-256-GCM**.
- **Cryptographic Standards**: We use the SOTA 2026 Web Crypto API (`CryptoUtils.ts`) for operations. Encryption keys are derived using `PBKDF2` with 600,000 iterations, `SHA-256`, and a stable unique salt (based on your `appId` or a generated `cryptoSalt`).
- **Memory Safety**: `CryptoUtils` utilizes a chunked Base64 encoding method to prevent stack overflows when handling large encrypted buffers.

## PII Protection & Hardened Logging (`HealerLogger`)

Our `HealerLogger` is designed to prevent accidental leaks of Personally Identifiable Information (PII) or secrets into console output or log files:

- **Secret Redaction**: A blacklist of sensitive keys (e.g., `apikey`, `api_key`, `token`, `bearer`, `password`, `secret`, `private_key`) is automatically redacted (`***`) from all logged objects and JSON payloads.
- **Pattern Masking**: The logger uses high-fidelity regex to detect and mask Bearer tokens and JWT structures in raw strings before they reach the logs.
- **Injection Prevention**: All log entries are sanitized to neutralize ALL control characters (ASCII 0x00-0x1F + 0x7F), preventing log injection attacks.
- **Resource Protection**: File logging includes size-based rotation (capped at 2MB) and prioritized optimized I/O operations (`Vault.append`) to prevent disk exhaustion and performance degradation.
- **Sanitized Circular Buffer**: Memory buffers strictly prune oldest logs under memory-safe limits (default 1000 items).

## Vulnerability Reporting

We take security seriously. If you discover a vulnerability, please follow these steps:

1. **Do not** disclose the issue in public issues or comments.
2. Send a detailed report to the maintainer via GitHub Private Security Advisories or contact **@lostpeanut09** directly. <!-- VERIFY: Preferred security contact method -->
3. Include a description of the vulnerability, a proof-of-concept (if possible), and the impact.

We aim to acknowledge all reports within 48 hours and provide a resolution timeline.
