import Link from 'next/link';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { domainResearch, promotionCampaigns, reviewTasks, users } from '@/lib/db/schema';
import { assignReviewTask } from '@/lib/review/task-assignment';
import { decideReviewTask } from '@/lib/review/task-decision';
import { Rocket, ChevronLeft, CheckCircle2, XCircle, AlertTriangle, User, Clock, Download } from 'lucide-react';

type QueueScope = 'all' | 'mine' | 'unassigned';

type QueueItem = {
    taskId: string;
    campaignId: string;
    domain: string;
    campaignStatus: string | null;
    channels: string[];
    reviewerId: string | null;
    createdAt: Date | null;
    slaHours: number;
    escalateAfterHours: number;
};

type TimingStatus = 'normal' | 'warning' | 'escalated';

function parseScope(raw: string | undefined | null): QueueScope {
    if (raw === 'all' || raw === 'mine' || raw === 'unassigned') {
        return raw;
    }
    return 'mine';
}

function scopePath(scope: QueueScope, extras?: Record<string, string | null>): string {
    const params = new URLSearchParams();
    params.set('scope', scope);
    if (extras) {
        for (const [key, value] of Object.entries(extras)) {
            if (value) {
                params.set(key, value);
            }
        }
    }
    const encoded = params.toString();
    return encoded.length > 0
        ? `/dashboard/review/campaign-launch?${encoded}`
        : '/dashboard/review/campaign-launch';
}

function getTiming(item: QueueItem): {
    status: TimingStatus;
    hoursToSla: number;
    hoursToEscalation: number;
} {
    const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();
    const elapsedHours = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
    const hoursToSla = item.slaHours - elapsedHours;
    const hoursToEscalation = item.escalateAfterHours - elapsedHours;
    if (hoursToEscalation <= 0) {
        return { status: 'escalated', hoursToSla, hoursToEscalation };
    }
    if (hoursToSla <= 0) {
        return { status: 'warning', hoursToSla, hoursToEscalation };
    }
    return { status: 'normal', hoursToSla, hoursToEscalation };
}

function formatDateTime(value: Date | null): string {
    if (!value) return '-';
    if (Number.isNaN(value.getTime())) return '-';
    return value.toLocaleString();
}

async function assignTaskAction(formData: FormData) {
    'use server';
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }
    if (!['admin', 'reviewer', 'expert'].includes(user.role)) {
        redirect('/dashboard/review/campaign-launch?error=forbidden');
    }

    const scope = parseScope(String(formData.get('scope') || 'mine'));
    const taskId = String(formData.get('taskId') || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
        redirect(scopePath(scope, { error: 'Invalid task ID' }));
    }

    const modeRaw = String(formData.get('mode') || '');
    const reviewerIdRaw = String(formData.get('reviewerId') || '').trim();
    const reason = String(formData.get('reason') || '').trim();

    const mode = modeRaw === 'claim' || modeRaw === 'release' || modeRaw === 'set'
        ? modeRaw
        : null;
    if (!mode) {
        redirect(scopePath(scope, { error: 'Invalid assignment mode' }));
    }

    const reviewerId = mode === 'set'
        ? (reviewerIdRaw.length > 0 ? reviewerIdRaw : null)
        : undefined;

    try {
        const result = await assignReviewTask({
            taskId,
            mode,
            reviewerId,
            reason: reason.length > 0 ? reason : undefined,
            actor: {
                id: user.id,
                role: user.role,
            },
        });
        revalidatePath('/dashboard/review/campaign-launch');
        redirect(scopePath(scope, { message: result.changed ? 'assigned:changed' : 'assigned:noop' }));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update assignment';
        redirect(scopePath(scope, { error: message }));
    }
}

