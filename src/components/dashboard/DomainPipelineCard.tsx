'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Rocket, Zap, CheckCircle2, CircleDashed, Play, FileSearch, Wand2 } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';

interface PipelineState {
    domainId: string;
    domainName: string;
    isClassified: boolean;
    niche: string | null;
    keywordCount: number;
    articleCount: number;
    isDeployed: boolean;
    pendingJobs: number;
    processingJobs: number;
    reviewScore?: number | null;
    reviewVerdict?: 'approve' | 'needs_work' | 'reject' | null;
    criticalIssues?: string[] | null;
}

const STAGES = [
    { key: 'classify', label: 'Classify', desc: 'AI assigns niche, tier, template', tip: 'AI analyzes the domain name and assigns a niche (e.g. "health"), content tier (1–3), site template, and theme style. This determines all downstream content decisions.' },
    { key: 'keywords', label: 'Keywords', desc: 'Research target keywords', tip: 'AI researches high-value search keywords in this domain\'s niche. These keywords become the basis for each article\'s topic and SEO targeting.' },
    { key: 'content', label: 'Content', desc: 'Generate articles via pipeline', tip: 'Each article goes through a multi-step AI pipeline: outline → draft → polish writing → SEO optimize → title & description. Articles start as "draft" and move through review before publishing.' },
    { key: 'deploy', label: 'Deploy', desc: 'Push to Cloudflare Pages', tip: 'Generates a static site from all published articles and uploads it to Cloudflare Pages. After deploy, the site is live at the domain\'s URL (requires nameservers pointed to Cloudflare).' },
] as const;

function getStageStatus(stage: typeof STAGES[number]['key'], state: PipelineState): 'done' | 'active' | 'pending' {
    switch (stage) {
        case 'classify':
            return state.isClassified ? 'done' : 'active';
        case 'keywords':
            if (!state.isClassified) return 'pending';
            return state.keywordCount > 0 ? 'done' : 'active';
        case 'content':
            if (state.keywordCount === 0) return 'pending';
            return state.articleCount > 0 ? 'done' : 'active';
        case 'deploy':
            if (state.articleCount === 0) return 'pending';
            return state.isDeployed ? 'done' : 'active';
    }
}

function StageIcon({ status }: { status: 'done' | 'active' | 'pending' }) {
    if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    if (status === 'active') return <CircleDashed className="h-5 w-5 text-blue-500" />;
    return <CircleDashed className="h-5 w-5 text-muted-foreground/40" />;
}

