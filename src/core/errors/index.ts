/**
 * Barrel for the typed error infrastructure.
 *
 * Re-exports the HealerError base class, all 6 domain subclasses, the
 * options/severity types, and the class-based Result type. Consumers
 * can import from a single path:
 *
 *     import { AdapterError, LlmError, Result } from '../core/errors';
 *
 * For files that only need a single symbol (e.g. LlmService.ts),
 * prefer the direct import from `./errors/HealerError` to keep the
 * dependency surface explicit and to match the HealerLogger import
 * style already established in the codebase.
 */
export * from './HealerError';
export * from './Result';
