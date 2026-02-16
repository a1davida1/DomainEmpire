import Link from 'next/link';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { domainResearch, previewBuilds, reviewTasks } from '@/lib/db/schema';
import { decideReviewTask } from '@/lib/review/task-decision';
import { ShoppingCart, ExternalLink, CheckCircle2, XCircle, ChevronLeft, Shield, AlertTriangle } from 'lucide-react';

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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
        redirect('/dashboard/review/domain-buy?error=Invalid+task+ID');
    }
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
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to approve';
        redirect(`/dashboard/review/domain-buy?error=${encodeURIComponent(message)}`);
    }
    revalidatePath('/dashboard/review/domain-buy');
    redirect('/dashboard/review/domain-buy?message=approved');
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
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
        redirect('/dashboard/review/domain-buy?error=Invalid+task+ID');
    }
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
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to reject';
        redirect(`/dashboard/review/domain-buy?error=${encodeURIComponent(message)}`);
    }
    revalidatePath('/dashboard/review/domain-buy');
    redirect('/dashboard/review/domain-buy?message=rejected');
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

    function riskColor(score: number | null): string {
        if (score === null || score === undefined) return 'text-muted-foreground';
        if (score >= 70) return 'text-red-600 dark:text-red-400';
        if (score >= 40) return 'text-amber-600 dark:text-amber-400';
        return 'text-emerald-600 dark:text-emerald-400';
    }

    function riskBg(score: number | null): string {
        if (score === null || score === undefined) return 'bg-muted/50';
        if (score >= 70) return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900';
        if (score >= 40) return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900';
        return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900';
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                        <ShoppingCart className="h-5 w-5 text-blue-700 dark:text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Domain Buy Review</h1>
                        <p className="text-sm text-muted-foreground">
                            {reviewRows.length} pending &middot; Human approval gate for acquisitions
                        </p>
                    </div>
                </div>
                <Link
                    href="/dashboard/review"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Back to Review Center
                </Link>
            </div>

            {params.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4 shrink-0" />
                    {params.error}
                </div>
            )}
            {params.message && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Task {params.message}
                </div>
            )}

            {reviewRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 py-16 px-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                        <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <p className="text-base font-medium mb-1">No pending acquisitions</p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        Domain buy review tasks will appear here when the research pipeline flags candidates for human approval.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {reviewRows.map((item) => {
                        const preview = item.domainResearchId ? previewByResearchId.get(item.domainResearchId) : undefined;
                        const previewUrl = preview?.previewUrl || (item.domainResearchId ? `/dashboard/review/domain-buy/${item.domainResearchId}/preview` : null);
                        const timing = getTiming(item);

                        return (
                            <div key={item.taskId} className="rounded-xl border bg-card overflow-hidden">
                                {/* Card Header */}
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b px-5 py-3 bg-muted/20">
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold">{item.domain}</span>
                                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border bg-card">
                                            {item.listingSource || 'unknown'}
                                        </span>
                                        {typeof item.confidenceScore === 'number' && (
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.confidenceScore >= 70
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                                                : item.confidenceScore >= 40
                                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                                                    : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                                            }`}>
                                                {item.confidenceScore.toFixed(0)}% confidence
                                            </span>
                                        )}
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
                                    {/* Pricing Grid */}
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-lg border bg-muted/20 p-3">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Current Bid</div>
                                            <div className="text-lg font-bold tabular-nums">{formatMoney(item.currentBid)}</div>
                                        </div>
                                        <div className="rounded-lg border bg-muted/20 p-3">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Buy Now</div>
                                            <div className="text-lg font-bold tabular-nums">{formatMoney(item.buyNowPrice)}</div>
                                        </div>
                                        <div className="rounded-lg border bg-primary/5 dark:bg-primary/10 border-primary/20 p-3">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Recommended Max</div>
                                            <div className="text-lg font-bold tabular-nums text-primary">{formatMoney(item.recommendedMaxBid)}</div>
                                        </div>
                                    </div>

                                    {/* Risk Scores */}
                                    <div className="flex flex-wrap gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">Risk:</span>
                                        </div>
                                        <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${riskBg(item.tmRiskScore)}`}>
                                            <span className="text-muted-foreground">TM</span>
                                            <span className={riskColor(item.tmRiskScore)}>{item.tmRiskScore?.toFixed(0) ?? '-'}</span>
                                        </div>
                                        <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${riskBg(item.historyRiskScore)}`}>
                                            <span className="text-muted-foreground">History</span>
                                            <span className={riskColor(item.historyRiskScore)}>{item.historyRiskScore?.toFixed(0) ?? '-'}</span>
                                        </div>
                                        <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border ${riskBg(item.backlinkRiskScore)}`}>
                                            <span className="text-muted-foreground">Backlinks</span>
                                            <span className={riskColor(item.backlinkRiskScore)}>{item.backlinkRiskScore?.toFixed(0) ?? '-'}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground px-1">
                                            Demand {item.demandScore?.toFixed(1) ?? '-'} &middot; Comps {item.compsScore?.toFixed(1) ?? '-'}
                                        </span>
                                    </div>

                                    {/* Warnings */}
                                    {item.hardFailReason && (
                                        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                                            <span className="font-medium">Hard fail:</span> {item.hardFailReason}
                                        </div>
                                    )}
                                    {item.decisionReason && (
                                        <p className="text-xs text-muted-foreground">
                                            <span className="font-medium">Decision note:</span> {item.decisionReason}
                                        </p>
                                    )}
                                </div>

                                {/* Card Footer — Actions */}
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t px-5 py-3 bg-muted/10">
                                    <div className="flex items-center gap-3">
                                        {previewUrl && (
                                            <Link
                                                href={previewUrl}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium hover:bg-muted transition-colors"
                                            >
                                                <ExternalLink className="h-3 w-3" />
                                                Preview
                                            </Link>
                                        )}
                                        {preview && (
                                            <span className="text-[10px] text-muted-foreground">
                                                Build: {preview.buildStatus}
                                                {preview?.expiresAt ? ` · Expires ${new Date(preview.expiresAt).toLocaleDateString()}` : ''}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <form action={approveTaskAction} className="flex items-center gap-1.5">
                                            <input type="hidden" name="taskId" value={item.taskId} />
                                            <input
                                                type="text"
                                                name="reviewNotes"
                                                placeholder="Note (optional)"
                                                className="h-8 rounded-md border bg-background px-2 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
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
                                            <input
                                                type="text"
                                                name="reviewNotes"
                                                placeholder="Note (optional)"
                                                className="h-8 rounded-md border bg-background px-2 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
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
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
