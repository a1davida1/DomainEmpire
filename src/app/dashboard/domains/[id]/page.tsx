import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ArrowLeft,
    ExternalLink,
    Edit,
    Globe,
    Calendar,
    DollarSign,
    Tag,
    FileText,
    BarChart3,
    Trash2
} from 'lucide-react';
import ContentTypeConfig from '@/components/dashboard/ContentTypeConfig';
import { DomainDetailTabs } from '@/components/dashboard/DomainDetailTabs';
import DomainChannelCompatibilityConfig from '@/components/dashboard/DomainChannelCompatibilityConfig';
import DomainLifecycleControls from '@/components/dashboard/DomainLifecycleControls';
import DomainWorkflowConfig from '@/components/dashboard/DomainWorkflowConfig';
import DomainOwnershipOperationsConfig from '@/components/dashboard/DomainOwnershipOperationsConfig';
import { db } from '@/lib/db';
import { articles, contentQueue } from '@/lib/db/schema';
import { getDomain, getDomainStats, getRecentArticles } from '@/lib/domains';
import { requeueContentJobIds } from '@/lib/queue/content-queue';
import { revalidatePath } from 'next/cache';
import { verifyAuth } from '@/lib/auth';
import { getOperationsSettings, type OperationsSettings } from '@/lib/settings/operations';


interface PageProps {
    params: Promise<{ id: string }>;
}

const statusColors: Record<string, string> = {
    parked: 'bg-gray-500',
    active: 'bg-green-500',
    redirect: 'bg-blue-500',
    forsale: 'bg-orange-500',
    defensive: 'bg-purple-500',
};

const tierLabels: Record<number, string> = {
    1: 'Priority',
    2: 'Secondary',
    3: 'Hold',
};

const queueStatusClasses: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-900',
    processing: 'bg-blue-100 text-blue-900',
    completed: 'bg-emerald-100 text-emerald-900',
    failed: 'bg-red-100 text-red-900',
    cancelled: 'bg-slate-100 text-slate-900',
};

type DomainQueueSnapshot = {
    byStatus: {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        cancelled: number;
        total: number;
    };
    recentJobs: Array<{
        id: string;
        jobType: string;
        status: string | null;
        attempts: number | null;
        maxAttempts: number | null;
        errorMessage: string | null;
        createdAt: Date | null;
        articleId: string | null;
        articleTitle: string | null;
    }>;
    failedByType: Array<{
        jobType: string;
        count: number;
    }>;
    queueSla: {
        pendingThresholdMinutes: number;
        processingThresholdMinutes: number;
        oldestPendingAt: Date | null;
        oldestProcessingAt: Date | null;
        pendingAgeMinutes: number | null;
        processingAgeMinutes: number | null;
        pendingBreached: boolean;
        processingBreached: boolean;
    };
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_TYPE_REGEX = /^[a-z0-9_]+$/i;

function formatDateTime(value: Date | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString();
}

function toValidDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    return null;
}

function computeAgeMinutes(from: Date | null): number | null {
    if (!from) return null;
    const ageMs = Date.now() - from.getTime();
    if (!Number.isFinite(ageMs)) return null;
    return Math.max(Math.round(ageMs / 60_000), 0);
}

function formatAgeMinutes(minutes: number | null): string {
    if (minutes === null) return '—';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    if (remMinutes === 0) return `${hours}h`;
    return `${hours}h ${remMinutes}m`;
}

function domainQueueScopeFilter(domainId: string) {
    return sql`(${contentQueue.domainId} = ${domainId} OR ${contentQueue.articleId} IN (
        SELECT ${articles.id} FROM ${articles} WHERE ${articles.domainId} = ${domainId}
    ))`;
}

