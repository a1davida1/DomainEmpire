import Link from 'next/link';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { domainResearch, previewBuilds, reviewTasks } from '@/lib/db/schema';
import { decideReviewTask } from '@/lib/review/task-decision';

type QueueItem = {
    taskId: string;
    domainResearchId: string | null;
    domain: string;
    listingSource: string | null;
    currentBid: number | null;
    buyNowPrice: number | null;
    recommendedMaxBid: number | null;
    confidenceScore: number | null;
    demandScore: number | null;
    compsScore: number | null;
    tmRiskScore: number | null;
    historyRiskScore: number | null;
    backlinkRiskScore: number | null;
    hardFailReason: string | null;
    decisionReason: string | null;
    createdAt: Date | null;
    slaHours: number;
    escalateAfterHours: number;
};

type TimingStatus = 'normal' | 'warning' | 'escalated';

function formatMoney(value: number | null): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '-';
    }
    return `$${value.toFixed(2)}`;
}

function getTiming(item: QueueItem): { status: TimingStatus; elapsedHours: number; hoursToSla: number; hoursToEscalation: number } {
    const createdAt = item.createdAt ? new Date(item.createdAt) : new Date();
    const elapsedHours = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
    const hoursToSla = item.slaHours - elapsedHours;
    const hoursToEscalation = item.escalateAfterHours - elapsedHours;
    if (hoursToEscalation <= 0) {
        return { status: 'escalated', elapsedHours, hoursToSla, hoursToEscalation };
    }
    if (hoursToSla <= 0) {
        return { status: 'warning', elapsedHours, hoursToSla, hoursToEscalation };
    }
    return { status: 'normal', elapsedHours, hoursToSla, hoursToEscalation };
}

async function approveTaskAction(formData: FormData) {
    'use server';
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }
    if (!['admin', 'reviewer', 'expert'].includes(user.role)) {
        redirect('/dashboard/review/domain-buy?error=forbidden');
    }

    const taskId = String(formData.get('taskId') || '');
    const notesInput = String(formData.get('reviewNotes') || '').trim();
    const reviewNotes = notesInput.length >= 8 ? notesInput : 'Approved from domain-buy review queue';

    try {
        await decideReviewTask({
            taskId,
            status: 'approved',
            reviewNotes,
            checklistPatch: {
                underwritingReviewed: true,
                tmCheckPassed: true,
                budgetCheckPassed: true,
            },
            actor: {
                id: user.id,
                role: user.role,
            },
        });
        revalidatePath('/dashboard/review/domain-buy');
        redirect('/dashboard/review/domain-buy?message=approved');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to approve';
        redirect(`/dashboard/review/domain-buy?error=${encodeURIComponent(message)}`);
    }
}

async function rejectTaskAction(formData: FormData) {
    'use server';
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }
    if (!['admin', 'reviewer', 'expert'].includes(user.role)) {
        redirect('/dashboard/review/domain-buy?error=forbidden');
    }

    const taskId = String(formData.get('taskId') || '');
    const notesInput = String(formData.get('reviewNotes') || '').trim();
    const reviewNotes = notesInput.length >= 8 ? notesInput : 'Rejected from domain-buy review queue';

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
        revalidatePath('/dashboard/review/domain-buy');
        redirect('/dashboard/review/domain-buy?message=rejected');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reject';
        redirect(`/dashboard/review/domain-buy?error=${encodeURIComponent(message)}`);
    }
}

