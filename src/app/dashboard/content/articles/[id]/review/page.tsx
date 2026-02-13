'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

type ChecklistItem = {
    id: string;
    category: string;
    label: string;
    required: boolean;
};

type QaData = {
    checklist: {
        id: string | null;
        name: string;
        items: ChecklistItem[];
    };
    latestResult: {
        allPassed: boolean;
        results: Record<string, { checked: boolean; notes?: string }>;
        completedAt: string;
    } | null;
};

type ArticleInfo = {
    id: string;
    title: string;
    status: string;
    ymylLevel: string;
    domainId: string;
};

type UserInfo = {
    role: string;
    name: string;
};

const ROLE_HIERARCHY: Record<string, number> = {
    editor: 1,
    reviewer: 2,
    expert: 3,
    admin: 4,
};

const YMYL_COLORS: Record<string, string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
    none: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function ArticleReviewPage() {
    const params = useParams();
    const router = useRouter();
    const articleId = params.id as string;

    const [qaData, setQaData] = useState<QaData | null>(null);
    const [articleInfo, setArticleInfo] = useState<ArticleInfo | null>(null);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
    const toggleItem = (id: string) => {
        setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };
    const [rationale, setRationale] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [qaRes, articleRes, meRes] = await Promise.all([
                    fetch(`/api/articles/${articleId}/qa`),
                    fetch(`/api/articles/${articleId}`),
                    fetch('/api/auth/me')
                ]);

                if (!qaRes.ok) throw new Error(`QA data fetch failed: ${qaRes.statusText}`);
                if (!articleRes.ok) throw new Error(`Article data fetch failed: ${articleRes.statusText}`);
                if (!meRes.ok) throw new Error(`Auth check failed: ${meRes.statusText}`);

                const qaResponse = await qaRes.json();
                const articleResponse = await articleRes.json();
                const meResponse = await meRes.json();

                setQaData(qaResponse as QaData);
                setArticleInfo({
                    id: articleResponse.id,
                    title: articleResponse.title,
                    status: articleResponse.status || 'draft',
                    ymylLevel: articleResponse.ymylLevel || 'none',
                    domainId: articleResponse.domainId,
                });
                if (meResponse) {
                    setUserInfo({ role: meResponse.role, name: meResponse.name });
                }

                // Pre-fill checklist from latest result
                if (qaResponse.latestResult?.results) {
                    const pre: Record<string, boolean> = {};
                    for (const [k, v] of Object.entries(qaResponse.latestResult.results as Record<string, { checked: boolean }>)) {
                        pre[k] = v.checked;
                    }
                    setCheckedItems(pre);
                }
            } catch (err: unknown) {
                console.error('Failed to load review data:', err);
                setActionError(err instanceof Error ? err.message : 'Failed to load page data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [articleId]);

    async function submitQa() {
        if (!qaData) return;
        setSubmitting(true);
        const results: Record<string, { checked: boolean }> = {};
        for (const item of qaData.checklist.items) {
            results[item.id] = { checked: !!checkedItems[item.id] };
        }

        await fetch(`/api/articles/${articleId}/qa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results, templateId: qaData.checklist.id }),
        });

        const res = await fetch(`/api/articles/${articleId}/qa`);
        setQaData(await res.json());
        setSubmitting(false);
    }

    async function transitionStatus(newStatus: string) {
        setSubmitting(true);
        setActionError('');

        const res = await fetch(`/api/articles/${articleId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus, rationale }),
        });

        const data = await res.json();
        if (!res.ok) {
            setActionError(data.error || 'Failed to update status');
            setSubmitting(false);
            return;
        }

        setSubmitting(false);
        router.push('/dashboard/review');
        router.refresh();
    }

    async function expertSignOffAndPublish() {
        setSubmitting(true);
        setActionError('');

        try {
            // Step 1: Check for existing expert sign-off (idempotency)
            const eventsRes = await fetch(`/api/articles/${articleId}/events`);
            if (eventsRes.ok) {
                const events = await eventsRes.json();
                const alreadySigned = events.some((e: { eventType: string }) => e.eventType === 'expert_signed');

                if (!alreadySigned) {
                    // Only POST if not already signed
                    const signoffRes = await fetch(`/api/articles/${articleId}/expert-signoff`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            attestation: rationale || 'Content reviewed and attested as factually accurate',
                        }),
                    });

                    if (!signoffRes.ok) {
                        let errorMessage = 'Expert sign-off failed';
                        try {
                            const data = await signoffRes.json();
                            errorMessage = data.error || errorMessage;
                        } catch (_e) {
                            // Fallback if not JSON
                            const text = await signoffRes.text().catch(() => '');
                            errorMessage = text || signoffRes.statusText || errorMessage;
                        }
                        setActionError(errorMessage);
                        setSubmitting(false);
                        return;
                    }
                }
            }
        } catch (err) {
            console.error('Failed to check for existing sign-off:', err);
            // We continue anyway, the backend is also idempotent
        }

        // Step 2: Now transition to published (canTransition will find the expert_signed event)
        const publishRes = await fetch(`/api/articles/${articleId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'published', rationale }),
        });

        const publishData = await publishRes.json();
        if (!publishRes.ok) {
            setActionError(publishData.error || 'Failed to publish after sign-off');
            setSubmitting(false);
            return;
        }

        setSubmitting(false);
        router.push('/dashboard/review');
        router.refresh();
    }

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    const items = qaData?.checklist.items || [];
    const allRequiredChecked = items
        .filter(i => i.required)
        .every(i => checkedItems[i.id]);

    const userLevel = ROLE_HIERARCHY[userInfo?.role || 'editor'] || 1;
    const canApprove = userLevel >= ROLE_HIERARCHY.reviewer;
    const canPublish = userLevel >= ROLE_HIERARCHY.reviewer;
    const isExpert = userLevel >= ROLE_HIERARCHY.expert;
    const currentStatus = articleInfo?.status || 'draft';
    const ymylLevel = articleInfo?.ymylLevel || 'none';

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center gap-4">
                <Link href={`/dashboard/content/articles/${articleId}`}>
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold">Review Article</h1>
                    {articleInfo && (
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="capitalize">{currentStatus}</Badge>
                            {ymylLevel !== 'none' && (
                                <Badge variant="outline" className={YMYL_COLORS[ymylLevel]}>
                                    <ShieldAlert className="h-3 w-3 mr-1" />
                                    YMYL {ymylLevel}
                                </Badge>
                            )}
                            {userInfo && (
                                <span className="text-xs text-muted-foreground">
                                    Reviewing as <strong className="capitalize">{userInfo.role}</strong>
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* QA Checklist */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">{qaData?.checklist.name || 'QA Checklist'}</h2>

                {qaData?.latestResult && (
                    <div className={`mb-4 p-3 rounded-lg border flex items-center gap-2 text-sm ${qaData.latestResult.allPassed
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                        }`}>
                        {qaData.latestResult.allPassed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        Last QA: {qaData.latestResult.allPassed ? 'All passed' : 'Some items failed'}
                        <span className="text-xs ml-auto">{new Date(qaData.latestResult.completedAt).toLocaleString()}</span>
                    </div>
                )}

                <div className="space-y-2">
                    {items.map(item => (
                        <label
                            key={item.id}
                            htmlFor={`qa-item-${item.id}`}
                            className="flex items-start gap-3 p-2 rounded hover:bg-muted/30 cursor-pointer"
                            aria-label={item.label}
                        >
                            <input
                                id={`qa-item-${item.id}`}
                                type="checkbox"
                                checked={!!checkedItems[item.id]}
                                onChange={() => toggleItem(item.id)}
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-600"
                            />
                            <div className="flex-1">
                                <p className="text-sm font-medium leading-none">{item.label}</p>
                                <p className="text-xs text-muted-foreground mt-1">{item.category}</p>
                            </div>
                        </label>
                    ))}
                </div>

                <div className="mt-4">
                    <Button onClick={submitQa} disabled={submitting} size="sm">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save QA Results
                    </Button>
                </div>
            </div>

            {/* Expert Sign-Off (only for experts/admins on high YMYL) */}
            {(ymylLevel === 'high') && isExpert && currentStatus === 'approved' && (
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-red-600" />
                        Expert Sign-Off Required
                    </h2>
                    <p className="text-sm text-muted-foreground mb-3">
                        This high-YMYL article requires expert sign-off before publishing.
                        By signing, you attest that the content is factually accurate and appropriate.
                    </p>
                    <Button
                        onClick={expertSignOffAndPublish}
                        disabled={submitting}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Sign Off & Publish
                    </Button>
                </div>
            )}

            {/* Status Actions */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Status Actions</h2>

                <div className="space-y-3">
                    <div className="mb-4">
                        <label htmlFor="review-rationale" className="text-sm text-muted-foreground block mb-1">Rationale / Notes</label>
                        <textarea
                            id="review-rationale"
                            className="w-full min-h-[100px] p-3 text-sm rounded-lg border bg-background focus:ring-2 focus:ring-purple-500 outline-none"
                            placeholder="Reason for approval/rejection..."
                            value={rationale}
                            onChange={(e) => setRationale(e.target.value)}
                        />
                    </div>

                    {actionError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {actionError}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {/* Approve: requires reviewer+ and article must be in review */}
                        {canApprove && currentStatus === 'review' && (
                            <Button
                                onClick={() => transitionStatus('approved')}
                                disabled={submitting || !allRequiredChecked}
                                className="bg-emerald-600 hover:bg-emerald-700"
                            >
                                Approve
                            </Button>
                        )}

                        {/* Publish: requires reviewer+ and article must be approved. Exclude experts for high-YMYL (they use expert sign-off). */}
                        {canPublish && currentStatus === 'approved' && !isExpert && ymylLevel !== 'high' && (
                            <Button
                                onClick={() => transitionStatus('published')}
                                disabled={submitting}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                Publish
                            </Button>
                        )}

                        {/* Submit for review: any role, article must be in draft */}
                        {currentStatus === 'draft' && (
                            <Button
                                onClick={() => transitionStatus('review')}
                                disabled={submitting}
                            >
                                Submit for Review
                            </Button>
                        )}

                        {/* Send back to draft: requires reviewer+ */}
                        {canApprove && (currentStatus === 'review' || currentStatus === 'approved') && (
                            <Button
                                onClick={() => transitionStatus('draft')}
                                disabled={submitting}
                                variant="outline"
                            >
                                Send Back to Draft
                            </Button>
                        )}

                        {/* Archive: admin only, article must be published */}
                        {userLevel >= ROLE_HIERARCHY.admin && currentStatus === 'published' && (
                            <Button
                                onClick={() => transitionStatus('archived')}
                                disabled={submitting}
                                variant="destructive"
                            >
                                Archive
                            </Button>
                        )}
                    </div>

                    {!canApprove && currentStatus === 'review' && (
                        <p className="text-xs text-muted-foreground">
                            You need reviewer role or higher to approve articles.
                        </p>
                    )}

                    {canApprove && currentStatus === 'review' && !allRequiredChecked && (
                        <p className="text-xs text-muted-foreground">
                            All required QA checklist items must be checked before approval.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
