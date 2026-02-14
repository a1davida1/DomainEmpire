import type { Server as HttpServer } from 'node:http';
import { logger } from './logger';

export type ShutdownState = 'running' | 'draining' | 'stopped';

let shutdownState: ShutdownState = 'running';
let shutdownStartedAt: number | null = null;

let inFlightRequests = 0;
let onZeroInFlight: Array<() => void> = [];

export type ShutdownHook = {
  name: string;
  timeoutMs?: number;
  order?: number;
  run: () => Promise<void> | void;
};

type RegisteredHook = { hook: ShutdownHook; seq: number };

const DEFAULT_HOOK_ORDER = 500;
let hookSeq = 0;
const hooks: RegisteredHook[] = [];

export function registerShutdownHook(hook: ShutdownHook): void {
  hooks.push({ hook, seq: hookSeq++ });
}

export function getShutdownState(): { state: ShutdownState; startedAt: number | null; inFlightRequests: number } {
  return { state: shutdownState, startedAt: shutdownStartedAt, inFlightRequests };
}

export function isDraining(): boolean {
  return shutdownState === 'draining';
}

/**
 * Optional request tracking for custom HTTP servers.
 * Call `begin()` when a request starts and `end()` exactly once when it finishes.
 */
export function createRequestDrainTracker(): { begin: () => void; end: () => void } {
  return {
    begin: () => {
      inFlightRequests += 1;
    },
    end: () => {
      inFlightRequests = Math.max(0, inFlightRequests - 1);
      if (inFlightRequests === 0) {
        const callbacks = onZeroInFlight;
        onZeroInFlight = [];
        for (const cb of callbacks) {
          try {
            cb();
          } catch (err) {
            logger.error('[Shutdown] onZeroInFlight callback failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    },
  };
}

async function waitForInFlightToDrain(timeoutMs: number): Promise<void> {
  if (inFlightRequests === 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    let resolved = false;
    const doResolve = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve();
    };

    const timeout = setTimeout(() => {
      logger.warn('[Shutdown] In-flight requests did not drain before timeout', {
        inFlightRequests,
        timeoutMs,
      });
      // Remove callback from queue if still there
      const idx = onZeroInFlight.indexOf(callback);
      if (idx >= 0) onZeroInFlight.splice(idx, 1);
      doResolve();
    }, timeoutMs);

    timeout.unref();

    const callback = () => {
      doResolve();
    };
    onZeroInFlight.push(callback);

    // Re-check after registering to avoid race condition
    if (inFlightRequests === 0) {
      const idx = onZeroInFlight.indexOf(callback);
      if (idx >= 0) onZeroInFlight.splice(idx, 1);
      doResolve();
    }
  });
}

function getSortedHooks(): ShutdownHook[] {
  const sorted = [...hooks].sort((a, b) => {
    const ao = a.hook.order ?? DEFAULT_HOOK_ORDER;
    const bo = b.hook.order ?? DEFAULT_HOOK_ORDER;
    if (ao !== bo) {
      return ao - bo;
    }
    return a.seq - b.seq;
  });
  return sorted.map((r) => r.hook);
}

async function runHooks(): Promise<void> {
  for (const hook of getSortedHooks()) {
    const timeoutMs = hook.timeoutMs ?? 10_000;

    try {
      let timeoutHandle: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
        timeoutHandle.unref();
      });

      const hookPromise = Promise.resolve()
        .then(() => hook.run())
        .then(() => ({ timedOut: false as const }));

      const result = await Promise.race([hookPromise, timeoutPromise]);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (result.timedOut) {
        logger.error('[Shutdown] Hook timed out', { name: hook.name, timeoutMs });
      } else {
        logger.info('[Shutdown] Hook complete', { name: hook.name });
      }
    } catch (error) {
      logger.error('[Shutdown] Hook failed', {
        name: hook.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function installGracefulShutdown(params: {
  server: HttpServer;
  shutdownTimeoutMs?: number;
  drainRequestsTimeoutMs?: number;
}): void {
  const shutdownTimeoutMs = params.shutdownTimeoutMs ?? 30_000;
  const drainRequestsTimeoutMs = params.drainRequestsTimeoutMs ?? 10_000;

  const handlersKey = Symbol.for('domainempire.gracefulShutdown.handlersRegistered');
  const globalState = globalThis as unknown as Record<symbol, unknown>;
  if (globalState[handlersKey] === true) {
    return;
  }
  globalState[handlersKey] = true;

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    shutdownState = 'draining';
    shutdownStartedAt = Date.now();

    logger.info(`[Shutdown] ${signal} received: draining web process`);

    const hardTimeout = setTimeout(() => {
      logger.error('[Shutdown] Hard timeout exceeded, forcing exit', {
        shutdownTimeoutMs,
        inFlightRequests,
      });
      process.exit(1);
    }, shutdownTimeoutMs);
    hardTimeout.unref();

    try {
      await new Promise<void>((resolve) => {
        params.server.close(() => {
          logger.info('[Shutdown] HTTP server closed (no longer accepting new connections)');
          resolve();
        });
      });

      await waitForInFlightToDrain(drainRequestsTimeoutMs);
      await runHooks();

      shutdownState = 'stopped';
      clearTimeout(hardTimeout);
      logger.info('[Shutdown] Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      clearTimeout(hardTimeout);
      throw err;
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

export function installGracefulShutdownForProcess(params?: {
  shutdownTimeoutMs?: number;
}): void {
  const shutdownTimeoutMs = params?.shutdownTimeoutMs ?? 30_000;

  const handlersKey = Symbol.for('domainempire.gracefulShutdown.processHandlersRegistered');
  const globalState = globalThis as unknown as Record<symbol, unknown>;
  if (globalState[handlersKey] === true) {
    return;
  }
  globalState[handlersKey] = true;

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    shutdownState = 'draining';
    shutdownStartedAt = Date.now();

    logger.info(`[Shutdown] ${signal} received: draining worker process`);

    const hardTimeout = setTimeout(() => {
      logger.error('[Shutdown] Hard timeout exceeded (process mode), forcing exit', {
        shutdownTimeoutMs,
      });
      process.exit(1);
    }, shutdownTimeoutMs);

    hardTimeout.unref();

    try {
      await runHooks();
      shutdownState = 'stopped';
      clearTimeout(hardTimeout);
      logger.info('[Shutdown] Graceful shutdown complete (process mode)');
      process.exit(0);
    } catch (err) {
      clearTimeout(hardTimeout);
      throw err;
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
