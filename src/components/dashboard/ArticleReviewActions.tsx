'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Send, RotateCcw, Archive, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const TRANSITIONS: Record<string, { label: string; target: string; icon: 'check' | 'send' | 'back' | 'archive'; variant: 'default' | 'outline' | 'destructive' }[]> = {
    generating: [],
    draft: [
        { label: 'Submit for Review', target: 'review', icon: 'send', variant: 'default' },
    ],
    review: [
        { label: 'Approve', target: 'approved', icon: 'check', variant: 'default' },
        { label: 'Back to Draft', target: 'draft', icon: 'back', variant: 'outline' },
    ],
    approved: [
        { label: 'Publish', target: 'published', icon: 'check', variant: 'default' },
        { label: 'Back to Review', target: 'review', icon: 'back', variant: 'outline' },
    ],
    published: [
        { label: 'Archive', target: 'archived', icon: 'archive', variant: 'destructive' },
    ],
    archived: [
        { label: 'Restore to Draft', target: 'draft', icon: 'back', variant: 'outline' },
    ],
};

function ActionIcon({ icon }: { icon: string }) {
    switch (icon) {
        case 'check': return <CheckCircle2 className="mr-1.5 h-3 w-3" />;
        case 'send': return <Send className="mr-1.5 h-3 w-3" />;
        case 'back': return <RotateCcw className="mr-1.5 h-3 w-3" />;
        case 'archive': return <Archive className="mr-1.5 h-3 w-3" />;
        default: return null;
    }
}

interface ArticleReviewActionsProps {
    articleId: string;
    currentStatus: string;
}

export function ArticleReviewActions({ articleId, currentStatus }: ArticleReviewActionsProps) {
    const router = useRouter();
    const [loading, setLoading] = useState<string | null>(null);

    const actions = TRANSITIONS[currentStatus] || [];

    async function handleTransition(target: string) {
        setLoading(target);
        try {
            const res = await fetch(`/api/articles/${articleId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: target,
                    rationale: `Status changed to ${target} via content review`,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Failed to change status to ${target}`);
            }
            toast.success(`Article moved to ${target}`);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Status change failed');
        } finally {
            setLoading(null);
        }
    }

    if (actions.length === 0) {
        return (
            <Badge variant="outline" className="text-[10px]">
                {currentStatus === 'generating' ? 'Generating...' : 'No actions'}
            </Badge>
        );
    }

    return (
        <div className="flex flex-wrap gap-1">
            {actions.map((action) => (
                <Button
                    key={action.target}
                    size="sm"
                    variant={action.variant}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTransition(action.target); }}
                    disabled={loading !== null}
                    className="h-6 px-2 text-[10px]"
                >
                    {loading === action.target ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                        <ActionIcon icon={action.icon} />
                    )}
                    {action.label}
                </Button>
            ))}
        </div>
    );
}

const PIPELINE_STAGES = [
    { jobType: 'humanize', label: 'Re-Humanize' },
    { jobType: 'seo_optimize', label: 'Re-SEO' },
    { jobType: 'generate_meta', label: 'Regen Meta' },
    { jobType: 'ai_detection_check', label: 'AI Detection' },
] as const;

export function ArticlePipelineActions({ articleId, domainId: _domainId }: { articleId: string; domainId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState<string | null>(null);

    async function handleRerun(jobType: string) {
        setLoading(jobType);
        try {
            const res = await fetch(`/api/articles/${articleId}/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stage: jobType }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Failed to queue ${jobType}`);
            }
            toast.success(`Queued: ${jobType}`);
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed');
        } finally {
            setLoading(null);
        }
    }

    return (
        <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-muted-foreground self-center mr-1">Re-run:</span>
            {PIPELINE_STAGES.map((stage) => (
                <Button
                    key={stage.jobType}
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRerun(stage.jobType); }}
                    disabled={loading !== null}
                    className="h-6 px-2 text-[10px]"
                >
                    {loading === stage.jobType ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-1 h-3 w-3" />
                    )}
                    {stage.label}
                </Button>
            ))}
        </div>
    );
}
