# Phase 19: Quality Update & Technical Debt Reduction - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 19-Quality Update & Technical Debt Reduction
**Areas discussed:** Migration Strategy, Storage & Fallback, Key Recovery & Loss, Key Format & Export

---

## Migration Strategy

| Option              | Description                                        | Selected |
| ------------------- | -------------------------------------------------- | -------- |
| Silent Background   | Perform migration without notifying the user.      |          |
| Notice Notification | Show an Obsidian Notice upon successful migration. | ✓        |

**User's choice:** Notice Notification
**Notes:** User agreed with showing a one-time notice to confirm the security upgrade.

---

## Storage & Fallback

| Option                     | Description                                   | Selected |
| -------------------------- | --------------------------------------------- | -------- |
| Dynamic data.json Fallback | Save a random key in data.json as a fallback. | ✓        |
| Require SecretStorage      | Disable keychain encryption on old versions.  |          |

**User's choice:** Dynamic data.json Fallback (Researched Best Action)
**Notes:** The agent proposed using a random key in `data.json` as a strictly better alternative to the hardcoded key when `SecretStorage` is missing. The user accepted this "best action".

---

## Key Recovery & Loss

| Option                | Description                                       | Selected |
| --------------------- | ------------------------------------------------- | -------- |
| Modal Reset Prompt    | Ask the user to Reset Keychain (delete all keys). | ✓        |
| Settings Warning Only | Just show a warning in the settings tab.          |          |

**User's choice:** Modal Reset Prompt (Researched Best Action)
**Notes:** The agent proposed a proactive modal to handle lost master keys. The user accepted this "best action".

---

## Key Format & Export

| Option         | Description                      | Selected |
| -------------- | -------------------------------- | -------- |
| JWK (Proposed) | Standard JSON Web Key format.    | ✓        |
| Base64 Raw     | Simple base64-encoded raw bytes. |          |

**User's choice:** JWK (Proposed)
**Notes:** User accepted the JWK format as the robust standard for Web Crypto storage.

---

## the agent's Discretion

- The builder is free to choose the internal flag name for migration tracking.
- The specific implementation of the JWK stringification and parsing is left to the builder.

## Deferred Ideas

- **Key Rotation:** Periodic rotation of the master key.
- **Master Key Backup:** User-facing export/import of the master key.
