'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
        unitTestPassId?: string | null;
        calculationConfigHash?: string | null;
        calculationHarnessVersion?: string | null;
    } | null;
};

type ArticleInfo = {
    id: string;
    title: string;
    status: string;
    ymylLevel: string;
    domainId: string;
    contentType: string;
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
    const [unitTestPassId, setUnitTestPassId] = useState('');
    const [evidenceQuality, setEvidenceQuality] = useState<'strong' | 'moderate' | 'weak'>('moderate');
    const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
    const [confidenceScore, setConfidenceScore] = useState(70);
    const [issueCodesInput, setIssueCodesInput] = useState('');
    const [citationsChecked, setCitationsChecked] = useState(false);
    const [disclosureChecked, setDisclosureChecked] = useState(false);
    const [factualityAssessment, setFactualityAssessment] = useState<'verified' | 'partially_verified' | 'unclear'>('verified');
    const [structureQuality, setStructureQuality] = useState<'strong' | 'adequate' | 'weak'>('adequate');
    const [methodologyCheck, setMethodologyCheck] = useState<'passed' | 'needs_changes' | 'missing'>('passed');
    const [formulaCoverage, setFormulaCoverage] = useState<'full' | 'partial' | 'none'>('full');
    const [edgeCasesTested, setEdgeCasesTested] = useState(false);
    const [unitsVerified, setUnitsVerified] = useState(false);
    const [criteriaCoverage, setCriteriaCoverage] = useState<'complete' | 'partial' | 'insufficient'>('complete');
    const [sourceDiversity, setSourceDiversity] = useState<'single' | 'multiple'>('multiple');
    const [affiliateDisclosureChecked, setAffiliateDisclosureChecked] = useState(false);
    const [offerAccuracyChecked, setOfferAccuracyChecked] = useState(false);
    const [formConsentChecked, setFormConsentChecked] = useState(false);
    const [disclosurePlacement, setDisclosurePlacement] = useState<'above_fold' | 'in_form' | 'both' | 'missing'>('both');
    const [medicalSafetyReview, setMedicalSafetyReview] = useState<'complete' | 'partial' | 'missing'>('complete');
    const [harmRisk, setHarmRisk] = useState<'low' | 'medium' | 'high'>('low');
    const [professionalCareCtaPresent, setProfessionalCareCtaPresent] = useState(true);
    const [branchingLogicValidated, setBranchingLogicValidated] = useState(false);
    const [eligibilityCopyClear, setEligibilityCopyClear] = useState(false);
    const [fallbackPathTested, setFallbackPathTested] = useState(false);
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
                    contentType: articleResponse.contentType || 'article',
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
                if (typeof qaResponse.latestResult?.unitTestPassId === 'string') {
                    setUnitTestPassId(qaResponse.latestResult.unitTestPassId);
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

    function parseIssueCodes(): string[] {
        return issueCodesInput
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0);
    }

    function buildStructuredRationale() {
        const contentType = articleInfo?.contentType || 'article';
        const base = {
            summary: rationale.trim(),
            evidenceQuality,
            riskLevel,
            confidenceScore,
            issueCodes: parseIssueCodes(),
            citationsChecked,
            disclosureChecked,
        };

        if (contentType === 'calculator') {
            return {
                ...base,
                methodologyCheck,
                formulaCoverage,
                edgeCasesTested,
                unitsVerified,
            };
        }

        if (contentType === 'comparison' || contentType === 'review') {
            return {
                ...base,
                criteriaCoverage,
                sourceDiversity,
                affiliateDisclosureChecked,
            };
        }

        if (contentType === 'lead_capture') {
            return {
                ...base,
                offerAccuracyChecked,
                formConsentChecked,
                disclosurePlacement,
            };
        }

        if (contentType === 'health_decision') {
            return {
                ...base,
                medicalSafetyReview,
                harmRisk,
                professionalCareCtaPresent,
            };
        }

        if (
            contentType === 'wizard'
            || contentType === 'configurator'
            || contentType === 'quiz'
            || contentType === 'survey'
            || contentType === 'assessment'
        ) {
            return {
                ...base,
                branchingLogicValidated,
                eligibilityCopyClear,
                fallbackPathTested,
            };
        }

        return {
            ...base,
            factualityAssessment,
            structureQuality,
        };
    }

    async function submitQa() {
        if (!qaData) return;
        setSubmitting(true);
        setActionError('');
        try {
            const results: Record<string, { checked: boolean }> = {};
            for (const item of qaData.checklist.items) {
                results[item.id] = { checked: !!checkedItems[item.id] };
            }

            const submitRes = await fetch(`/api/articles/${articleId}/qa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    results,
                    templateId: qaData.checklist.id,
                    unitTestPassId: unitTestPassId.trim() || null,
                }),
            });
            if (!submitRes.ok) {
                const body = await submitRes.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to submit QA results');
            }

            const res = await fetch(`/api/articles/${articleId}/qa`);
            if (res.ok) {
                setQaData(await res.json());
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'QA submission failed');
        } finally {
            setSubmitting(false);
        }
    }

    async function transitionStatus(newStatus: string) {
        setSubmitting(true);
        setActionError('');

        try {
            const res = await fetch(`/api/articles/${articleId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: newStatus,
                    rationale,
                    rationaleDetails: buildStructuredRationale(),
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setActionError(data.error || 'Failed to update status');
                return;
            }

            router.push('/dashboard/review');
            router.refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Status transition failed');
        } finally {
            setSubmitting(false);
        }
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
        try {
            const publishRes = await fetch(`/api/articles/${articleId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'published',
                    rationale,
                    rationaleDetails: buildStructuredRationale(),
                }),
            });

            const publishData = await publishRes.json();
            if (!publishRes.ok) {
                setActionError(publishData.error || 'Failed to publish after sign-off');
                return;
            }

            router.push('/dashboard/review');
            router.refresh();
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Publish request failed');
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    const items = qaData?.checklist.items || [];
    const allRequiredChecked = items
        .filter(i => i.required)
        .every(i => checkedItems[i.id]);
    const hasCalcIntegrityItem = items.some((item) => item.id === 'calc_tested');

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

                {qaData?.latestResult?.unitTestPassId && (
                    <p className="mb-4 text-xs text-muted-foreground">
                        Last deterministic calculator test pass: <span className="font-mono">{qaData.latestResult.unitTestPassId}</span>
                    </p>
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

                {hasCalcIntegrityItem && (
                    <div className="mt-4 space-y-2">
                        <Label htmlFor="unitTestPassId">Deterministic Unit Test Pass ID (for calculator integrity)</Label>
                        <Input
                            id="unitTestPassId"
                            value={unitTestPassId}
                            onChange={(event) => setUnitTestPassId(event.target.value)}
                            placeholder="e.g. calc-ci-2026-02-15.1422"
                        />
                    </div>
                )}

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

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                            <Label htmlFor="evidenceQuality">Evidence quality</Label>
                            <select
                                id="evidenceQuality"
                                aria-label="Evidence quality"
                                className="w-full rounded-lg border bg-background p-2 text-sm"
                                value={evidenceQuality}
                                onChange={(event) => setEvidenceQuality(event.target.value as 'strong' | 'moderate' | 'weak')}
                            >
                                <option value="strong">Strong</option>
                                <option value="moderate">Moderate</option>
                                <option value="weak">Weak</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="riskLevel">Risk level</Label>
                            <select
                                id="riskLevel"
                                aria-label="Risk level"
                                className="w-full rounded-lg border bg-background p-2 text-sm"
                                value={riskLevel}
                                onChange={(event) => setRiskLevel(event.target.value as 'low' | 'medium' | 'high')}
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="confidenceScore">Confidence score (0-100)</Label>
                            <Input
                                id="confidenceScore"
                                type="number"
                                min={0}
                                max={100}
                                value={confidenceScore}
                                onChange={(event) => {
                                    const parsed = Number.parseInt(event.target.value, 10);
                                    setConfidenceScore(Number.isFinite(parsed) ? parsed : 0);
                                }}
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                            <Label htmlFor="issueCodes">Issue codes (comma separated)</Label>
                            <Input
                                id="issueCodes"
                                value={issueCodesInput}
                                onChange={(event) => setIssueCodesInput(event.target.value)}
                                placeholder="factual_gap,citation_missing"
                            />
                        </div>
                        <div className="space-y-2 pt-6">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={citationsChecked}
                                    onChange={(event) => setCitationsChecked(event.target.checked)}
                                />
                                Citations checked
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={disclosureChecked}
                                    onChange={(event) => setDisclosureChecked(event.target.checked)}
                                />
                                Disclosures checked
                            </label>
                        </div>
                    </div>

                    {articleInfo?.contentType === 'calculator' && (
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <Label htmlFor="methodologyCheck">Methodology check</Label>
                                <select
                                    id="methodologyCheck"
                                    aria-label="Methodology check"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={methodologyCheck}
                                    onChange={(event) => setMethodologyCheck(event.target.value as 'passed' | 'needs_changes' | 'missing')}
                                >
                                    <option value="passed">Passed</option>
                                    <option value="needs_changes">Needs changes</option>
                                    <option value="missing">Missing</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="formulaCoverage">Formula coverage</Label>
                                <select
                                    id="formulaCoverage"
                                    aria-label="Formula coverage"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={formulaCoverage}
                                    onChange={(event) => setFormulaCoverage(event.target.value as 'full' | 'partial' | 'none')}
                                >
                                    <option value="full">Full</option>
                                    <option value="partial">Partial</option>
                                    <option value="none">None</option>
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={edgeCasesTested}
                                    onChange={(event) => setEdgeCasesTested(event.target.checked)}
                                />
                                Edge cases tested
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={unitsVerified}
                                    onChange={(event) => setUnitsVerified(event.target.checked)}
                                />
                                Units verified
                            </label>
                        </div>
                    )}

                    {(articleInfo?.contentType === 'comparison' || articleInfo?.contentType === 'review') && (
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-1">
                                <Label htmlFor="criteriaCoverage">Criteria coverage</Label>
                                <select
                                    id="criteriaCoverage"
                                    aria-label="Criteria coverage"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={criteriaCoverage}
                                    onChange={(event) => setCriteriaCoverage(event.target.value as 'complete' | 'partial' | 'insufficient')}
                                >
                                    <option value="complete">Complete</option>
                                    <option value="partial">Partial</option>
                                    <option value="insufficient">Insufficient</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="sourceDiversity">Source diversity</Label>
                                <select
                                    id="sourceDiversity"
                                    aria-label="Source diversity"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={sourceDiversity}
                                    onChange={(event) => setSourceDiversity(event.target.value as 'single' | 'multiple')}
                                >
                                    <option value="multiple">Multiple</option>
                                    <option value="single">Single</option>
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-sm pt-7">
                                <input
                                    type="checkbox"
                                    checked={affiliateDisclosureChecked}
                                    onChange={(event) => setAffiliateDisclosureChecked(event.target.checked)}
                                />
                                Affiliate disclosure checked
                            </label>
                        </div>
                    )}

                    {articleInfo?.contentType === 'lead_capture' && (
                        <div className="grid gap-3 md:grid-cols-3">
                            <label className="flex items-center gap-2 text-sm pt-7">
                                <input
                                    type="checkbox"
                                    checked={offerAccuracyChecked}
                                    onChange={(event) => setOfferAccuracyChecked(event.target.checked)}
                                />
                                Offer accuracy checked
                            </label>
                            <label className="flex items-center gap-2 text-sm pt-7">
                                <input
                                    type="checkbox"
                                    checked={formConsentChecked}
                                    onChange={(event) => setFormConsentChecked(event.target.checked)}
                                />
                                Consent text checked
                            </label>
                            <div className="space-y-1">
                                <Label htmlFor="disclosurePlacement">Disclosure placement</Label>
                                <select
                                    id="disclosurePlacement"
                                    aria-label="Disclosure placement"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={disclosurePlacement}
                                    onChange={(event) => setDisclosurePlacement(event.target.value as 'above_fold' | 'in_form' | 'both' | 'missing')}
                                >
                                    <option value="both">Both</option>
                                    <option value="above_fold">Above fold</option>
                                    <option value="in_form">In form</option>
                                    <option value="missing">Missing</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {articleInfo?.contentType === 'health_decision' && (
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-1">
                                <Label htmlFor="medicalSafetyReview">Medical safety review</Label>
                                <select
                                    id="medicalSafetyReview"
                                    aria-label="Medical safety review"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={medicalSafetyReview}
                                    onChange={(event) => setMedicalSafetyReview(event.target.value as 'complete' | 'partial' | 'missing')}
                                >
                                    <option value="complete">Complete</option>
                                    <option value="partial">Partial</option>
                                    <option value="missing">Missing</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="harmRisk">Harm risk</Label>
                                <select
                                    id="harmRisk"
                                    aria-label="Harm risk"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={harmRisk}
                                    onChange={(event) => setHarmRisk(event.target.value as 'low' | 'medium' | 'high')}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-sm pt-7">
                                <input
                                    type="checkbox"
                                    checked={professionalCareCtaPresent}
                                    onChange={(event) => setProfessionalCareCtaPresent(event.target.checked)}
                                />
                                Professional care CTA present
                            </label>
                        </div>
                    )}

                    {(articleInfo?.contentType === 'wizard'
                        || articleInfo?.contentType === 'configurator'
                        || articleInfo?.contentType === 'quiz'
                        || articleInfo?.contentType === 'survey'
                        || articleInfo?.contentType === 'assessment') && (
                        <div className="grid gap-3 md:grid-cols-3">
                            <label className="flex items-center gap-2 text-sm pt-7">
                                <input
                                    type="checkbox"
                                    checked={branchingLogicValidated}
                                    onChange={(event) => setBranchingLogicValidated(event.target.checked)}
                                />
                                Branching logic validated
                            </label>
                            <label className="flex items-center gap-2 text-sm pt-7">
                                <input
                                    type="checkbox"
                                    checked={eligibilityCopyClear}
                                    onChange={(event) => setEligibilityCopyClear(event.target.checked)}
                                />
                                Eligibility copy is clear
                            </label>
                            <label className="flex items-center gap-2 text-sm pt-7">
                                <input
                                    type="checkbox"
                                    checked={fallbackPathTested}
                                    onChange={(event) => setFallbackPathTested(event.target.checked)}
                                />
                                Fallback path tested
                            </label>
                        </div>
                    )}

                    {(!articleInfo?.contentType
                        || (articleInfo.contentType !== 'calculator'
                            && articleInfo.contentType !== 'comparison'
                            && articleInfo.contentType !== 'review'
                            && articleInfo.contentType !== 'lead_capture'
                            && articleInfo.contentType !== 'health_decision'
                            && articleInfo.contentType !== 'wizard'
                            && articleInfo.contentType !== 'configurator'
                            && articleInfo.contentType !== 'quiz'
                            && articleInfo.contentType !== 'survey'
                            && articleInfo.contentType !== 'assessment')) && (
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                                <Label htmlFor="factualityAssessment">Factuality assessment</Label>
                                <select
                                    id="factualityAssessment"
                                    aria-label="Factuality assessment"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={factualityAssessment}
                                    onChange={(event) => setFactualityAssessment(event.target.value as 'verified' | 'partially_verified' | 'unclear')}
                                >
                                    <option value="verified">Verified</option>
                                    <option value="partially_verified">Partially verified</option>
                                    <option value="unclear">Unclear</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="structureQuality">Structure quality</Label>
                                <select
                                    id="structureQuality"
                                    aria-label="Structure quality"
                                    className="w-full rounded-lg border bg-background p-2 text-sm"
                                    value={structureQuality}
                                    onChange={(event) => setStructureQuality(event.target.value as 'strong' | 'adequate' | 'weak')}
                                >
                                    <option value="strong">Strong</option>
                                    <option value="adequate">Adequate</option>
                                    <option value="weak">Weak</option>
                                </select>
                            </div>
                        </div>
                    )}

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
