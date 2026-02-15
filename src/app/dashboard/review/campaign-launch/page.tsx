import Link from 'next/link';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { domainResearch, promotionCampaigns, reviewTasks, users } from '@/lib/db/schema';
import { assignReviewTask } from '@/lib/review/task-assignment';
import { decideReviewTask } from '@/lib/review/task-decision';

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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Campaign Launch Review Queue</h1>
                    <p className="text-sm text-muted-foreground">Approval gate for campaign launch handoff</p>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="/api/review/tasks/campaign-launch/summary?format=csv&limit=1000"
                        className="px-3 py-2 rounded-md border text-sm hover:bg-muted"
                    >
                        Export SLA CSV
                    </a>
                    <Link href="/dashboard/review" className="text-sm text-primary hover:underline">
                        Back to review hub
                    </Link>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Link href={scopePath('mine')} className={`px-2 py-1 rounded border text-xs ${scope === 'mine' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                    Mine
                </Link>
                <Link href={scopePath('unassigned')} className={`px-2 py-1 rounded border text-xs ${scope === 'unassigned' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                    Unassigned
                </Link>
                {canManageAssignments ? (
                    <Link href={scopePath('all')} className={`px-2 py-1 rounded border text-xs ${scope === 'all' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                        All
                    </Link>
                ) : null}
            </div>

            {params.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {params.error}
                </div>
            )}
            {messageText && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {messageText}
                </div>
            )}

            {queueItems.length === 0 ? (
                <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
                    No pending campaign-launch review tasks in this scope.
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
                            <div key={item.taskId} className="rounded-lg border bg-card p-4 space-y-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <div className="text-lg font-semibold">{item.domain}</div>
                                        <div className="text-xs text-muted-foreground">
                                            Campaign {item.campaignId.slice(0, 8)} | Status {item.campaignStatus || 'unknown'} | Channels {item.channels.length > 0 ? item.channels.join(', ') : 'none'}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            Assignee {assigneeLabel}
                                        </div>
                                    </div>
                                    <div className={`text-xs font-medium px-2 py-1 rounded-full w-fit ${timing.status === 'escalated'
                                        ? 'bg-red-100 text-red-700'
                                        : timing.status === 'warning'
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-blue-100 text-blue-700'
                                        }`}>
                                        {timing.status === 'escalated'
                                            ? `Escalated (${Math.abs(timing.hoursToEscalation).toFixed(1)}h overdue)`
                                            : timing.status === 'warning'
                                                ? `SLA breached (${Math.abs(timing.hoursToSla).toFixed(1)}h overdue)`
                                                : `SLA ${timing.hoursToSla.toFixed(1)}h left`}
                                    </div>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Created {formatDateTime(item.createdAt)} | Due {formatDateTime(dueAt)} | Escalate {formatDateTime(escalateAt)}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <form action={assignTaskAction} className="flex items-center gap-2">
                                        <input type="hidden" name="taskId" value={item.taskId} />
                                        <input type="hidden" name="scope" value={scope} />
                                        <input type="hidden" name="mode" value="claim" />
                                        <button
                                            type="submit"
                                            disabled={!canClaim}
                                            className="h-9 px-3 rounded-md border text-sm hover:bg-muted disabled:opacity-50"
                                        >
                                            Claim
                                        </button>
                                    </form>
                                    <form action={assignTaskAction} className="flex items-center gap-2">
                                        <input type="hidden" name="taskId" value={item.taskId} />
                                        <input type="hidden" name="scope" value={scope} />
                                        <input type="hidden" name="mode" value="release" />
                                        <button
                                            type="submit"
                                            disabled={!canRelease}
                                            className="h-9 px-3 rounded-md border text-sm hover:bg-muted disabled:opacity-50"
                                        >
                                            Release
                                        </button>
                                    </form>

                                    {canManageAssignments ? (
                                        <form action={assignTaskAction} className="flex items-center gap-2">
                                            <input type="hidden" name="taskId" value={item.taskId} />
                                            <input type="hidden" name="scope" value={scope} />
                                            <input type="hidden" name="mode" value="set" />
                                            <select
                                                name="reviewerId"
                                                defaultValue={item.reviewerId || ''}
                                                className="h-9 rounded-md border px-2 text-xs"
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
                                                className="h-9 px-3 rounded-md border text-sm hover:bg-muted"
                                            >
                                                Set Assignee
                                            </button>
                                        </form>
                                    ) : null}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <form action={approveTaskAction} className="flex items-center gap-2">
                                        <input type="hidden" name="taskId" value={item.taskId} />
                                        <input type="hidden" name="scope" value={scope} />
                                        <input
                                            type="text"
                                            name="reviewNotes"
                                            placeholder="Approval note (optional)"
                                            className="h-9 rounded-md border px-2 text-xs w-52"
                                        />
                                        <button
                                            type="submit"
                                            className="h-9 px-3 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                                        >
                                            Approve
                                        </button>
                                    </form>
                                    <form action={rejectTaskAction} className="flex items-center gap-2">
                                        <input type="hidden" name="taskId" value={item.taskId} />
                                        <input type="hidden" name="scope" value={scope} />
                                        <input
                                            type="text"
                                            name="reviewNotes"
                                            placeholder="Rejection note (optional)"
                                            className="h-9 rounded-md border px-2 text-xs w-52"
                                        />
                                        <button
                                            type="submit"
                                            className="h-9 px-3 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
                                        >
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
