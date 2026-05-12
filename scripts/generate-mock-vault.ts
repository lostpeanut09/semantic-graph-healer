import * as fs from 'fs';
import * as path from 'path';
import { faker } from '@faker-js/faker';

const NUM_FILES = parseInt(process.env.NUM_FILES || '10000', 10);
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'bench-vault';
const M_INITIAL = 5; // Initial connected nodes
const M_LINKS = 2;   // New links per new node

async function generateMockVault() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    } else {
        console.log(`Cleaning existing vault at ${OUTPUT_DIR}...`);
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log(`Generating ${NUM_FILES} nodes with Barabási–Albert model (m=${M_LINKS})...`);

    const fileNames: string[] = [];
    const degrees: number[] = [];
    const adj: number[][] = [];

    // Step 1: Initialize initial nodes
    for (let i = 0; i < M_INITIAL; i++) {
        const name = `Note-${i.toString().padStart(5, '0')}`;
        fileNames.push(name);
        degrees.push(0);
        adj.push([]);
    }

    // Fully connect initial nodes
    for (let i = 0; i < M_INITIAL; i++) {
        for (let j = i + 1; j < M_INITIAL; j++) {
            adj[i].push(j);
            adj[j].push(i);
            degrees[i]++;
            degrees[j]++;
        }
    }

    // Step 2: Add nodes one by one with preferential attachment
    for (let i = M_INITIAL; i < NUM_FILES; i++) {
        const name = `Note-${i.toString().padStart(5, '0')}`;
        fileNames.push(name);
        degrees.push(0);
        adj.push([]);

        const targets = new Set<number>();
        const totalDegree = degrees.reduce((a, b) => a + b, 0);

        while (targets.size < Math.min(i, M_LINKS)) {
            // Weighted selection based on degree
            let r = Math.random() * totalDegree;
            let cumulative = 0;
            for (let j = 0; j < i; j++) {
                cumulative += degrees[j];
                if (r <= cumulative) {
                    targets.add(j);
                    break;
                }
            }
        }

        for (const target of targets) {
            adj[i].push(target);
            adj[target].push(i);
            degrees[i]++;
            degrees[target]++;
        }

        if (i % 1000 === 0) {
            console.log(`Progress: ${i}/${NUM_FILES} nodes...`);
        }
    }

    console.log('Writing files to disk...');
    for (let i = 0; i < NUM_FILES; i++) {
        const fileName = fileNames[i];
        const filePath = path.join(OUTPUT_DIR, `${fileName}.md`);
        
        const links = adj[i].map(idx => `[[${fileNames[targetIdx(idx, i)]}]]`).join('\n');
        const content = `# ${fileName}\n\n${faker.lorem.paragraphs(2)}\n\n## Links\n${links}\n\n## Metadata\n- tags: #mock #bench\n- date: ${faker.date.past().toISOString()}`;
        
        fs.writeFileSync(filePath, content);
        
        if (i % 1000 === 0) {
            console.log(`Progress: ${i}/${NUM_FILES} files written...`);
        }
    }

    console.log('Done!');
}

function targetIdx(idx: number, current: number): number {
    return idx;
}

generateMockVault().catch(console.error);
