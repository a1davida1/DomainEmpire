'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';

interface BulkArticleActionsProps {
    articles: Array<{ id: string; status: string | null }>;
}

export function BulkArticleActions({ articles }: BulkArticleActionsProps) {
    const router = useRouter();
    const [loading, setLoading] = useState<string | null>(null);

    const drafts = articles.filter(a => a.status === 'draft');
    const inReview = articles.filter(a => a.status === 'review');
    const approved = articles.filter(a => a.status === 'approved');

    async function bulkTransition(articleIds: string[], targetStatus: string, label: string) {
        setLoading(label);
        let success = 0;
        let failed = 0;
        for (const id of articleIds) {
            try {
                const res = await fetch(`/api/articles/${id}/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: targetStatus,
                        rationale: `Bulk ${label.toLowerCase()} via content review`,
                    }),
                });
                if (res.ok) success++;
                else failed++;
            } catch {
                failed++;
            }
        }
        if (success > 0) toast.success(`${label}: ${success} article(s) updated`);
        if (failed > 0) toast.error(`${failed} article(s) failed to update`);
        setLoading(null);
        router.refresh();
    }

    const hasActions = drafts.length > 0 || inReview.length > 0 || approved.length > 0;
    if (!hasActions) return null;

    return (
        <div className="flex flex-wrap gap-1.5">
            {drafts.length > 0 && (
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => bulkTransition(drafts.map(a => a.id), 'review', 'Submit all')}
                    disabled={loading !== null}
                >
                    {loading === 'Submit all' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                    Submit {drafts.length} draft{drafts.length !== 1 ? 's' : ''}
                </Button>
            )}
            {inReview.length > 0 && (
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => bulkTransition(inReview.map(a => a.id), 'approved', 'Approve all')}
                    disabled={loading !== null}
                >
                    {loading === 'Approve all' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                    Approve {inReview.length}
                </Button>
            )}
            {approved.length > 0 && (
                <Button
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => bulkTransition(approved.map(a => a.id), 'published', 'Publish all')}
                    disabled={loading !== null}
                >
                    {loading === 'Publish all' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                    Publish {approved.length}
                </Button>
            )}
        </div>
    );
}