async function approveTaskAction(formData: FormData) {
    'use server';
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }
    if (!['admin', 'reviewer', 'expert'].includes(user.role)) {
        redirect('/dashboard/review/campaign-launch?error=forbidden');
    }

    const scope = parseScope(String(formData.get('scope') || 'mine'));
    const taskId = String(formData.get('taskId') || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
        redirect(scopePath(scope, { error: 'Invalid task ID' }));
    }
    const notesInput = String(formData.get('reviewNotes') || '').trim();
    const reviewNotes = notesInput.length >= 8 ? notesInput : 'Approved from campaign-launch review queue';

    try {
        const result = await decideReviewTask({
            taskId,
            status: 'approved',
            reviewNotes,
            actor: {
                id: user.id,
                role: user.role,
            },
        });
        revalidatePath('/dashboard/review/campaign-launch');
        const queued = result.campaignLaunchQueued ? 'queued' : 'not_queued';
        redirect(scopePath(scope, { message: `approved:${queued}` }));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to approve';
        redirect(scopePath(scope, { error: message }));
    }
}

async function rejectTaskAction(formData: FormData) {
    'use server';
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }
    if (!['admin', 'reviewer', 'expert'].includes(user.role)) {
        redirect('/dashboard/review/campaign-launch?error=forbidden');
    }

    const scope = parseScope(String(formData.get('scope') || 'mine'));
    const taskId = String(formData.get('taskId') || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
        redirect(scopePath(scope, { error: 'Invalid task ID' }));
    }
    const notesInput = String(formData.get('reviewNotes') || '').trim();
    const reviewNotes = notesInput.length >= 8 ? notesInput : 'Rejected from campaign-launch review queue';

    try {
        await decideReviewTask({
            taskId,
            status: 'rejected',
            reviewNotes,
            actor: {
                id: user.id,
                role: user.role,
            },
        });
        revalidatePath('/dashboard/review/campaign-launch');
        redirect(scopePath(scope, { message: 'rejected' }));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reject';
        redirect(scopePath(scope, { error: message }));
    }
}

