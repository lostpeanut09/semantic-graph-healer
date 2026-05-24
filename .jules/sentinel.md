## 2024-05-24 - [Secure UUID Generation]
**Vulnerability:** Use of non-cryptographic `Math.random()` for generating UUIDs/Batch IDs
**Learning:** `Math.random()` is predictable and not cryptographically secure, which could lead to ID predictability issues when generating critical identifiers like batch IDs.
**Prevention:** Use `crypto.randomUUID()` via the `generateId` utility in `src/core/HealerUtils.ts` for all ID generation tasks.
