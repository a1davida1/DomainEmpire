import { config } from 'dotenv';
import { requestWorkerStop, runWorkerContinuously, waitForWorkerIdle } from '@/lib/ai/worker';
import { installGracefulShutdownForProcess, registerShutdownHook } from '@/lib/tpilot/core/graceful-shutdown';

config({ path: '.env.local' });
installGracefulShutdownForProcess();

const HOOK_TIMEOUT_MS = 20_000;
const DRAIN_SAFETY_MARGIN_MS = 2_000;

registerShutdownHook({
    name: 'worker-drain',
    timeoutMs: HOOK_TIMEOUT_MS,
    order: 100,
    run: async () => {
        requestWorkerStop();
        // Use a shorter timeout than the hook framework so the hook has
        // headroom to finish cleanup and emit logs before the framework
        // timer preempts it.
        const idle = await waitForWorkerIdle(HOOK_TIMEOUT_MS - DRAIN_SAFETY_MARGIN_MS);
        if (!idle) {
            console.warn('[Worker] Shutdown timed out while waiting for active jobs');
        }
    },
});

/**
 * Single canonical worker entrypoint.
 *
 * The queue logic lives in src/lib/ai/worker.ts.
 * This script exists only as the npm-run target.
 */
runWorkerContinuously().catch((error: unknown) => {
    console.error('[Worker] Fatal startup error:', error);
    process.exit(1);
});
