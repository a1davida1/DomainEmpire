/**
 * Worker Entry Point
 * 
 * Runs the content queue worker as a standalone process.
 * Loads .env.local using Node built-in fs (zero external dependencies).
 * 
 * Usage: npx tsx src/scripts/worker.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local manually — no dotenv dependency needed
const envPath = resolve(process.cwd(), '.env.local');
try {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex);
        const value = trimmed.slice(eqIndex + 1);
        // Only set if not already defined (allow OS env to override)
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
    console.log('[Worker] Loaded environment from .env.local');
} catch {
    console.warn('[Worker] Could not load .env.local — using existing environment');
}

console.log('[Worker] Database URL:', process.env.DATABASE_URL ? 'Set ✓' : 'MISSING ✗');

// Dynamic import AFTER env is loaded so db connection picks up DATABASE_URL
const { runWorkerContinuously } = await import('../lib/ai/worker');

console.log('[Worker] Starting continuous queue worker...');

try {
    await runWorkerContinuously();
} catch (err) {
    console.error('[Worker] Fatal crash:', err);
    process.exit(1);
}