export default async function DomainBuyReviewPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; message?: string }>;
}) {
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }
    if (!['admin', 'reviewer', 'expert', 'editor'].includes(user.role)) {
        redirect('/dashboard');
    }

    const params = await searchParams;

    const rows = await db
        .select({
            taskId: reviewTasks.id,
            domainResearchId: reviewTasks.domainResearchId,
            domain: domainResearch.domain,
            listingSource: domainResearch.listingSource,
            currentBid: domainResearch.currentBid,
            buyNowPrice: domainResearch.buyNowPrice,
            recommendedMaxBid: domainResearch.recommendedMaxBid,
            confidenceScore: domainResearch.confidenceScore,
            demandScore: domainResearch.demandScore,
            compsScore: domainResearch.compsScore,
            tmRiskScore: domainResearch.tmRiskScore,
            historyRiskScore: domainResearch.historyRiskScore,
            backlinkRiskScore: domainResearch.backlinkRiskScore,
            hardFailReason: domainResearch.hardFailReason,
            decisionReason: domainResearch.decisionReason,
            createdAt: reviewTasks.createdAt,
            slaHours: reviewTasks.slaHours,
            escalateAfterHours: reviewTasks.escalateAfterHours,
        })
        .from(reviewTasks)
        .leftJoin(domainResearch, eq(reviewTasks.domainResearchId, domainResearch.id))
        .where(and(
            eq(reviewTasks.taskType, 'domain_buy'),
            eq(reviewTasks.status, 'pending'),
        ))
        .orderBy(asc(reviewTasks.createdAt))
        .limit(100);

    const reviewRows: QueueItem[] = rows
        .filter((row) => typeof row.domain === 'string' && row.domain.length > 0)
        .map((row) => ({
            taskId: row.taskId,
            domainResearchId: row.domainResearchId,
            domain: row.domain as string,
            listingSource: row.listingSource,
            currentBid: row.currentBid,
            buyNowPrice: row.buyNowPrice,
            recommendedMaxBid: row.recommendedMaxBid,
            confidenceScore: row.confidenceScore,
            demandScore: row.demandScore,
            compsScore: row.compsScore,
            tmRiskScore: row.tmRiskScore,
            historyRiskScore: row.historyRiskScore,
            backlinkRiskScore: row.backlinkRiskScore,
            hardFailReason: row.hardFailReason,
            decisionReason: row.decisionReason,
            createdAt: row.createdAt,
            slaHours: row.slaHours ?? 24,
            escalateAfterHours: row.escalateAfterHours ?? 48,
        }));

    const researchIds = reviewRows
        .map((row) => row.domainResearchId)
        .filter((id): id is string => Boolean(id));

    const previewRows = researchIds.length > 0
        ? await db
            .select({
                id: previewBuilds.id,
                domainResearchId: previewBuilds.domainResearchId,
                previewUrl: previewBuilds.previewUrl,
                buildStatus: previewBuilds.buildStatus,
                expiresAt: previewBuilds.expiresAt,
                createdAt: previewBuilds.createdAt,
            })
            .from(previewBuilds)
            .where(and(
                inArray(previewBuilds.domainResearchId, researchIds),
                inArray(previewBuilds.buildStatus, ['ready', 'building', 'queued']),
            ))
            .orderBy(desc(previewBuilds.createdAt))
        : [];

    const previewByResearchId = new Map<string, (typeof previewRows)[number]>();
    for (const preview of previewRows) {
        if (!preview.domainResearchId) continue;
        if (!previewByResearchId.has(preview.domainResearchId)) {
            previewByResearchId.set(preview.domainResearchId, preview);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Domain Buy Review Queue</h1>
                    <p className="text-sm text-muted-foreground">Human approval gate for acquisition decisions</p>
                </div>
                <Link href="/dashboard/review" className="text-sm text-primary hover:underline">
                    Back to content review
                </Link>
            </div>

            {params.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {params.error}
                </div>
            )}
            {params.message && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    Task {params.message}
                </div>
            )}

            {reviewRows.length === 0 ? (
                <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
                    No pending domain-buy review tasks.
                </div>
            ) : (
                <div className="space-y-4">
                    {reviewRows.map((item) => {
                        const preview = item.domainResearchId ? previewByResearchId.get(item.domainResearchId) : undefined;
                        const previewUrl = preview?.previewUrl || (item.domainResearchId ? `/dashboard/review/domain-buy/${item.domainResearchId}/preview` : null);
                        const timing = getTiming(item);

                        return (
                            <div key={item.taskId} className="rounded-lg border bg-card p-4 space-y-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <div className="text-lg font-semibold">{item.domain}</div>
                                        <div className="text-xs text-muted-foreground">
                                            Source: {item.listingSource || 'unknown'} | Confidence: {typeof item.confidenceScore === 'number' ? `${item.confidenceScore.toFixed(1)}%` : '-'}
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

                                <div className="grid gap-3 md:grid-cols-4 text-sm">
                                    <div className="rounded border bg-muted/20 p-3">
                                        <div className="text-xs text-muted-foreground">Current Bid</div>
                                        <div className="font-semibold">{formatMoney(item.currentBid)}</div>
                                    </div>
                                    <div className="rounded border bg-muted/20 p-3">
                                        <div className="text-xs text-muted-foreground">Buy Now</div>
                                        <div className="font-semibold">{formatMoney(item.buyNowPrice)}</div>
                                    </div>
                                    <div className="rounded border bg-muted/20 p-3">
                                        <div className="text-xs text-muted-foreground">Recommended Max Bid</div>
                                        <div className="font-semibold">{formatMoney(item.recommendedMaxBid)}</div>
                                    </div>
                                    <div className="rounded border bg-muted/20 p-3">
                                        <div className="text-xs text-muted-foreground">Risk Snapshot</div>
                                        <div className="font-semibold">
                                            TM {item.tmRiskScore?.toFixed(0) ?? '-'} | Hist {item.historyRiskScore?.toFixed(0) ?? '-'} | BL {item.backlinkRiskScore?.toFixed(0) ?? '-'}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Demand {item.demandScore?.toFixed(1) ?? '-'} / Comps {item.compsScore?.toFixed(1) ?? '-'}
                                    {item.hardFailReason ? ` | Hard fail: ${item.hardFailReason}` : ''}
                                    {item.decisionReason ? ` | Decision note: ${item.decisionReason}` : ''}
                                </div>

                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="text-xs text-muted-foreground">
                                        Preview: {preview?.buildStatus || 'ready'}
                                        {preview?.expiresAt ? ` | Expires ${new Date(preview.expiresAt).toLocaleString()}` : ''}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {previewUrl && (
                                            <Link
                                                href={previewUrl}
                                                className="px-3 py-2 rounded-md border text-sm hover:bg-muted"
                                            >
                                                Open Preview
                                            </Link>
                                        )}
                                        <form action={approveTaskAction} className="flex items-center gap-2">
                                            <input type="hidden" name="taskId" value={item.taskId} />
                                            <input
                                                type="text"
                                                name="reviewNotes"
                                                placeholder="Approval note (optional)"
                                                className="h-9 rounded-md border px-2 text-xs w-48"
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
                                            <input
                                                type="text"
                                                name="reviewNotes"
                                                placeholder="Rejection note (optional)"
                                                className="h-9 rounded-md border px-2 text-xs w-48"
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
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
