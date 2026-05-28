<!-- generated-by: gsd-doc-writer -->

## Overview

Semantic Graph Healer is built with a **Local-First, Privacy-Focused** philosophy. The core topological analysis engine runs entirely within your Obsidian environment using high-performance Web Workers. For features requiring semantic intelligence, the plugin implements rigorous security layers to protect your data, credentials, and privacy.

## Data Privacy & LLM Integration

The plugin integrates with external Large Language Models (LLMs) for advanced semantic validation and suggestion generation. We prioritize data minimization and user control:

- **Local-First Processing**: Topological reasoning and graph processing are executed 100% locally.
- **Data Minimization**: Only the minimum necessary context (note titles, tags, and small content snippets) is sent to LLM providers.
- **Local AI Support**: For 100% data privacy, the plugin supports local LLM providers such as **Ollama** and **LM Studio**. When using these, no data leaves your machine.
- **AI Tribunal (Consensus)**: Our `LlmService` implements a dual-LLM consensus mechanism. Suggestions are cross-verified between a Primary and Secondary model to detect hallucinations and ensure stability.
- **Semantic Pre-filtering**: To reduce data exposure, the system uses cosine similarity thresholds. If a relationship's semantic similarity is below a specific threshold (e.g., `0.4`), the prompt is rejected locally before reaching any external API.

## Credential Management (`KeychainService`)

Credentials and API keys are managed by the `KeychainService`, which implements a multi-layer security model designed for 2026 standards:

- **Obsidian SecretStorage**: Utilizes Obsidian's native `SecretStorage` API (v1.11.4+) for OS-level secure credential management.
- **Double-Layer Protection ("Double-Locking")**: To mitigate potential host-level plaintext vulnerabilities, keys stored in SecretStorage are encrypted using **AES-256-GCM** with a vault-specific salt before being passed to the OS storage.
- **Sync-Resilient Encryption**: For users syncing their vault, keys are stored encrypted in `data.json` using AES-256-GCM. This ensures keys remain protected during transport and on other devices.
- **Cryptographic Implementation (`CryptoUtils.ts`)**:
    - Uses the **Web Crypto API** for SOTA security.
    - Keys are derived using **PBKDF2** with **600,000 iterations** and **SHA-256**.
    - Uses a stable unique salt derived from the `appId` or a generated `cryptoSalt`.
    - Implements chunked Base64 encoding to prevent memory overflows when handling encrypted buffers.

## Hardened Logging (`HealerLogger`)

The `HealerLogger` is designed to prevent accidental leaks of Personally Identifiable Information (PII) or secrets:

- **Secret Redaction**: A blacklist of sensitive keys (including `apikey`, `token`, `bearer`, `password`, `secret`, `private_key`) is automatically redacted (`***`) from all logged objects.
- **Pattern Masking**: High-fidelity regex detects and masks Bearer tokens and JWT structures in raw strings.
- **Log Injection Prevention**: All log entries are sanitized to neutralize control characters (ASCII 0x00-0x1F + 0x7F), preventing terminal manipulation or log injection attacks.
- **Resource Protection**: File logging includes size-based rotation (capped at 2MB) and uses optimized I/O operations (`Vault.append`) to prevent disk exhaustion.

## Automated Code Audits (Google Jules)

To ensure the long-term integrity of the codebase, the project utilizes **Google Jules** for automated Pull Request reviews:

- **Security & Performance Gating**: Every PR is audited against project-specific rules (`.jules/rules.md`) to catch security vulnerabilities (e.g., insecure randomness) and performance regressions.
- **Secure Secret Management**: The `JULES_API_KEY` required for these audits is stored exclusively as an **encrypted GitHub Actions secret**. It is never committed to the repository or logged in CI/CD outputs.
- **Aggressive Filtering**: Jules utilizes advanced false-positive filtering to maintain high-signal security feedback.

## Threat Model

### 1. Local Access & Malicious Plugins

- **Threat**: A user or malicious plugin with local access to the vault attempts to steal API keys.
- **Mitigation**: Keys are stored in OS-level `SecretStorage` and are "double-locked" with AES-256-GCM. Even if `SecretStorage` is compromised, the keys remain encrypted with a vault-specific salt.

### 2. Network Interception (MITM)

- **Threat**: Data sent to LLM providers is intercepted during transit.
- **Mitigation**: All external communication is performed over HTTPS. Data sent is minimized to snippets rather than full notes.

### 3. LLM Provider Trust

- **Threat**: A compromised or malicious LLM provider returns harmful or misleading graph suggestions.
- **Mitigation**: The **AI Tribunal** uses consensus between two different models/providers to validate suggestions. Users can switch to local providers (Ollama/LM Studio) to eliminate third-party risk.

### 4. Log Exposure

- **Threat**: Sensitive data is exposed through the Obsidian console or shared log files.
- **Mitigation**: Automatic redaction of secrets, pattern masking for tokens, and control character sanitization.

## Security Best Practices for Users

1.  **Use Local LLMs for Sensitive Vaults**: If your vault contains highly confidential data, use **Ollama** or **LM Studio**.
2.  **API Key Scoping**: Create provider-specific API keys with restricted usage limits and permissions.
3.  **Rotate Keys Regularly**: Periodically regenerate your API keys in your provider's dashboard and update them in the plugin settings.
4.  **Verify Log Files**: Before sharing log files for troubleshooting, verify that they do not contain unintended sensitive information (though the logger redacts known secrets).

## Vulnerability Reporting

We take security seriously. If you discover a vulnerability, please follow these steps:

1. **Do not** disclose the issue in public issues or comments.
2. Send a detailed report to the maintainer via GitHub Private Security Advisories or contact **@lostpeanut09** directly. <!-- VERIFY: Preferred security contact method -->
3. Include a description of the vulnerability, a proof-of-concept (if possible), and the impact.

We aim to acknowledge all reports within 48 hours and provide a resolution timeline.
