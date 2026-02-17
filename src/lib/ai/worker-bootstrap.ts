type WorkerRuntimeState = {
    started: boolean;
    handlersRegistered: boolean;
    shuttingDown: boolean;
    lastHeartbeat: number;
    crashCount: number;
    lastCrashAt: number;
    startedAt: number;
};

declare global {
    var __domainEmpireWorkerRuntime: WorkerRuntimeState | undefined;
}

const MAX_CRASH_RESTARTS = 5;
const CRASH_WINDOW_MS = 5 * 60 * 1000; // 5 min window
const BASE_RESTART_DELAY_MS = 2_000;
const MAX_RESTART_DELAY_MS = 60_000;

function parseEnvBool(value: string | undefined): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1'
        || normalized === 'true'
        || normalized === 'yes'
        || normalized === 'on';
}

function shouldBootServerWorker(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    if (parseEnvBool(process.env.DISABLE_SERVER_QUEUE_WORKER)) return false;
    // The dedicated worker (npm run dev) uses DB row-level locking
    // (FOR UPDATE SKIP LOCKED), so running the server bootstrap alongside
    // it is safe and acts as a resilient fallback if the external worker
    // crashes silently.
    return true;
}

export async function ensureServerWorkerStarted(): Promise<void> {
    if (!shouldBootServerWorker()) {
        return;
    }

    const state = globalThis.__domainEmpireWorkerRuntime ?? {
        started: false,
        handlersRegistered: false,
        shuttingDown: false,
        lastHeartbeat: 0,
        crashCount: 0,
        lastCrashAt: 0,
        startedAt: 0,
    };
    globalThis.__domainEmpireWorkerRuntime = state;
    if (state.started) {
        return;
    }

    state.started = true;
    state.shuttingDown = false;
    state.startedAt = Date.now();

    const {
        requestWorkerStop,
        runWorkerContinuously,
        waitForWorkerIdle,
    } = await import('@/lib/ai/worker');

    const shutdown = async (signal: string) => {
        if (state.shuttingDown) return;
        state.shuttingDown = true;
        console.log(`[WorkerBootstrap] ${signal} received; draining queue worker...`);
        requestWorkerStop();
        const idle = await waitForWorkerIdle(15_000);
        if (!idle) {
            console.warn('[WorkerBootstrap] Timed out waiting for worker to drain.');
        }
    };

    if (!state.handlersRegistered) {
        state.handlersRegistered = true;
        process.once('SIGTERM', () => {
            void shutdown('SIGTERM');
        });
        process.once('SIGINT', () => {
            void shutdown('SIGINT');
        });
    }

    async function startWithAutoRestart() {
        while (!state.shuttingDown) {
            state.lastHeartbeat = Date.now();
            console.log(`[WorkerBootstrap] Starting built-in queue worker process (crashes: ${state.crashCount}).`);

            try {
                await runWorkerContinuously();
                // Clean exit (stop requested)
                break;
            } catch (error) {
                state.started = false;
                const now = Date.now();

                // Reset crash counter if outside the crash window
                if (now - state.lastCrashAt > CRASH_WINDOW_MS) {
                    state.crashCount = 0;
                }
                state.crashCount++;
                state.lastCrashAt = now;

                console.error(`[WorkerBootstrap] Queue worker crashed (${state.crashCount}/${MAX_CRASH_RESTARTS}):`, error);

                if (state.shuttingDown) {
                    console.log('[WorkerBootstrap] Shutdown in progress, not restarting.');
                    break;
                }

                if (state.crashCount >= MAX_CRASH_RESTARTS) {
                    console.error(`[WorkerBootstrap] Worker crashed ${state.crashCount} times within ${CRASH_WINDOW_MS / 1000}s. Giving up.`);
                    break;
                }

                // Exponential backoff: 2s, 4s, 8s, 16s, capped at 60s
                const delay = Math.min(BASE_RESTART_DELAY_MS * Math.pow(2, state.crashCount - 1), MAX_RESTART_DELAY_MS);
                console.log(`[WorkerBootstrap] Restarting in ${(delay / 1000).toFixed(1)}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));

                state.started = true;
            }
        }
    }

    void startWithAutoRestart();
}

/** Get worker runtime state for health checks */
export function getWorkerHealth() {
    const state = globalThis.__domainEmpireWorkerRuntime;
    if (!state) {
        return {
            running: false,
            crashCount: 0,
            lastHeartbeat: null as number | null,
            uptimeMs: 0,
            shuttingDown: false,
        };
    }
    return {
        running: state.started,
        crashCount: state.crashCount,
        lastHeartbeat: state.lastHeartbeat || null,
        uptimeMs: state.startedAt ? Date.now() - state.startedAt : 0,
        shuttingDown: state.shuttingDown,
    };
}

/**
 * Restart the worker if it died (crash limit exhausted).
 * Safe to call repeatedly — no-ops if the worker is already running.
 * Resets the crash counter so the worker gets a fresh set of retries.
 */
export async function restartWorkerIfDead(): Promise<boolean> {
    if (!shouldBootServerWorker()) return false;

    const state = globalThis.__domainEmpireWorkerRuntime;
    if (!state) {
        // Never started — do a full bootstrap
        await ensureServerWorkerStarted();
        return true;
    }

    if (state.started || state.shuttingDown) {
        return false;
    }

    // Worker died. Reset crash counter and restart.
    console.log(
        `[WorkerBootstrap] Restarting dead worker (previous crashes: ${state.crashCount}).`,
    );
    state.crashCount = 0;
    state.lastCrashAt = 0;
    await ensureServerWorkerStarted();
    return true;
}

