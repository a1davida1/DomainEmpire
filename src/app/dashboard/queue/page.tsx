import { db } from '@/lib/db';
import { contentQueue } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { getQueueHealth } from '@/lib/ai/worker';
import { revalidatePath } from 'next/cache';

async function retryFailedAction() {
    'use server';
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/queue/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
    });
    revalidatePath('/dashboard/queue');
}

async function cancelJobAction(formData: FormData) {
    'use server';
    const jobId = formData.get('jobId') as string;
    if (!jobId) return;
    await db.update(contentQueue)
        .set({ status: 'cancelled' })
        .where(eq(contentQueue.id, jobId));
    revalidatePath('/dashboard/queue');
}

export default async function QueuePage() {
    const health = await getQueueHealth();

    const recentJobs = await db.select()
        .from(contentQueue)
        .orderBy(desc(contentQueue.createdAt))
        .limit(50);

    const jobsByType = await db.select({
        jobType: contentQueue.jobType,
        count: sql<number>`count(*)::int`,
    })
        .from(contentQueue)
        .where(eq(contentQueue.status, 'pending'))
        .groupBy(contentQueue.jobType);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Job Queue</h1>
                {health.failed > 0 && (
                    <form action={retryFailedAction}>
                        <button type="submit" className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700">
                            Retry Failed Jobs
                        </button>
                    </form>
                )}
            </div>

            {/* Health metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Pending" value={health.pending} color="yellow" />
                <StatCard label="Processing" value={health.processing} color="blue" />
                <StatCard label="Completed" value={health.completed} color="green" />
                <StatCard label="Failed" value={health.failed} color="red" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Throughput</p>
                    <p className="text-2xl font-bold">{health.throughputPerHour}/hr</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Error Rate (24h)</p>
                    <p className="text-2xl font-bold">{health.errorRate24h}%</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Avg Processing</p>
                    <p className="text-2xl font-bold">
                        {health.avgProcessingTimeMs ? `${Math.round(health.avgProcessingTimeMs / 1000)}s` : 'N/A'}
                    </p>
                </div>
            </div>

            {/* Pending by type */}
            {jobsByType.length > 0 && (
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-3">Pending by Type</h2>
                    <div className="flex flex-wrap gap-2">
                        {jobsByType.map(j => (
                            <span key={j.jobType} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                                {j.jobType}: {j.count}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent jobs table */}
            <div className="bg-card rounded-lg border overflow-hidden">
                <h2 className="text-lg font-semibold p-4 border-b">Recent Jobs</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">Type</th>
                                <th className="text-left p-3">Status</th>
                                <th className="text-left p-3">Attempts</th>
                                <th className="text-left p-3">Cost</th>
                                <th className="text-left p-3">Created</th>
                                <th className="text-left p-3">Error</th>
                                <th className="text-left p-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentJobs.map(job => (
                                <tr key={job.id} className="border-t">
                                    <td className="p-3 font-mono text-xs">{job.jobType}</td>
                                    <td className="p-3">
                                        <StatusBadge status={job.status || 'pending'} />
                                    </td>
                                    <td className="p-3">{job.attempts}/{job.maxAttempts}</td>
                                    <td className="p-3">{job.apiCost ? `$${job.apiCost.toFixed(4)}` : '—'}</td>
                                    <td className="p-3 text-muted-foreground">
                                        {job.createdAt ? new Date(job.createdAt).toLocaleString() : '—'}
                                    </td>
                                    <td className="p-3 text-red-500 text-xs max-w-xs truncate">
                                        {job.errorMessage || '—'}
                                    </td>
                                    <td className="p-3">
                                        {(job.status === 'pending' || job.status === 'processing') && (
                                            <form action={cancelJobAction}>
                                                <input type="hidden" name="jobId" value={job.id} />
                                                <button type="submit" className="text-xs text-red-600 hover:underline">
                                                    Cancel
                                                </button>
                                            </form>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    const colorMap: Record<string, string> = {
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        green: 'bg-green-50 text-green-700 border-green-200',
        red: 'bg-red-50 text-red-700 border-red-200',
    };
    return (
        <div className={`rounded-lg border p-4 ${colorMap[color] || ''}`}>
            <p className="text-sm opacity-70">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        pending: 'bg-yellow-100 text-yellow-800',
        processing: 'bg-blue-100 text-blue-800',
        completed: 'bg-green-100 text-green-800',
        failed: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
            {status}
        </span>
    );
}
