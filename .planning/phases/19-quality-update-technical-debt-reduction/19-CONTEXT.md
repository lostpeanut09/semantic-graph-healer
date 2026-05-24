# Phase 19: Quality Update & Technical Debt Reduction - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the hardcoded AES-256-GCM master key in `KeychainService.ts` and replace it with a dynamically generated, securely stored random key to satisfy automated security reviews and harden API key protection.

</domain>

<decisions>
## Implementation Decisions

### Migration Strategy

- **D-01:** On first boot with the update, the plugin will check for the existence of `sghealer-masterkey` in `SecretStorage`.
- **D-02:** If missing, a new random 256-bit AES-GCM key will be generated and saved.
- **D-03:** All existing encrypted keys (in `data.json` or `SecretStorage` with `enc:` prefix) will be decrypted using the legacy hardcoded key `semantic-healer-sota-2026` and re-encrypted with the new dynamic key.
- **D-04:** A one-time Obsidian Notice will be shown: "Security Update: Keychain migrated to dynamic encryption."

### Storage & Fallback

- **D-05:** The master key is stored in Obsidian's `SecretStorage` under the name `sghealer-masterkey`.
- **D-06:** If `SecretStorage` is unavailable (e.g., on legacy versions of Obsidian pre-v1.11.4), the plugin will generate a random key and save it in `data.json` as a fallback. This ensures per-vault uniqueness even without official keychain support.

### Key Recovery & Loss

- **D-07:** If the master key is lost (cleared local storage) but encrypted strings remain in `data.json`, a Modal Prompt will be triggered: "Keychain Locked: The master key was lost. Please re-enter your API keys to restore functionality."
- **D-08:** The modal will provide a "Reset & Re-enter" action to clear corrupted/unreachable encrypted keys and start fresh.

### Key Format & Export

- **D-09:** The master key will be stored as a JSON-stringified **JWK (JSON Web Key)**. This standard format includes necessary algorithm metadata and is native to the Web Crypto API.

### the agent's Discretion

- The exact implementation details of the Web Crypto migration loop and the specific internal flag to track "migration completed" are left to the builder's discretion.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core Security

- `src/core/services/KeychainService.ts` — Contains the current hardcoded `MASTER_KEY`.
- `src/core/utils/CryptoUtils.ts` — Handles AES-GCM encryption/decryption logic.

### Obsidian API

- [Obsidian Developer Docs: SecretStorage](https://docs.obsidian.md/Plugins/User+interface/Secret+storage) — Official API for secure local storage.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `CryptoUtils.encrypt` / `CryptoUtils.decrypt`: Core primitives for the migration.
- `HealerLogger`: For logging migration success/failure.

### Established Patterns

- **Double-Layer Protection:** The project already uses a pattern of `SecretStorage` + AES encryption to mitigate plaintext leaks in some Obsidian versions.

### Integration Points

- `KeychainService.checkKeychainAvailability()`: The entry point for detecting storage availability and initializing the master key.

</code_context>

<specifics>
## Specific Ideas
- Use `crypto.subtle.generateKey` with `{ name: 'AES-GCM', length: 256 }`.
- Use `crypto.subtle.exportKey('jwk', key)` for persistence.

</specifics>

<deferred>
## Deferred Ideas
- **Key Rotation:** Periodic rotation of the master key is deferred to a future security-focused phase.
- **Master Key Backup:** User-facing export/import of the master key for manual recovery is deferred to v2.0.

</deferred>

---

_Phase: 19-Quality Update & Technical Debt Reduction_
_Context gathered: 2026-05-24_
