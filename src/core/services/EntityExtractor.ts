import { TFile } from 'obsidian';
import type { SemanticGraphHealerSettings } from '../../types';
import type { LlmService } from '../LlmService';
import type { AjsonStorage } from '../utils/AjsonStorage';
import { HealerLogger } from '../utils/HealerLogger';
import { safeJsonParse } from '../../core/utils/SecurityUtils';

/**
 * Represents a semantic entity extracted from a note.
 */
export interface Entity {
    /** The name of the entity (e.g., 'Albert Einstein'). */
    name: string;
    /** The semantic category of the entity. */
    type: 'Person' | 'Project' | 'Concept' | 'Organization' | 'Technology' | 'Location';
    /** The path to the Obsidian note from which this entity was extracted. */
    notePath: string;
}

/**
 * Represents a semantic relationship between two entities.
 */
interface Relationship {
    /** The name of the source entity. */
    source: string;
    /** The name of the target entity. */
    target: string;
    /** The nature of the relationship (e.g., 'works_on', 'born_in'). */
    type: string;
    /** The path to the Obsidian note from which this relationship was extracted. */
    notePath: string;
}

/**
 * EntityExtractor: Background entity and relationship indexing.
 * Uses LLM to extract structured data from unstructured notes.
 * Persists data to AJSON storage for scalability.
 */
export class EntityExtractor {
    /** Flag indicating whether an indexing operation is currently in progress. */
    private isIndexing = false;

    /**
     * Initializes the EntityExtractor.
     * @param settings - Plugin settings.
     * @param llmService - Service for LLM communication.
     * @param storage - Storage service for persisting entities and relationships.
     */
    constructor(
        private settings: SemanticGraphHealerSettings,
        private llmService: LlmService,
        private storage: AjsonStorage,
    ) {}

    /**
     * Extracts entities and relationships from a single note using an LLM.
     * @param file - The Obsidian file object representing the note.
     * @param content - The raw textual content of the note.
     * @returns A promise that resolves when extraction and storage are complete.
     */
    async extractFromNote(file: TFile, content: string): Promise<void> {
        if (!this.settings.llmEndpoint || !this.settings.llmModelName) return;

        HealerLogger.info(`EntityExtractor: Extracting entities from ${file.path}`);

        const prompt = `
[CONTEXT: Knowledge Graph Entity Extraction]

Extract key entities and their relationships from the following note content.
Focus on: People, Projects, Concepts, Organizations, Technologies, and Locations.

=== NOTE CONTENT ===
Title: ${file.basename}
Path: ${file.path}
Content:
${content.substring(0, 4000)}

=== OUTPUT FORMAT ===
Return a JSON object with two arrays: "entities" and "relationships".
Entity: { "name": string, "type": "Person" | "Project" | "Concept" | "Organization" | "Technology" | "Location" }
Relationship: { "source": string, "target": string, "type": string }

Only return the JSON. No markdown or meta-talk.
`;

        try {
            const response = await this.llmService.callLlm(prompt, false);
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                HealerLogger.warn(`EntityExtractor: No JSON found in response for ${file.path}`);
                return;
            }

            const parsed = safeJsonParse(jsonMatch[0]) as {
                entities: Omit<Entity, 'notePath'>[];
                relationships: Omit<Relationship, 'notePath'>[];
            };

            const entities: Entity[] = (parsed.entities || []).map((e) => ({
                ...e,
                notePath: file.path,
            }));

            const relationships: Relationship[] = (parsed.relationships || []).map((r) => ({
                ...r,
                notePath: file.path,
            }));

            // Persist to AJSON storage
            const entitiesPath = `${this.settings.graphRagIndexDir}/entities.ajson`;
            const relationshipsPath = `${this.settings.graphRagIndexDir}/relationships.ajson`;

            for (const entity of entities) {
                await this.storage.appendLine(entitiesPath, entity);
            }
            for (const rel of relationships) {
                await this.storage.appendLine(relationshipsPath, rel);
            }

            HealerLogger.info(
                `EntityExtractor: Extracted ${entities.length} entities and ${relationships.length} relationships from ${file.path}`,
            );
        } catch (e) {
            HealerLogger.error(`EntityExtractor: Failed to extract from ${file.path}`, e);
        }
    }

    /**
     * Clears the extracted entity and relationship index for a specific note.
     * Currently implemented as a simple append-only store; full re-index would involve rewriting.
     * For now, we use AjsonStorage.upsert if we wanted uniqueness, but append is faster for background tasks.
     * @param notePath - The path of the note to clear from the index.
     * @returns A promise that resolves when the index is cleared.
     */
    async clearNoteIndex(notePath: string): Promise<void> {
        // Implementation for cleanup would go here if we used a more complex storage strategy.
        // For the minimal MVP, we stick to append-only and potentially filter on read.
    }
}
