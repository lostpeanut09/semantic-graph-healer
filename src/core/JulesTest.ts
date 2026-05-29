/**
 * This file contains intentional violations of project rules
 * to test the Jules AI Code Reviewer.
 */

export class JulesTest {
    /**
     * VIOLATION 1: Security (Sentinel)
     * Using Math.random() for ID generation instead of crypto.randomUUID().
     */
    public generateInsecureId(): string {
        return 'ID-' + Math.random().toString(36).substring(2, 11);
    }

    /**
     * VIOLATION 2: Performance (Bolt)
     * Using JavaScript Array spreading for Set intersection in a potential hot loop.
     */
    public getIntersectionSize(setA: Set<string>, setB: Set<string>): number {
        const intersection = [...setA].filter((x) => setB.has(x));
        return intersection.length;
    }

    /**
     * VIOLATION 3: Accessibility (Palette)
     * Simulated UI input without aria-label.
     */
    public renderSearchInput(): string {
        return `<input type="text" placeholder="Search knowledge graph..." />`;
    }
}