async function getDomainQueueSnapshot(domainId: string, settings: OperationsSettings): Promise<DomainQueueSnapshot> {
    const [statusRows, recentJobs, failedByType, slaRows] = await Promise.all([
        db.select({
            status: contentQueue.status,
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .where(domainQueueScopeFilter(domainId))
            .groupBy(contentQueue.status),
        db.select({
            id: contentQueue.id,
            jobType: contentQueue.jobType,
            status: contentQueue.status,
            attempts: contentQueue.attempts,
            maxAttempts: contentQueue.maxAttempts,
            errorMessage: contentQueue.errorMessage,
            createdAt: contentQueue.createdAt,
            articleId: contentQueue.articleId,
            articleTitle: articles.title,
        })
            .from(contentQueue)
            .leftJoin(articles, eq(contentQueue.articleId, articles.id))
            .where(domainQueueScopeFilter(domainId))
            .orderBy(desc(contentQueue.createdAt))
            .limit(12),
        db.select({
            jobType: contentQueue.jobType,
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.status, 'failed'),
                domainQueueScopeFilter(domainId),
            ))
            .groupBy(contentQueue.jobType)
            .orderBy(sql`count(*) desc`, contentQueue.jobType),
        db.select({
            oldestPendingAt: sql<Date | null>`min(case when ${contentQueue.status} = 'pending' then ${contentQueue.createdAt} else null end)`,
            oldestProcessingAt: sql<Date | null>`min(case when ${contentQueue.status} = 'processing' then coalesce(${contentQueue.startedAt}, ${contentQueue.createdAt}) else null end)`,
        })
            .from(contentQueue)
            .where(domainQueueScopeFilter(domainId)),
    ]);

    const byStatus = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
    };

    for (const row of statusRows) {
        const status = row.status ?? '';
        if (status === 'pending') byStatus.pending = row.count;
        if (status === 'processing') byStatus.processing = row.count;
        if (status === 'completed') byStatus.completed = row.count;
        if (status === 'failed') byStatus.failed = row.count;
        if (status === 'cancelled') byStatus.cancelled = row.count;
        byStatus.total += row.count;
    }

    const oldestPendingAt = toValidDate(slaRows[0]?.oldestPendingAt);
    const oldestProcessingAt = toValidDate(slaRows[0]?.oldestProcessingAt);
    const pendingAgeMinutes = computeAgeMinutes(oldestPendingAt);
    const processingAgeMinutes = computeAgeMinutes(oldestProcessingAt);

    return {
        byStatus,
        recentJobs,
        failedByType: failedByType
            .filter((row) => typeof row.jobType === 'string' && row.jobType.length > 0)
            .map((row) => ({
                jobType: row.jobType,
                count: row.count,
            })),
        queueSla: {
            pendingThresholdMinutes: settings.queuePendingSlaMinutes,
            processingThresholdMinutes: settings.queueProcessingSlaMinutes,
            oldestPendingAt,
            oldestProcessingAt,
            pendingAgeMinutes,
            processingAgeMinutes,
            pendingBreached: pendingAgeMinutes !== null && pendingAgeMinutes > settings.queuePendingSlaMinutes,
            processingBreached: processingAgeMinutes !== null && processingAgeMinutes > settings.queueProcessingSlaMinutes,
        },
    };
}

