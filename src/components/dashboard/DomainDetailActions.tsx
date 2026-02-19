'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Trash2, Palette, FileStack, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const CONTENT_TYPE_OPTIONS = [
    { value: 'auto', label: 'Auto-detect' },
    { value: 'article', label: 'Article' },
    { value: 'calculator', label: 'Calculator' },
    { value: 'comparison', label: 'Comparison' },
    { value: 'cost_guide', label: 'Cost Guide' },
    { value: 'checklist', label: 'Checklist' },
    { value: 'faq', label: 'FAQ' },
    { value: 'review', label: 'Review' },
    { value: 'wizard', label: 'Wizard / Decision Tree' },
    { value: 'quiz', label: 'Quiz' },
    { value: 'survey', label: 'Survey' },
    { value: 'assessment', label: 'Assessment' },
    { value: 'lead_capture', label: 'Lead Capture' },
    { value: 'health_decision', label: 'Health Decision' },
    { value: 'configurator', label: 'Configurator' },
    { value: 'interactive_infographic', label: 'Interactive Infographic' },
    { value: 'interactive_map', label: 'Interactive Map' },
] as const;

export function GenerateArticleButton({ domainId, hasArticles }: { domainId: string; hasArticles: boolean }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [contentType, setContentType] = useState('auto');

    async function handleSeed() {
        setLoading(true);
        try {
            const payload: Record<string, unknown> = { articleCount: 5, priority: 5 };
            if (contentType !== 'auto') {
                payload.contentType = contentType;
            }
            const res = await fetch(`/api/domains/${domainId}/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to generate articles');
            }
            const data = await res.json();
            if (data.articlesQueued) {
                toast.success(`Queued ${data.articlesQueued} article(s) for generation`);
            } else if (data.keywordJobId) {
                toast.success('Keyword research queued — articles will follow');
            }
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex items-center gap-2">
            <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                    <SelectValue placeholder="Content type" />
                </SelectTrigger>
                <SelectContent>
                    {CONTENT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button size="sm" onClick={handleSeed} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        {hasArticles ? 'Generate More' : 'Generate Articles'}
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">Queue 5 new articles through the AI pipeline (keyword research → outline → draft → humanize → SEO → meta tags).</TooltipContent>
            </Tooltip>
        </div>
    );
}

export function GenerateFirstArticleButton({ domainId }: { domainId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function handleSeed() {
        setLoading(true);
        try {
            const res = await fetch(`/api/domains/${domainId}/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articleCount: 5, priority: 5 }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to generate articles');
            }
            const data = await res.json();
            if (data.articlesQueued) {
                toast.success(`Queued ${data.articlesQueued} article(s) for generation`);
            } else if (data.keywordJobId) {
                toast.success('Keyword research queued — articles will follow');
            }
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Button variant="link" onClick={handleSeed} disabled={loading}>
            {loading ? 'Generating...' : 'Generate your first article'}
        </Button>
    );
}

export function DeleteDomainButton({ domainId, domainName }: { domainId: string; domainName: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);

    async function handleDelete() {
        setLoading(true);
        try {
            const res = await fetch(`/api/domains/${domainId}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to delete domain');
            }
            toast.success(`Deleted ${domainName}`);
            router.push('/dashboard/domains');
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete');
            setLoading(false);
        }
    }

    if (confirming) {
        return (
            <div className="flex items-center gap-2">
                <p className="text-sm text-destructive font-medium">Delete {domainName}?</p>
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={loading}
                >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Yes, delete permanently
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={loading}>
                    Cancel
                </Button>
            </div>
        );
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="destructive" onClick={() => setConfirming(true)}>
                    Delete Domain
                </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">Permanently remove this domain and all its articles, keywords, queue jobs, and deployment data. This cannot be undone.</TooltipContent>
        </Tooltip>
    );
}

export function SeedPagesButton({ domainId }: { domainId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    async function handlePrepare() {
        setLoading(true);
        setStatus('Starting full pipeline...');
        try {
            const res = await fetch(`/api/domains/${domainId}/prepare`, {
                method: 'POST',
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                const parts: string[] = [];
                if (data.pagesSeeded) parts.push('pages seeded');
                if (data.enrichment?.aiCalls > 0) parts.push(`${data.enrichment.aiCalls} AI enrichments`);
                if (data.contentScan?.blocksRewritten > 0) parts.push(`${data.contentScan.blocksRewritten} blocks cleaned`);
                if (data.validation?.ready) parts.push('validation passed');
                const score = data.validation?.ready ? '✓ Ready' : '⚠ Needs attention';
                toast.success(`Pipeline complete: ${score}. ${parts.join(', ')}`);
                setStatus(`Score: ${data.validation?.errorCount === 0 ? 'Ready' : `${data.validation?.errorCount} issues`} | ${data.pageCount} pages`);
                router.refresh();
            } else {
                toast.error(data.error || 'Pipeline failed');
                setStatus(null);
            }
        } catch {
            toast.error('Pipeline failed');
            setStatus(null);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex items-center gap-2">
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button size="sm" variant="outline" disabled={loading} onClick={handlePrepare}>
                        {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileStack className="mr-1.5 h-3.5 w-3.5" />}
                        {loading ? 'Running Pipeline...' : 'Prepare Site'}
                    </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                    Full pipeline: seed pages → assign theme → programmatic fixes → AI enrichment → content scan (banned words + burstiness) → Opus site review → auto-remediation → validation.
                </TooltipContent>
            </Tooltip>
            {status && !loading && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>
    );
}

export function AssignThemeButton({ domainId }: { domainId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    return (
        <Button size="sm" variant="outline" disabled={loading} onClick={async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/domains/${domainId}/assign-theme`, { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    toast.success(`Theme: ${data.theme} / ${data.skin}`);
                    router.refresh();
                } else {
                    toast.error(data.error || 'Failed to assign theme');
                }
            } catch { toast.error('Failed to assign theme'); }
            finally { setLoading(false); }
        }}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Palette className="mr-1.5 h-3.5 w-3.5" />}
            Assign Theme
        </Button>
    );
}

export function DeployDomainButton({ domainId, isDeployed }: { domainId: string; isDeployed: boolean }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    return (
        <Button size="sm" disabled={loading} onClick={async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/domains/${domainId}/deploy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ triggerBuild: true, addCustomDomain: true }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    toast.success(`Deploy queued: ${data.jobId || 'OK'}`);
                    router.refresh();
                } else {
                    toast.error(data.error || 'Deploy failed');
                }
            } catch { toast.error('Deploy failed'); }
            finally { setLoading(false); }
        }}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Rocket className="mr-1.5 h-3.5 w-3.5" />}
            {isDeployed ? 'Redeploy' : 'Deploy'}
        </Button>
    );
}
