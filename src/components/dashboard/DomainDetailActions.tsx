'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export function GenerateArticleButton({ domainId, hasArticles }: { domainId: string; hasArticles: boolean }) {
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
        <Tooltip>
            <TooltipTrigger asChild>
                <Button size="sm" onClick={handleSeed} disabled={loading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    {hasArticles ? 'Generate More' : 'Generate Articles'}
                </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">Queue 5 new articles through the AI pipeline (keyword research → outline → draft → humanize → SEO → meta tags).</TooltipContent>
        </Tooltip>
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
