import { HealerLogger } from './HealerUtils';

/**
 * LinkPredictionEngine: SOTA 2026 Deep Topology Engine.
 *
 * Implements a scientifically-grounded three-way blend of link prediction indices:
 *   1. Jaccard Similarity     — breadth of shared neighborhood [Liben-Nowell & Kleinberg, 2004]
 *   2. Adamic-Adar Index      — depth/quality, logarithmically penalizes large hubs [Adamic & Adar, 2003]
 *   3. Resource Allocation    — hub-aware without log dampening, better for MOC-heavy vaults [Lü & Zhou, 2010]
 *
 * Normalization: AA is max-normalized against the theoretical upper bound
 * (all shared neighbors have degree 2: each contributes 1/log(2) ≈ 1.443).
 * This bounds AA to [0, 1] without arbitrary constants.
 *
 * Reference: Linyuan Lü & Tao Zhou, "Link Prediction in Complex Networks: A Survey"
 *            Physica A: Statistical Mechanics and its Applications, 2011.
 */

interface LinkPredictionWeights {
    jaccard: number;
    adamicAdar: number;
    resourceAllocation: number;
}

export class LinkPredictionEngine {
    private readonly weights: LinkPredictionWeights;

    constructor(
        private relMaps: Record<string, Map<string, Set<string>>>,
        private pages: string[],
        weights?: Partial<LinkPredictionWeights>,
    ) {
        // Merge caller weights with defaults (0.35 / 0.35 / 0.30)
        this.weights = {
            jaccard: weights?.jaccard ?? 0.35,
            adamicAdar: weights?.adamicAdar ?? 0.35,
            resourceAllocation: weights?.resourceAllocation ?? 0.3,
        };

        // Normalize to sum = 1 to be resilient to user misconfiguration
        const total = this.weights.jaccard + this.weights.adamicAdar + this.weights.resourceAllocation;
        if (total > 0 && Math.abs(total - 1) > 0.001) {
            this.weights.jaccard /= total;
            this.weights.adamicAdar /= total;
            this.weights.resourceAllocation /= total;
            HealerLogger.warn(
                `LinkPredictionEngine: weights did not sum to 1 (sum=${total.toFixed(3)}). Normalized automatically.`,
            );
        }
    }

