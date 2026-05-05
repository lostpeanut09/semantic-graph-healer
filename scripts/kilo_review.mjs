import fs from 'node:fs';
import { execSync } from 'node:child_process';

// Use REPO_PATH env var if provided, otherwise current dir
const repoPath = process.env.REPO_PATH || '.';

let diff = '';
try {
    // Check if we are in a git repo
    execSync(`git -C "${repoPath}" rev-parse --is-inside-work-tree`, { stdio: 'ignore' });
    diff = execSync(`git -C "${repoPath}" diff --staged`, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }).slice(
        0,
        200_000,
    );
} catch (err) {
    if (err.status === 128) {
        console.log('Not a git repository. Skipping review.');
        process.exit(0);
    }
    console.error('Error getting git diff:', err.message);
    process.exit(1);
}

if (!diff || diff.trim() === '') {
    console.log('No staged changes found to review.');
    process.exit(0);
}

const body = {
    model: 'kilo-auto/free',
    messages: [
        {
            role: 'system',
            content:
                'You are a strict senior code reviewer. Output:\n1) Summary\n2) High risk issues\n3) Medium/low issues\n4) Concrete fixes\n5) Missing tests\nBe specific with file paths and lines if possible.',
        },
        {
            role: 'user',
            content: `Review this staged diff:\n\n${diff}`,
        },
    ],
    temperature: 0.2,
    max_tokens: 1200,
};

async function runReview() {
    const models = [
        process.env.KILO_MODEL || 'kilo-auto/free',
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.1-8b-instruct:free',
    ];
    let lastError = null;

    for (const model of models) {
        try {
            const res = await fetch('https://api.kilo.ai/api/gateway/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-kilocode-mode': 'debug',
                },
                body: JSON.stringify({ ...body, model }),
            });

            if (!res.ok) {
                lastError = `Kilo API error (${res.status}): ${await res.text()}`;
                continue;
            }

            const json = await res.json();
            const content = json?.choices?.[0]?.message?.content;
            if (content) {
                console.log(content);
                return;
            }
            lastError = `Model ${model} returned empty content.`;
        } catch (err) {
            lastError = `Fetch error with ${model}: ${err.message}`;
        }
    }

    console.error('All review attempts failed. Last error:', lastError);
    process.exit(1);
}

await runReview();
