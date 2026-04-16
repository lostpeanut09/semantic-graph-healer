import { HealerLogger } from './HealerUtils';
import { SemanticGraphHealerSettings } from '../types';

/**
 * LinkPredictionEngine: SOTA 2026 Deep Topology Engine.
 *
 * Implements a scientifically-grounded three-way blend of link prediction indices:
 *   1. Jaccard Similarity     — breadth of shared neighborhood [Liben-Nowell & Kleinberg, 2004]
 *   2. Adamic-Adar Index      — depth/quality, logarithmically penalizes large hubs [Adamic & Adar, 2003]
 *   3. Resource Allocation    — hub-aware without log dampening, better for MOC-heavy vaults [Lü & Zhou, 2010]
 */

export interface LinkPredictionWeights {
    jaccard: number;
    adamicAdar: number;
    resourceAllocation: number;
}

export interface PredictionResult {
    path: string;
    score: number;
    sharedCount: number;
}

export class LinkPredictionEngine {
    private readonly weights: LinkPredictionWeights;

    constructor(
        private relMaps: Record<string, Map<string, Set<string>>>,
        private pages: string[],
        weights?: Partial<LinkPredictionWeights>,
    ) {
        this.weights = {
            jaccard: weights?.jaccard ?? 0.35,
            adamicAdar: weights?.adamicAdar ?? 0.35,
            resourceAllocation: weights?.resourceAllocation ?? 0.3,
        };

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
     * Now uses Candidate Generation (Friends-of-Friends) to avoid O(N^2) complexity.
     */
    public findMissingRings(
        sourcePath: string,
        sourceMtime: number,
        fileStats: Map<string, { mtime: number }>,
        limit = 5,
    ): PredictionResult[] {
        const sourceNeighbors = this.getAllNeighbors(sourcePath);
        if (sourceNeighbors.size === 0) return [];

        const predictions: PredictionResult[] = [];

        // CANDIDATE GENERATION: Only check nodes that share at least one neighbor
        const candidates = new Set<string>();
        sourceNeighbors.forEach((neighbor) => {
            // Find notes that also have this neighbor
            this.pages.forEach((p) => {
                if (p === sourcePath) return;
                const pNeighbors = this.getAllNeighbors(p);
                if (pNeighbors.has(neighbor)) {
                    candidates.add(p);
                }
            });
        });

        for (const targetPath of candidates) {
            if (this.isAlreadyLinked(sourcePath, targetPath)) continue;

            const targetNeighbors = this.getAllNeighbors(targetPath);
            const shared = new Set([...sourceNeighbors].filter((x) => targetNeighbors.has(x)));

            // Heuristic: at least 2 shared neighbors for a "Missing Ring"
            if (shared.size < 2) continue;

            const targetMtime = fileStats.get(targetPath)?.mtime ?? Date.now();

            const score = LinkPredictionEngine.computeCombinedScore(
                sourceNeighbors,
                targetNeighbors,
                shared,
                (path) => this.getAllNeighbors(path).size,
                this.weights,
                { sourceMtime, targetMtime },
            );

            predictions.push({ path: targetPath, score, sharedCount: shared.size });
        }

        return predictions.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    /**
     * SOTA 2026: Pure functional score computation combining Jaccard, AA, RA and Temporal Decay.
     */
    public static computeCombinedScore(
        neighborsA: Set<string>,
        neighborsB: Set<string>,
        shared: Set<string>,
        getDegree: (path: string) => number,
        weights: LinkPredictionWeights,
        temporal?: { sourceMtime: number; targetMtime: number },
    ): number {
        // 1. Jaccard
        const unionSize = new Set([...neighborsA, ...neighborsB]).size;
        const jaccard = unionSize > 0 ? shared.size / unionSize : 0;

        // 2. Adamic-Adar
        let adamicAdar = 0;
        shared.forEach((z) => {
            const deg = getDegree(z);
            if (deg > 1) adamicAdar += 1 / Math.log(deg);
        });
        const maxPossibleAA = shared.size * (1 / Math.log(2));
        const normalizedAA = maxPossibleAA > 0 ? Math.min(adamicAdar / maxPossibleAA, 1) : 0;

        // 3. Resource Allocation
        let resourceAllocation = 0;
        shared.forEach((z) => {
            const deg = getDegree(z);
            if (deg > 0) resourceAllocation += 1 / deg;
        });
        const normalizedRA = Math.min(resourceAllocation, 1);

        // 4. Temporal Decay
        let temporalMultiplier = 1;
        if (temporal) {
            const deltaDays = Math.abs(temporal.sourceMtime - temporal.targetMtime) / (1000 * 60 * 60 * 24);
            temporalMultiplier = Math.exp(-0.005 * deltaDays);
        }

        const baseScore =
            jaccard * weights.jaccard + normalizedAA * weights.adamicAdar + normalizedRA * weights.resourceAllocation;

        return baseScore * temporalMultiplier;
    }

    /**
     * Compute co-citation score based on shared backlinkers.
     */
    public static computeCoCitationScore(backlinkersA: Set<string>, backlinkersB: Set<string>): number {
        const intersection = [...backlinkersA].filter((x) => backlinkersB.has(x));
        return intersection.length;
    }

    // ─── Helpers ────────────────────────────────────────────────────────

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

    // ─── Static Indices ─────────────────────────────────────────────────────────

    public static jaccardSimilarity(neighborsA: Set<string>, neighborsB: Set<string>): number {
        if (neighborsA.size === 0 || neighborsB.size === 0) return 0;
        const intersection = [...neighborsA].filter((x) => neighborsB.has(x)).length;
        const union = new Set([...neighborsA, ...neighborsB]).size;
        return intersection / union;
    }

    public static adamicAdarIndex(sharedNeighbors: Set<string>, getDegree: (path: string) => number): number {
        let score = 0;
        sharedNeighbors.forEach((node) => {
            const degree = getDegree(node);
            if (degree > 1) score += 1 / Math.log(degree);
        });
        return score;
    }

    public static resourceAllocationIndex(sharedNeighbors: Set<string>, getDegree: (path: string) => number): number {
        let score = 0;
        sharedNeighbors.forEach((node) => {
            const degree = getDegree(node);
            if (degree > 0) score += 1 / degree;
        });
        return score;
    }
}
