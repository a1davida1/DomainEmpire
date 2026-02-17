import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getQueueStats } from '@/lib/ai/worker';
import { getWorkerHealth } from '@/lib/ai/worker-bootstrap';
import { getPoolStats } from '@/lib/db';

const INTERVAL_MS = 5_000; // Push update every 5 seconds

/**
 * SSE endpoint that streams queue stats, worker health, and DB pool status.
 * Clients connect via EventSource and receive periodic JSON updates.
 */
export async function GET(_request: NextRequest) {
    // Auth check via Next.js cookies()
    const user = await getAuthUser();
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const encoder = new TextEncoder();
    let closed = false;

    const stream = new ReadableStream({
        async start(controller) {
            async function push() {
                if (closed) return;
                try {
                    const [queueStats, workerHealth, poolStats] = await Promise.all([
                        getQueueStats(),
                        getWorkerHealth(),
                        getPoolStats(),
                    ]);

                    const data = JSON.stringify({
                        timestamp: new Date().toISOString(),
                        queue: queueStats,
                        worker: {
                            running: workerHealth.running,
                            crashCount: workerHealth.crashCount,
                            uptimeMs: workerHealth.uptimeMs,
                            shuttingDown: workerHealth.shuttingDown,
                        },
                        pool: {
                            max: poolStats.max,
                            active: poolStats.active,
                            utilization: Math.round(poolStats.utilization * 100),
                            warning: poolStats.isWarning,
                        },
                    });

                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (err) {
                    console.error('[SSE] Error pushing queue stats:', err);
                    controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'Failed to fetch stats' })}\n\n`));
                }

                if (!closed) {
                    setTimeout(push, INTERVAL_MS);
                }
            }

            // Send initial keepalive comment
            controller.enqueue(encoder.encode(': connected\n\n'));
            push();
        },
        cancel() {
            closed = true;
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Nginx compat
        },
    });
}