export default async function CampaignLaunchReviewPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string; scope?: string }>;
}) {
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }
    if (!['admin', 'reviewer', 'expert', 'editor'].includes(user.role)) {
        redirect('/dashboard');
    }

    const params = await searchParams;
    const canManageAssignments = user.role === 'admin' || user.role === 'expert';
    const requestedScope = parseScope(params.scope);
    const scope: QueueScope = canManageAssignments
        ? requestedScope
        : (requestedScope === 'all' ? 'mine' : requestedScope);

    const conditions: Array<ReturnType<typeof eq> | ReturnType<typeof isNull>> = [
        eq(reviewTasks.taskType, 'campaign_launch'),
        eq(reviewTasks.status, 'pending'),
    ];
    if (scope === 'mine') {
        conditions.push(eq(reviewTasks.reviewerId, user.id));
    } else if (scope === 'unassigned') {
        conditions.push(isNull(reviewTasks.reviewerId));
    }

    const rows = await db
        .select({
            taskId: reviewTasks.id,
            campaignId: reviewTasks.entityId,
            createdAt: reviewTasks.createdAt,
            slaHours: reviewTasks.slaHours,
            escalateAfterHours: reviewTasks.escalateAfterHours,
            reviewerId: reviewTasks.reviewerId,
            domain: domainResearch.domain,
            campaignStatus: promotionCampaigns.status,
            channels: promotionCampaigns.channels,
        })
        .from(reviewTasks)
        .leftJoin(promotionCampaigns, eq(reviewTasks.entityId, promotionCampaigns.id))
        .leftJoin(domainResearch, eq(promotionCampaigns.domainResearchId, domainResearch.id))
        .where(and(...conditions))
        .orderBy(asc(reviewTasks.createdAt))
        .limit(200);

    const reviewerOptions = await db
        .select({
            id: users.id,
            name: users.name,
            role: users.role,
        })
        .from(users)
        .where(and(
            eq(users.isActive, true),
            inArray(users.role, ['reviewer', 'expert', 'admin']),
        ))
        .orderBy(asc(users.name));

    const reviewerLabelById = new Map(
        reviewerOptions.map((reviewer) => [
            reviewer.id,
            `${reviewer.name} (${reviewer.role})`,
        ]),
    );

    const queueItems: QueueItem[] = rows.map((row) => ({
        taskId: row.taskId,
        campaignId: row.campaignId,
        domain: (row.domain && row.domain.trim().length > 0) ? row.domain : `campaign:${row.campaignId.slice(0, 8)}`,
        campaignStatus: row.campaignStatus,
        channels: Array.isArray(row.channels) ? row.channels : [],
        reviewerId: row.reviewerId ?? null,
        createdAt: row.createdAt ?? null,
        slaHours: row.slaHours ?? 24,
        escalateAfterHours: row.escalateAfterHours ?? 48,
    }));

    const messageText = (() => {
        if (!params.message) return null;
        if (params.message === 'rejected') return 'Task rejected.';
        if (params.message === 'assigned:changed') return 'Assignment updated.';
        if (params.message === 'assigned:noop') return 'Assignment unchanged.';
        if (params.message.startsWith('approved:queued')) return 'Task approved. Launch handoff queued.';
        if (params.message.startsWith('approved:not_queued')) return 'Task approved. Launch queue already had a pending job.';
        if (params.message.startsWith('approved:')) return 'Task approved.';
        return params.message;
    })();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950">
                        <Rocket className="h-5 w-5 text-violet-700 dark:text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Campaign Launch Review</h1>
                        <p className="text-sm text-muted-foreground">
                            {queueItems.length} pending &middot; Approval gate for launch handoff
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <a
                        href="/api/review/tasks/campaign-launch/summary?format=csv&limit=1000"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-muted transition-colors"
                    >
                        <Download className="h-3 w-3" />
                        Export CSV
                    </a>
                    <Link
                        href="/dashboard/review"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Review Center
                    </Link>
                </div>
            </div>

            {/* Scope Tabs */}
            <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
                <Link href={scopePath('mine')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scope === 'mine' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    My Tasks
                </Link>
                <Link href={scopePath('unassigned')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scope === 'unassigned' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    Unassigned
                </Link>
                {canManageAssignments ? (
                    <Link href={scopePath('all')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${scope === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                        All
                    </Link>
                ) : null}
            </div>

            {params.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {params.error}
                </div>
            )}
            {messageText && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {messageText}
                </div>
            )}

            {queueItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 py-16 px-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                        <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="text-base font-medium mb-1">No pending launches</p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        Campaign launch review tasks will appear here when campaigns are ready for handoff approval.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {queueItems.map((item) => {
                        const timing = getTiming(item);
                        const dueAt = item.createdAt
                            ? new Date(item.createdAt.getTime() + item.slaHours * 60 * 60 * 1000)
                            : null;
                        const escalateAt = item.createdAt
                            ? new Date(item.createdAt.getTime() + item.escalateAfterHours * 60 * 60 * 1000)
                            : null;
                        const assigneeLabel = item.reviewerId
                            ? reviewerLabelById.get(item.reviewerId) || item.reviewerId
                            : 'Unassigned';
                        const canClaim = canManageAssignments || !item.reviewerId || item.reviewerId === user.id;
                        const canRelease = canManageAssignments || item.reviewerId === user.id;

                        return (
                            <div key={item.taskId} className="rounded-xl border bg-card overflow-hidden">
                                {/* Card Header */}
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b px-5 py-3 bg-muted/20">
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold">{item.domain}</span>
                                        {item.channels.length > 0 && (
                                            <div className="flex items-center gap-1">
                                                {item.channels.map((ch) => (
                                                    <span key={ch} className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border bg-card text-muted-foreground">
                                                        {ch}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {item.campaignStatus || 'unknown'}
                                        </span>
                                    </div>
                                    <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full w-fit ${timing.status === 'escalated'
                                        ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                                        : timing.status === 'warning'
                                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                                        }`}>
                                        {timing.status !== 'normal' && <AlertTriangle className="h-3 w-3" />}
                                        {timing.status === 'escalated'
                                            ? `Escalated (${Math.abs(timing.hoursToEscalation).toFixed(1)}h overdue)`
                                            : timing.status === 'warning'
                                                ? `SLA breached (${Math.abs(timing.hoursToSla).toFixed(1)}h overdue)`
                                                : `${timing.hoursToSla.toFixed(1)}h until SLA`}
                                    </div>
                                </div>

                                {/* Card Body */}
                                <div className="px-5 py-4 space-y-4">
                                    {/* Meta info */}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                            <User className="h-3 w-3" />
                                            {assigneeLabel}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            Created {formatDateTime(item.createdAt)}
                                        </span>
                                        {dueAt && (
                                            <span>Due {formatDateTime(dueAt)}</span>
                                        )}
                                        {escalateAt && (
                                            <span>Escalate {formatDateTime(escalateAt)}</span>
                                        )}
                                        <span className="font-mono text-[10px]">{item.campaignId.slice(0, 8)}</span>
                                    </div>

                                    {/* Assignment actions */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <form action={assignTaskAction} className="contents">
                                            <input type="hidden" name="taskId" value={item.taskId} />
                                            <input type="hidden" name="scope" value={scope} />
                                            <input type="hidden" name="mode" value="claim" />
                                            <button
                                                type="submit"
                                                disabled={!canClaim}
                                                className="h-8 px-3 rounded-md border text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                Claim
                                            </button>
                                        </form>
                                        <form action={assignTaskAction} className="contents">
                                            <input type="hidden" name="taskId" value={item.taskId} />
                                            <input type="hidden" name="scope" value={scope} />
                                            <input type="hidden" name="mode" value="release" />
                                            <button
                                                type="submit"
                                                disabled={!canRelease}
                                                className="h-8 px-3 rounded-md border text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                Release
                                            </button>
                                        </form>

                                        {canManageAssignments ? (
                                            <form action={assignTaskAction} className="flex items-center gap-1.5">
                                                <input type="hidden" name="taskId" value={item.taskId} />
                                                <input type="hidden" name="scope" value={scope} />
                                                <input type="hidden" name="mode" value="set" />
                                                <select
                                                    name="reviewerId"
                                                    defaultValue={item.reviewerId || ''}
                                                    className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                                                >
                                                    <option value="">Unassigned</option>
                                                    {reviewerOptions.map((reviewer) => (
                                                        <option key={reviewer.id} value={reviewer.id}>
                                                            {reviewer.name} ({reviewer.role})
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="submit"
                                                    className="h-8 px-3 rounded-md border text-xs font-medium hover:bg-muted transition-colors"
                                                >
                                                    Assign
                                                </button>
                                            </form>
                                        ) : null}
                                    </div>
                                </div>

                                {/* Card Footer — Decision */}
                                <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3 bg-muted/10">
                                    <form action={approveTaskAction} className="flex items-center gap-1.5">
                                        <input type="hidden" name="taskId" value={item.taskId} />
                                        <input type="hidden" name="scope" value={scope} />
                                        <input
                                            type="text"
                                            name="reviewNotes"
                                            placeholder="Note (optional)"
                                            className="h-8 rounded-md border bg-background px-2 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                                        />
                                        <button
                                            type="submit"
                                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                                        >
                                            <CheckCircle2 className="h-3 w-3" />
                                            Approve
                                        </button>
                                    </form>
                                    <form action={rejectTaskAction} className="flex items-center gap-1.5">
                                        <input type="hidden" name="taskId" value={item.taskId} />
                                        <input type="hidden" name="scope" value={scope} />
                                        <input
                                            type="text"
                                            name="reviewNotes"
                                            placeholder="Note (optional)"
                                            className="h-8 rounded-md border bg-background px-2 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                                        />
                                        <button
                                            type="submit"
                                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                        >
                                            <XCircle className="h-3 w-3" />
                                            Reject
                                        </button>
                                    </form>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
