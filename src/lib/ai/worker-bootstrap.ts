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
    // `npm run dev` already starts a dedicated worker process.
    if (process.env.NEXT_PUBLIC_INLINE_WORKER === '1') return false;
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

    state.started = true;
    console.log('[WorkerBootstrap] Starting built-in queue worker process.');
    void runWorkerContinuously().catch((error) => {
        state.started = false;
        console.error('[WorkerBootstrap] Queue worker crashed:', error);
    });
}

