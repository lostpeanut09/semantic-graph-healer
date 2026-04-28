/**
 * SemanticLinkEdge: Normalized representation of a directed link in the graph.
 * SOTA 2026 Strategy: Precision-first metadata for the Healer engine.
 */
export interface SemanticLinkEdge {
  /**
   * Canonical path of the source note.
   */
  sourcePath: string;

  /**
   * Canonical path of the target note.
   */
  targetPath: string;

  /**
   * The structural nature of the link.
   */
  type: "wikilink" | "property" | "tag" | "folder" | "implicit";

  /**
   * Optional: The line of text containing the link (for LLM context).
   */
  context?: string;

  /**
   * Optional: Character offsets in the source file.
   */
  position?: {
    start: number;
    end: number;
  };

  /**
   * Optional: Confidence score (0.0 to 1.0) for heuristic-based links.
   */
  confidence?: number;
}
