type WorkerRuntimeState = {
    started: boolean;
    handlersRegistered: boolean;
    shuttingDown: boolean;
};

declare global {
    var __domainEmpireWorkerRuntime: WorkerRuntimeState | undefined;
}

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
    };
    globalThis.__domainEmpireWorkerRuntime = state;
    if (state.started) {
        return;
    }

    state.started = true;
    state.shuttingDown = false;

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

    console.log('[WorkerBootstrap] Starting built-in queue worker process.');
    void runWorkerContinuously().catch((error) => {
        state.started = false;
        console.error('[WorkerBootstrap] Queue worker crashed:', error);
    });
}