    /**
     * Finds "Missing Rings" — pairs of nodes with high shared-neighbor overlap
     * that are not yet directly connected.
     *
     * SOTA 2026: Now includes Temporal Decay to prioritize notes written/modified
     * around the same time, reflecting human memory and context coherence.
     */
    public findMissingRings(
        sourcePath: string,
        sourceMtime: number,
        fileStats: Map<string, { mtime: number }>,
        limit = 5,
    ): Array<{ path: string; score: number; sharedCount: number }> {
        const sourceNeighbors = this.getAllNeighbors(sourcePath);
        if (sourceNeighbors.size === 0) return [];

        const predictions: Array<{ path: string; score: number; sharedCount: number }> = [];

        for (const targetPath of this.pages) {
            if (targetPath === sourcePath) continue;
            if (this.isAlreadyLinked(sourcePath, targetPath)) continue;

            const targetNeighbors = this.getAllNeighbors(targetPath);
            if (targetNeighbors.size === 0) continue;

            const shared = new Set([...sourceNeighbors].filter((x) => targetNeighbors.has(x)));
            if (shared.size < 2) continue;

            // ── 1. Jaccard Similarity ──────────────────────────────────────────
            const union = new Set([...sourceNeighbors, ...targetNeighbors]);
            const jaccard = shared.size / union.size;

            // ── 2. Adamic-Adar Index ───────────────────────────────────────────
            let adamicAdar = 0;
            shared.forEach((z) => {
                const deg = this.getAllNeighbors(z).size;
                if (deg > 1) adamicAdar += 1 / Math.log(deg);
            });
            const maxPossibleAA = shared.size * (1 / Math.log(2));
            const normalizedAA = maxPossibleAA > 0 ? Math.min(adamicAdar / maxPossibleAA, 1) : 0;

            // ── 3. Resource Allocation Index ───────────────────────────────────
            let resourceAllocation = 0;
            shared.forEach((z) => {
                const deg = this.getAllNeighbors(z).size;
                if (deg > 0) resourceAllocation += 1 / deg;
            });
            const normalizedRA = Math.min(resourceAllocation, 1);

            // ── 4. TEMPORAL DECAY (SOTA 2026) ──────────────────────────────────
            // Reflects the tendency of related notes to be created/updated in batches.
            // λ = 0.005 (half-life of ~139 days).
            const targetMtime = fileStats.get(targetPath)?.mtime ?? Date.now();
            const deltaDays = this.getDaysDifference(sourceMtime, targetMtime);
            const temporalMultiplier = Math.exp(-0.005 * deltaDays);

            // ── Combined Score ─────────────────────────────────────────────────
            const baseScore =
                jaccard * this.weights.jaccard +
                normalizedAA * this.weights.adamicAdar +
                normalizedRA * this.weights.resourceAllocation;

            const finalScore = baseScore * temporalMultiplier;

            predictions.push({ path: targetPath, score: finalScore, sharedCount: shared.size });
        }

        return predictions.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    /**
     * Finds Co-cited pairs — notes that are frequently cited together in the same source,
     * weighted by proximity (same paragraph = stronger signal).
     *
     * This is a "2nd-order backlinks" analysis [SkepticMystic graph-analysis, 2022].
     * Returns a map of { pathA → [{ pathB, score, contexts }] } for the given target.
     *
     * Implemented here as a utility; the graph-level runner is in GraphEngine.runCoCitationAnalysis().
     */
    public static computeCoCitationScore(backlinkersA: Set<string>, backlinkersB: Set<string>): number {
        // Simple co-citation count: |backlinkers(A) ∩ backlinkers(B)|
        // This is the foundation; proximity weighting is done at the GraphEngine level.
        let count = 0;
        backlinkersA.forEach((b) => {
            if (backlinkersB.has(b)) count++;
        });
        return count;
    }

    // ─── Private Helpers ────────────────────────────────────────────────────────

    private getDaysDifference(mtimeA: number, mtimeB: number): number {
        const diffMs = Math.abs(mtimeA - mtimeB);
        return diffMs / (1000 * 60 * 60 * 24);
    }

    private getAllNeighbors(path: string): Set<string> {
        const all = new Set<string>();
        Object.values(this.relMaps).forEach((map) => {
            const neighbors = map.get(path);
            if (neighbors) neighbors.forEach((n) => all.add(n));
        });
        return all;
    }

    private isAlreadyLinked(pathA: string, pathB: string): boolean {
        return Object.values(this.relMaps).some((map) => {
            const neighbors = map.get(pathA);
            return neighbors?.has(pathB) ?? false;
        });
    }

    // ─── Static Utilities (for external use / unit testing) ─────────────────────

    /** Jaccard Similarity — |A∩B| / |A∪B| */
    public static jaccardSimilarity(neighborsA: Set<string>, neighborsB: Set<string>): number {
        if (neighborsA.size === 0 || neighborsB.size === 0) return 0;
        const intersection = [...neighborsA].filter((x) => neighborsB.has(x)).length;
        const union = new Set([...neighborsA, ...neighborsB]).size;
        return intersection / union;
    }

    /** Raw Adamic-Adar Index — use maxPossibleAA to normalize. */
    public static adamicAdarIndex(sharedNeighbors: Set<string>, getDegree: (path: string) => number): number {
        let score = 0;
        sharedNeighbors.forEach((node) => {
            const degree = getDegree(node);
            if (degree > 1) score += 1 / Math.log(degree);
        });
        return score;
    }

    /** Resource Allocation Index — Lü & Zhou (2010). */
    public static resourceAllocationIndex(sharedNeighbors: Set<string>, getDegree: (path: string) => number): number {
        let score = 0;
        sharedNeighbors.forEach((node) => {
            const degree = getDegree(node);
            if (degree > 0) score += 1 / degree;
        });
        return score;
    }
}
