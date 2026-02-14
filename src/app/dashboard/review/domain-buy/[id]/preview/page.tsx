import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { acquisitionEvents, domainResearch, previewBuilds, reviewTasks } from '@/lib/db/schema';

function money(value: number | null): string {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return `$${value.toFixed(2)}`;
}

function score(value: number | null): string {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return value.toFixed(1);
}

export default async function DomainBuyPreviewPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }
    if (!['admin', 'reviewer', 'expert', 'editor'].includes(user.role)) {
        redirect('/dashboard');
    }

    const { id } = await params;

    const [candidate] = await db
        .select()
        .from(domainResearch)
        .where(eq(domainResearch.id, id))
        .limit(1);

    if (!candidate) {
        notFound();
    }

    const [task] = await db
        .select()
        .from(reviewTasks)
        .where(and(
            eq(reviewTasks.taskType, 'domain_buy'),
            eq(reviewTasks.domainResearchId, id),
        ))
        .orderBy(desc(reviewTasks.createdAt))
        .limit(1);

    const [preview] = await db
        .select()
        .from(previewBuilds)
        .where(eq(previewBuilds.domainResearchId, id))
        .orderBy(desc(previewBuilds.createdAt))
        .limit(1);

    const events = await db
        .select()
        .from(acquisitionEvents)
        .where(eq(acquisitionEvents.domainResearchId, id))
        .orderBy(desc(acquisitionEvents.createdAt))
        .limit(20);

    const evaluation = (candidate.evaluationResult && typeof candidate.evaluationResult === 'object')
        ? candidate.evaluationResult as Record<string, unknown>
        : null;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Domain Buy Preview</h1>
                    <p className="text-sm text-muted-foreground">{candidate.domain}</p>
                </div>
                <Link href="/dashboard/review/domain-buy" className="text-sm text-primary hover:underline">
                    Back to queue
                </Link>
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-4 text-sm">
                    <div>
                        <div className="text-xs text-muted-foreground">Listing Source</div>
                        <div className="font-semibold">{candidate.listingSource || '-'}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Current Bid</div>
                        <div className="font-semibold">{money(candidate.currentBid)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Buy Now</div>
                        <div className="font-semibold">{money(candidate.buyNowPrice)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Recommended Max Bid</div>
                        <div className="font-semibold">{money(candidate.recommendedMaxBid)}</div>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4 text-sm">
                    <div>
                        <div className="text-xs text-muted-foreground">Confidence</div>
                        <div className="font-semibold">{score(candidate.confidenceScore)}%</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Demand Score</div>
                        <div className="font-semibold">{score(candidate.demandScore)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Comps Score</div>
                        <div className="font-semibold">{score(candidate.compsScore)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Domain Score</div>
                        <div className="font-semibold">{score(candidate.domainScore)}</div>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3 text-sm">
                    <div>
                        <div className="text-xs text-muted-foreground">Trademark Risk</div>
                        <div className="font-semibold">{score(candidate.tmRiskScore)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">History Risk</div>
                        <div className="font-semibold">{score(candidate.historyRiskScore)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-muted-foreground">Backlink Risk</div>
                        <div className="font-semibold">{score(candidate.backlinkRiskScore)}</div>
                    </div>
                </div>

                <div className="text-sm">
                    <span className="text-xs text-muted-foreground">Decision</span>
                    <div className="font-semibold">{candidate.decision ?? 'No decision yet'}</div>
                    <div className="text-muted-foreground">{candidate.decisionReason || 'No decision note yet'}</div>
                </div>

                {candidate.hardFailReason && (
                    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        Hard fail reason: {candidate.hardFailReason}
                    </div>
                )}

                {task && (
                    <div className="rounded border bg-muted/30 px-3 py-2 text-sm">
                        <div className="font-medium">Review Task</div>
                        <div>Status: {task.status}</div>
                        <div>SLA: {task.slaHours}h | Escalate after {task.escalateAfterHours}h</div>
                        <div>Notes: {task.reviewNotes || '-'}</div>
                    </div>
                )}

                {preview && (
                    <div className="rounded border bg-muted/30 px-3 py-2 text-sm">
                        <div className="font-medium">Preview Build</div>
                        <div>Status: {preview.buildStatus}</div>
                        <div>Expires: {preview.expiresAt ? new Date(preview.expiresAt).toLocaleString() : '-'}</div>
                        <div>Log: {preview.buildLog || '-'}</div>
                    </div>
                )}
            </div>

            {evaluation && (
                <div className="rounded-lg border bg-card p-4">
                    <h2 className="text-lg font-semibold mb-3">Evaluation Snapshot</h2>
                    <pre className="max-h-[420px] overflow-auto rounded bg-muted/50 p-3 text-xs">
                        {JSON.stringify(evaluation, null, 2)}
                    </pre>
                </div>
            )}

            <div className="rounded-lg border bg-card p-4">
                <h2 className="text-lg font-semibold mb-3">Recent Acquisition Events</h2>
                {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No events yet.</p>
                ) : (
                    <div className="space-y-2">
                        {events.map((event) => (
                            <div key={event.id} className="rounded border p-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">{event.eventType}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {event.createdAt ? new Date(event.createdAt).toLocaleString() : '-'}
                                    </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    createdBy: {event.createdBy || 'system'}
                                </div>
                                <pre className="mt-1 max-h-36 overflow-auto rounded bg-muted/40 p-2 text-[11px]">
                                    {JSON.stringify(event.payload ?? {}, null, 2)}
                                </pre>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