async function retryDomainFailedJobsAction(formData: FormData) {
    'use server';

    const isAuthed = await verifyAuth();
    if (!isAuthed) return;

    const domainIdRaw = formData.get('domainId');
    if (typeof domainIdRaw !== 'string') return;
    const domainId = domainIdRaw.trim();
    if (!UUID_REGEX.test(domainId)) return;

    const now = new Date();
    const updatedRows = await db
        .update(contentQueue)
        .set({
            status: 'pending',
            attempts: 0,
            errorMessage: null,
            scheduledFor: now,
            lockedUntil: null,
            startedAt: null,
            completedAt: null,
        })
        .where(and(
            eq(contentQueue.status, 'failed'),
            domainQueueScopeFilter(domainId),
        ))
        .returning({ id: contentQueue.id });

    const updatedIds = updatedRows.map((row) => row.id);
    if (updatedIds.length > 0) {
        try {
            await requeueContentJobIds(updatedIds);
        } catch (error) {
            console.error('Failed to publish retry event for domain failed jobs', {
                domainId,
                retriedJobs: updatedIds.length,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    revalidatePath(`/dashboard/domains/${domainId}`);
    revalidatePath('/dashboard/queue');
}

async function retryDomainFailedJobsByTypeAction(formData: FormData) {
    'use server';

    const isAuthed = await verifyAuth();
    if (!isAuthed) return;

    const domainIdRaw = formData.get('domainId');
    const jobTypeRaw = formData.get('jobType');
    if (typeof domainIdRaw !== 'string' || typeof jobTypeRaw !== 'string') return;

    const domainId = domainIdRaw.trim();
    const jobType = jobTypeRaw.trim();
    if (!UUID_REGEX.test(domainId) || !JOB_TYPE_REGEX.test(jobType)) return;

    const now = new Date();
    const updatedRows = await db
        .update(contentQueue)
        .set({
            status: 'pending',
            attempts: 0,
            errorMessage: null,
            scheduledFor: now,
            lockedUntil: null,
            startedAt: null,
            completedAt: null,
        })
        .where(and(
            eq(contentQueue.status, 'failed'),
            sql`${contentQueue.jobType} = ${jobType}`,
            domainQueueScopeFilter(domainId),
        ))
        .returning({ id: contentQueue.id });

    const updatedIds = updatedRows.map((row) => row.id);
    if (updatedIds.length > 0) {
        try {
            await requeueContentJobIds(updatedIds);
        } catch (error) {
            console.error('Failed to publish retry event for failed jobs by type', {
                domainId,
                jobType,
                retriedJobs: updatedIds.length,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    revalidatePath(`/dashboard/domains/${domainId}`);
    revalidatePath('/dashboard/queue');
}

async function retryDomainLatestFailedJobByTypeAction(formData: FormData) {
    'use server';

    const isAuthed = await verifyAuth();
    if (!isAuthed) return;

    const domainIdRaw = formData.get('domainId');
    const jobTypeRaw = formData.get('jobType');
    if (typeof domainIdRaw !== 'string' || typeof jobTypeRaw !== 'string') return;

    const domainId = domainIdRaw.trim();
    const jobType = jobTypeRaw.trim();
    if (!UUID_REGEX.test(domainId) || !JOB_TYPE_REGEX.test(jobType)) return;

    const [latestFailed] = await db
        .select({ id: contentQueue.id })
        .from(contentQueue)
        .where(and(
            eq(contentQueue.status, 'failed'),
            sql`${contentQueue.jobType} = ${jobType}`,
            domainQueueScopeFilter(domainId),
        ))
        .orderBy(desc(contentQueue.createdAt))
        .limit(1);

    if (!latestFailed) return;

    const now = new Date();
    const [updated] = await db
        .update(contentQueue)
        .set({
            status: 'pending',
            attempts: 0,
            errorMessage: null,
            scheduledFor: now,
            lockedUntil: null,
            startedAt: null,
            completedAt: null,
        })
        .where(and(
            eq(contentQueue.id, latestFailed.id),
            eq(contentQueue.status, 'failed'),
        ))
        .returning({ id: contentQueue.id });

    if (!updated) return;

    try {
        await requeueContentJobIds([updated.id]);
    } catch (error) {
        console.error('Failed to publish retry event for latest failed job by type', {
            domainId,
            jobType,
            jobId: updated.id,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    revalidatePath(`/dashboard/domains/${domainId}`);
    revalidatePath('/dashboard/queue');
}

export default async function DomainDetailPage({ params }: PageProps) {
    const { id } = await params;
    const domain = await getDomain(id);

    if (!domain) {
        notFound();
    }

    const operationsSettingsPromise = getOperationsSettings();
    const [stats, recentArticles, operationsSettings] = await Promise.all([
        getDomainStats(id),
        getRecentArticles(id),
        operationsSettingsPromise,
    ]);
    const queueSnapshot = await getDomainQueueSnapshot(id, operationsSettings);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/domains">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold">{domain.domain}</h1>
                            <Badge className={`${statusColors[domain.status]} text-white`}>
                                {domain.status}
                            </Badge>
                            {domain.isDeployed && (
                                <Badge variant="secondary" className="bg-green-100 text-green-800">
                                    Live
                                </Badge>
                            )}
                        </div>
                        <p className="text-muted-foreground">
                            Added {domain.createdAt ? new Date(domain.createdAt).toLocaleDateString() : 'Unknown'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Link href={`/dashboard/queue?domainId=${id}`}>
                        <Button variant="outline">Queue</Button>
                    </Link>
                    {domain.isDeployed && (
                        <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Visit Site
                            </Button>
                        </a>
                    )}
                    <Link href={`/dashboard/domains/${id}/edit`}>
                        <Button variant="outline">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                        </Button>
                    </Link>
                </div>
            </div>

            <DomainDetailTabs domainId={id} />

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-primary/10 p-2">
                                <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.articles}</p>
                                <p className="text-sm text-muted-foreground">Articles</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-blue-500/10 p-2">
                                <Tag className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.keywords}</p>
                                <p className="text-sm text-muted-foreground">Keywords</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-green-500/10 p-2">
                                <DollarSign className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {domain.purchasePrice ? `$${Number(domain.purchasePrice).toFixed(2)}` : 'Not set'}
                                </p>
                                <p className="text-sm text-muted-foreground">Purchase Price</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-orange-500/10 p-2">
                                <BarChart3 className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">T{domain.tier}</p>
                                <p className="text-sm text-muted-foreground">{tierLabels[domain.tier || 3]}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Queue Activity</CardTitle>
                        <CardDescription>
                            Domain-specific queue health and recent pipeline jobs.
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <form action={retryDomainFailedJobsAction}>
                            <input type="hidden" name="domainId" value={id} />
                            <Button
                                size="sm"
                                variant="outline"
                                type="submit"
                                disabled={queueSnapshot.byStatus.failed === 0}
                            >
                                Retry Failed Jobs
                            </Button>
                        </form>
                        <Link href={`/dashboard/queue?domainId=${id}`}>
                            <Button size="sm" variant="outline">Open Queue</Button>
                        </Link>
                        <Link href={`/dashboard/queue?domainId=${id}&preset=failures`}>
                            <Button size="sm" variant="outline">Failures</Button>
                        </Link>
                        <Link href={`/dashboard/queue?domainId=${id}&preset=deploy`}>
                            <Button size="sm" variant="outline">Deploy Jobs</Button>
                        </Link>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-6">
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Total</p>
                            <p className="text-xl font-semibold">{queueSnapshot.byStatus.total}</p>
                        </div>
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Pending</p>
                            <p className="text-xl font-semibold">{queueSnapshot.byStatus.pending}</p>
                        </div>
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Processing</p>
                            <p className="text-xl font-semibold">{queueSnapshot.byStatus.processing}</p>
                        </div>
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Completed</p>
                            <p className="text-xl font-semibold">{queueSnapshot.byStatus.completed}</p>
                        </div>
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Failed</p>
                            <p className="text-xl font-semibold">{queueSnapshot.byStatus.failed}</p>
                        </div>
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Cancelled</p>
                            <p className="text-xl font-semibold">{queueSnapshot.byStatus.cancelled}</p>
                        </div>
                    </div>

                    <div className="rounded border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">Queue SLA</p>
                            <Badge className={queueSnapshot.queueSla.pendingBreached ? 'bg-red-100 text-red-900' : 'bg-emerald-100 text-emerald-900'}>
                                Pending ≤ {queueSnapshot.queueSla.pendingThresholdMinutes}m:
                                {' '}
                                {formatAgeMinutes(queueSnapshot.queueSla.pendingAgeMinutes)}
                            </Badge>
                            <Badge className={queueSnapshot.queueSla.processingBreached ? 'bg-red-100 text-red-900' : 'bg-emerald-100 text-emerald-900'}>
                                Processing ≤ {queueSnapshot.queueSla.processingThresholdMinutes}m:
                                {' '}
                                {formatAgeMinutes(queueSnapshot.queueSla.processingAgeMinutes)}
                            </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Oldest pending: {formatDateTime(queueSnapshot.queueSla.oldestPendingAt)} •{' '}
                            Oldest processing: {formatDateTime(queueSnapshot.queueSla.oldestProcessingAt)}
                        </p>
                    </div>

                    {queueSnapshot.failedByType.length > 0 && (
                        <div className="rounded border p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">Failed Jobs by Type</p>
                                <Link href={`/dashboard/queue?domainId=${id}&preset=failures`} className="text-xs text-blue-600 hover:underline">
                                    Open all failures
                                </Link>
                            </div>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                                {queueSnapshot.failedByType.slice(0, 10).map((row) => (
                                    <div key={row.jobType} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
                                        <div>
                                            <p className="font-mono">{row.jobType}</p>
                                            <p className="text-muted-foreground">{row.count} failed</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Link
                                                href={`/dashboard/queue?domainId=${id}&preset=failures&jobTypes=${encodeURIComponent(row.jobType)}`}
                                                className="text-blue-600 hover:underline"
                                            >
                                                View
                                            </Link>
                                            <form action={retryDomainLatestFailedJobByTypeAction}>
                                                <input type="hidden" name="domainId" value={id} />
                                                <input type="hidden" name="jobType" value={row.jobType} />
                                                <Button type="submit" size="sm" variant="outline">
                                                    Retry Latest
                                                </Button>
                                            </form>
                                            <form action={retryDomainFailedJobsByTypeAction}>
                                                <input type="hidden" name="domainId" value={id} />
                                                <input type="hidden" name="jobType" value={row.jobType} />
                                                <Button type="submit" size="sm" variant="outline">
                                                    Retry All
                                                </Button>
                                            </form>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {queueSnapshot.recentJobs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No queue jobs yet for this domain.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {queueSnapshot.recentJobs.map((job) => (
                                <div key={job.id} className="rounded border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs">{job.id.slice(0, 8)}</span>
                                            <Badge variant="outline" className="font-mono text-[11px]">
                                                {job.jobType}
                                            </Badge>
                                            <Badge className={queueStatusClasses[job.status || 'pending'] || 'bg-slate-100 text-slate-900'}>
                                                {job.status || 'pending'}
                                            </Badge>
                                        </div>
                                        <Link
                                            href={`/dashboard/queue?domainId=${id}&q=${encodeURIComponent(job.id)}`}
                                            className="text-xs text-blue-600 hover:underline"
                                        >
                                            Open
                                        </Link>
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Created {formatDateTime(job.createdAt)} • Attempts {job.attempts ?? 0}/{job.maxAttempts ?? 0}
                                    </p>
                                    {job.articleId && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Article: {job.articleTitle || job.articleId}
                                        </p>
                                    )}
                                    {job.errorMessage && (
                                        <p className="mt-1 line-clamp-2 text-xs text-red-600">{job.errorMessage}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Domain Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="h-5 w-5" />
                            Domain Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">TLD</p>
                                <p className="font-medium">.{domain.tld}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Registrar</p>
                                <p className="font-medium capitalize">{domain.registrar}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Bucket</p>
                                <Badge variant="outline" className="capitalize">{domain.bucket}</Badge>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Lifecycle</p>
                                <Badge variant="outline" className="capitalize">{domain.lifecycleState || 'sourced'}</Badge>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Template</p>
                                <p className="font-medium capitalize">{domain.siteTemplate || 'Not set'}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Theme Style</p>
                                <p className="font-medium">{domain.themeStyle || 'Not set'}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Host Shard</p>
                                <p className="font-medium">{domain.cloudflareAccount || 'Auto (deterministic)'}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Niche</p>
                                <p className="font-medium capitalize">{domain.niche || 'Not set'}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Sub-Niche</p>
                                <p className="font-medium capitalize">{domain.subNiche || 'Not set'}</p>
                            </div>
                        </div>

                        {domain.tags && domain.tags.length > 0 && (
                            <div>
                                <p className="mb-2 text-sm font-medium text-muted-foreground">Tags</p>
                                <div className="flex flex-wrap gap-2">
                                    {domain.tags.map((tag) => (
                                        <Badge key={tag} variant="secondary">{tag}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {domain.notes && (
                            <div>
                                <p className="mb-1 text-sm font-medium text-muted-foreground">Notes</p>
                                <p className="text-sm whitespace-pre-wrap">{domain.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Financial Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Financial & Dates
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Purchase Date</p>
                                <p className="font-medium">
                                    {domain.purchaseDate
                                        ? new Date(domain.purchaseDate).toLocaleDateString()
                                        : 'Not set'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Purchase Price</p>
                                <p className="font-medium">
                                    {domain.purchasePrice ? `$${Number(domain.purchasePrice).toFixed(2)}` : 'Not set'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Renewal Date</p>
                                <p className="font-medium">
                                    {domain.renewalDate
                                        ? new Date(domain.renewalDate).toLocaleDateString()
                                        : 'Not set'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Renewal Price</p>
                                <p className="font-medium">
                                    {domain.renewalPrice ? `$${Number(domain.renewalPrice).toFixed(2)}` : 'Not set'}
                                </p>
                            </div>
                        </div>

                        {(domain.estimatedFlipValueLow || domain.estimatedMonthlyRevenueLow) && (
                            <div className="mt-4 border-t pt-4">
                                <p className="mb-3 text-sm font-medium">Valuation Estimates</p>
                                <div className="grid grid-cols-2 gap-4">
                                    {domain.estimatedFlipValueLow && (
                                        <div>
                                            <p className="text-sm text-muted-foreground">Flip Value</p>
                                            <p className="font-medium">
                                                ${domain.estimatedFlipValueLow.toLocaleString()} - ${domain.estimatedFlipValueHigh?.toLocaleString() || '?'}
                                            </p>
                                        </div>
                                    )}
                                    {domain.estimatedMonthlyRevenueLow && (
                                        <div>
                                            <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                                            <p className="font-medium">
                                                ${domain.estimatedMonthlyRevenueLow.toLocaleString()} - ${domain.estimatedMonthlyRevenueHigh?.toLocaleString() || '?'}/mo
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Content Type Configuration */}
            <ContentTypeConfig
                domainId={id}
                currentMix={(domain.contentConfig as Record<string, unknown>)?.contentTypeMix as Record<string, number> | null ?? null}
            />

            <DomainWorkflowConfig
                domainId={id}
                themeStyle={domain.themeStyle ?? null}
                currentConfig={domain.contentConfig ?? null}
            />

            <DomainLifecycleControls domainId={id} />

            <DomainOwnershipOperationsConfig domainId={id} />

            <DomainChannelCompatibilityConfig domainId={id} />

            {/* Recent Articles */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Recent Articles</CardTitle>
                        <CardDescription>Content generated for this domain</CardDescription>
                    </div>
                    <Button size="sm">
                        Generate Article
                    </Button>
                </CardHeader>
                <CardContent>
                    {recentArticles.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-muted-foreground">No articles yet.</p>
                            <Button variant="link">Generate your first article</Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recentArticles.map((article) => (
                                <div
                                    key={article.id}
                                    className="flex items-center justify-between rounded-lg border p-3"
                                >
                                    <div>
                                        <p className="font-medium">{article.title}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {article.wordCount || 0} words • {article.createdAt && new Date(article.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="capitalize">{article.status}</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <Trash2 className="h-5 w-5" />
                        Danger Zone
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-4 text-sm text-muted-foreground">
                        Deleting this domain will also delete all associated articles, keywords, and analytics data.
                        This action cannot be undone.
                    </p>
                    <Button variant="destructive">
                        Delete Domain
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
