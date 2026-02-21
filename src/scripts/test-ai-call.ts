import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { getAIClient } from '@/lib/ai/openrouter';

async function main() {
    const ai = getAIClient();
    console.log('Testing AI call (blockContent task)...');
    const start = Date.now();
    try {
        const resp = await Promise.race([
            ai.generate('blockContent', 'Return a JSON object: {"test": true}'),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timed out after 15s')), 15_000),
            ),
        ]);
        console.log(`Success in ${Date.now() - start}ms`);
        console.log(`Model: ${resp.resolvedModel}`);
        console.log(`Content: ${resp.content.slice(0, 200)}`);
        console.log(`Cost: $${resp.cost.toFixed(6)}`);
    } catch (err) {
        console.error(`Failed in ${Date.now() - start}ms:`, err instanceof Error ? err.message : err);
    }
    process.exit(0);
}

main();
