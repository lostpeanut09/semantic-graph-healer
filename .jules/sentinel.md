## 2026-05-25 - Replace Math.random with Crypto API

**Vulnerability:** Weak random number generation for security purposes (IDs/Batch IDs). `Math.random()` was being used in `src/core/services/AutomationApi.ts` to generate batch IDs, which is not cryptographically secure and can lead to predictability in batch operations.
**Learning:** Even though IDs might seem benign, non-cryptographic randomness in a security context (like tagging batches for undo/redo) can be exploited if the system relies on unguessability. The codebase already has a secure `generateId` function in `HealerUtils.ts` that should be used consistently.
**Prevention:** Always use `crypto.getRandomValues` or `crypto.randomUUID` (or the provided `generateId` utility) for generating IDs, tokens, or any form of randomness instead of `Math.random()`. Consistently enforce the use of secure random number generation across the codebase.