export function DomainPipelineCard({ state }: { state: PipelineState }) {
    const router = useRouter();
    const [classifying, setClassifying] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [prepareStatus, setPrepareStatus] = useState<string | null>(null);

    const hasActiveWork = state.pendingJobs > 0 || state.processingJobs > 0;
    const criticalCount = Array.isArray(state.criticalIssues) ? state.criticalIssues.length : 0;

    function reviewBadgeClass(): string {
        if (state.reviewVerdict === 'approve') return 'border-emerald-200 text-emerald-700';
        if (state.reviewVerdict === 'needs_work') return 'border-amber-200 text-amber-800';
        if (state.reviewVerdict === 'reject') return 'border-red-200 text-red-700';
        return 'border-muted text-muted-foreground';
    }

    async function handleClassify() {
        setClassifying(true);
        try {
            const res = await fetch('/api/domains/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domainId: state.domainId }),
            });
            if (!res.ok) throw new Error('Classification failed');
            const data = await res.json();
            toast.success(`Classified: ${data.classification?.niche || 'done'}`);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Classification failed');
        } finally {
            setClassifying(false);
        }
    }

    async function handleSeed(articleCount = 5) {
        setSeeding(true);
        try {
            const res = await fetch(`/api/domains/${state.domainId}/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleCount, priority: 5 }),
            });
            if (!res.ok) throw new Error('Seed failed');
            const data = await res.json();
            if (data.articlesQueued) {
                toast.success(`Queued ${data.articlesQueued} article(s) for generation`);
            } else if (data.keywordJobId) {
                toast.success('Keyword research queued — articles will follow');
            }
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Content generation failed');
        } finally {
            setSeeding(false);
        }
    }

    async function handleDeploy() {
        setDeploying(true);
        try {
            const idempotencyKey = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

            const res = await apiFetch(`/api/domains/${state.domainId}/deploy`, {
                method: 'POST',
                headers: { 'Idempotency-Key': idempotencyKey },
                body: { triggerBuild: true, addCustomDomain: true },
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Deploy failed');
            }
            toast.success('Deployment queued');
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Deploy failed');
        } finally {
            setDeploying(false);
        }
    }

    async function handleReviewSite() {
        setReviewing(true);
        try {
            const idempotencyKey = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

            const res = await fetch(`/api/domains/${state.domainId}/review`, {
                method: 'POST',
                headers: { 'Idempotency-Key': idempotencyKey },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((data as { error?: string }).error || 'Site review failed');
            }

            const queued = Boolean((data as { queued?: unknown }).queued);
            const jobId = (data as { jobId?: unknown }).jobId;
            const suffix = typeof jobId === 'string' && jobId.length > 0 ? ` (job ${jobId.slice(0, 8)})` : '';
            toast.success(`${queued ? 'Site review queued' : 'Site review already queued'}${suffix}`);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Site review failed');
        } finally {
            setReviewing(false);
        }
    }

    async function handleProcessQueue() {
        setProcessing(true);
        try {
            const res = await fetch('/api/queue/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxJobs: 10 }),
            });
            if (!res.ok) throw new Error('Queue processing failed');
            const data = await res.json();
            toast.success(`Processed ${data.processed || 0} job(s), ${data.failed || 0} failed`);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Queue processing failed');
        } finally {
            setProcessing(false);
        }
    }

    async function handlePrepare() {
        setPreparing(true);
        setPrepareStatus('Running full pipeline...');
        try {
            const res = await fetch(`/api/domains/${state.domainId}/prepare`, {
                method: 'POST',
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Prepare failed');

            const parts: string[] = [];
            if (data.pagesSeeded) parts.push('pages seeded');
            if (data.enrichment?.aiCalls > 0) parts.push(`${data.enrichment.aiCalls} AI enrichments`);
            if (data.contentScan?.blocksRewritten > 0) parts.push(`${data.contentScan.blocksRewritten} blocks cleaned`);
            if (data.contentScan?.totalViolations > 0) parts.push(`${data.contentScan.totalViolations} violations found`);

            const ready = data.ready === true;
            const scoreText = typeof data.validation?.errorCount === 'number'
                ? (data.validation.errorCount === 0 ? 'Ready to deploy' : `${data.validation.errorCount} issues remaining`)
                : '';

            toast.success(`Pipeline complete: ${ready ? '✓ Ready' : '⚠ Needs attention'}. ${parts.join(', ')}`);
            const totalCost = (data.enrichment?.cost ?? 0) + (data.contentScan?.cost ?? 0);
            const segments = [`${data.pageCount ?? 0} pages`];
            if (scoreText) segments.push(scoreText);
            segments.push(`$${totalCost.toFixed(2)} cost`);
            setPrepareStatus(segments.join(' | '));
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Prepare failed');
            setPrepareStatus(null);
        } finally {
            setPreparing(false);
        }
    }

    return (
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/20">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-blue-500" />
                    Content Pipeline
                </CardTitle>
                <CardDescription>
                    Build this domain from classification to deployment.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {/* Stage Progress */}
                <div className="grid gap-3 sm:grid-cols-4">
                    {STAGES.map((stage) => {
                        const status = getStageStatus(stage.key, state);
                        return (
                            <Tooltip key={stage.key}>
                                <TooltipTrigger asChild>
                                    <div
                                        className={`flex items-start gap-2 rounded-lg border p-3 cursor-help ${
                                            status === 'done' ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20' :
                                            status === 'active' ? 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20' :
                                            'border-muted'
                                        }`}
                                    >
                                        <StageIcon status={status} />
                                        <div>
                                            <p className="text-sm font-medium">{stage.label}</p>
                                            <p className="text-xs text-muted-foreground">{stage.desc}</p>
                                        </div>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                    {stage.tip}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </div>

                {/* Quick Stats */}
                <div className="flex flex-wrap gap-2 text-xs">
                    {state.isClassified && (
                        <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                            {state.niche}
                        </Badge>
                    )}
                    <Badge variant="outline" className={reviewBadgeClass()}>
                        {state.reviewScore != null ? `Review ${state.reviewScore}` : 'Not reviewed'}
                    </Badge>
                    {criticalCount > 0 && (
                        <Badge variant="outline" className="border-red-200 text-red-700">
                            {criticalCount} critical
                        </Badge>
                    )}
                    {state.keywordCount > 0 && (
                        <Link href={`/dashboard/keywords?domainId=${state.domainId}`}>
                            <Badge variant="outline" className="hover:bg-muted">
                                {state.keywordCount} keywords
                            </Badge>
                        </Link>
                    )}
                    {state.articleCount > 0 && (
                        <Link href={`/dashboard/content/articles?domainId=${state.domainId}`}>
                            <Badge variant="outline" className="hover:bg-muted">
                                {state.articleCount} articles
                            </Badge>
                        </Link>
                    )}
                    {state.isDeployed && (
                        <Badge variant="outline" className="border-emerald-200 text-emerald-700">Deployed</Badge>
                    )}
                    {hasActiveWork && (
                        <Badge variant="outline" className="border-blue-200 text-blue-700">
                            {state.pendingJobs} pending, {state.processingJobs} processing
                        </Badge>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/domains/${state.domainId}/pages`}>
                            Page Configurator
                        </Link>
                    </Button>
                    {!state.isClassified && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button onClick={handleClassify} disabled={classifying} size="sm">
                                    {classifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    Classify with AI
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                Run AI classification to determine this domain&apos;s niche, tier, template, and theme. Required before any content can be generated.
                            </TooltipContent>
                        </Tooltip>
                    )}

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={handlePrepare}
                                disabled={preparing || !state.isClassified}
                                size="sm"
                                variant="default"
                            >
                                {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                {preparing ? 'Preparing...' : 'Prepare Site'}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                            Full pipeline: seed pages → theme → fixes → AI enrich → content scan (banned words + burstiness) → Opus review → auto-remediate → validate. One button, everything.
                        </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={() => handleSeed(5)}
                                disabled={seeding || !state.isClassified}
                                size="sm"
                                variant={state.articleCount === 0 ? 'default' : 'outline'}
                            >
                                {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                {state.articleCount === 0 ? 'Generate 5 Articles' : 'Generate More'}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                            Seeds 5 articles linked to researched keywords, then queues them through the full AI pipeline (outline → draft → polish writing → SEO optimize → title &amp; description).
                        </TooltipContent>
                    </Tooltip>

                    {state.articleCount > 0 && !state.isDeployed && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button onClick={handleDeploy} disabled={deploying} size="sm" variant="outline">
                                    {deploying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                                    Deploy
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                Build a static site from all published articles and upload to Cloudflare Pages. The site will be live once nameservers are pointed to Cloudflare.
                            </TooltipContent>
                        </Tooltip>
                    )}

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button onClick={handleReviewSite} disabled={reviewing || !state.isClassified} size="sm" variant="outline">
                                {reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
                                Review Site
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                            Runs an AI QA review of the homepage, a tool page, and a guide page. Stores the score + critical issues on the domain.
                        </TooltipContent>
                    </Tooltip>

                    {hasActiveWork && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button onClick={handleProcessQueue} disabled={processing} size="sm" variant="outline">
                                    {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                    Process Queue ({state.pendingJobs + state.processingJobs})
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                Manually trigger the background worker to process up to 10 pending jobs (keyword research, article generation steps, deploys, etc.).
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>

                {prepareStatus && !preparing && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">{prepareStatus}</p>
                )}
            </CardContent>
        </Card>
    );
}
