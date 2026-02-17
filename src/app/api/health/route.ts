import { NextResponse } from 'next/server';
import { getWorkerHealth } from '@/lib/ai/worker-bootstrap';
import { getPoolStats } from '@/lib/db';

/**
 * Health check endpoint for monitoring.
 * Returns worker status, DB pool stats, and uptime.
 * No auth required — suitable for load balancer health checks.
 */
export async function GET() {
    const worker = getWorkerHealth();
    const pool = getPoolStats();

    const healthy = worker.running && !worker.shuttingDown && pool.utilization < 0.95;

    return NextResponse.json({
        status: healthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        worker: {
            running: worker.running,
            crashCount: worker.crashCount,
            uptimeMs: worker.uptimeMs,
            lastHeartbeat: worker.lastHeartbeat
                ? new Date(worker.lastHeartbeat).toISOString()
                : null,
            shuttingDown: worker.shuttingDown,
        },
        database: {
            poolMax: pool.max,
            poolActive: pool.active,
            poolUtilization: Math.round(pool.utilization * 100),
            poolWarning: pool.isWarning,
        },
    }, { status: healthy ? 200 : 503 });
}
