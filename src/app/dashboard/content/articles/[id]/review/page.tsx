'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

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
    const [loading, setLoading] = useState(true);
    const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
    const [rationale, setRationale] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState('');

    useEffect(() => {
        fetch(`/api/articles/${articleId}/qa`)
            .then(r => r.json())
            .then((data: QaData) => {
                setQaData(data);
                // Pre-fill from latest result
                if (data.latestResult?.results) {
                    const pre: Record<string, boolean> = {};
                    for (const [k, v] of Object.entries(data.latestResult.results)) {
                        pre[k] = v.checked;
                    }
                    setCheckedItems(pre);
                }
            })
            .finally(() => setLoading(false));
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

        // Reload QA data
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

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    const items = qaData?.checklist.items || [];
    const allRequiredChecked = items
        .filter(i => i.required)
        .every(i => checkedItems[i.id]);

    return (
        <div className="space-y-6 max-w-3xl">
            <h1 className="text-3xl font-bold">Review Article</h1>

            {/* QA Checklist */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">{qaData?.checklist.name || 'QA Checklist'}</h2>

                {qaData?.latestResult && (
                    <div className={`mb-4 p-3 rounded-lg border flex items-center gap-2 text-sm ${
                        qaData.latestResult.allPassed
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
                        <label key={item.id} className="flex items-start gap-3 p-2 rounded hover:bg-muted/30 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!checkedItems[item.id]}
                                onChange={e => setCheckedItems(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                className="mt-0.5"
                            />
                            <div>
                                <span className="text-sm">{item.label}</span>
                                {item.required && <span className="text-red-500 ml-1">*</span>}
                                <span className="text-xs text-muted-foreground ml-2 capitalize">[{item.category.replaceAll('_', ' ')}]</span>
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

            {/* Status Actions */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Status Actions</h2>

                <div className="space-y-3">
                    <div>
                        <label className="text-sm text-muted-foreground block mb-1">Rationale / Notes</label>
                        <textarea
                            value={rationale}
                            onChange={e => setRationale(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                            rows={3}
                            placeholder="Explain your decision..."
                        />
                    </div>

                    {actionError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {actionError}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={() => transitionStatus('approved')}
                            disabled={submitting || !allRequiredChecked}
                            className="bg-emerald-600 hover:bg-emerald-700"
                        >
                            Approve
                        </Button>
                        <Button
                            onClick={() => transitionStatus('published')}
                            disabled={submitting}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            Publish
                        </Button>
                        <Button
                            onClick={() => transitionStatus('draft')}
                            disabled={submitting}
                            variant="outline"
                        >
                            Send Back to Draft
                        </Button>
                    </div>

                    {!allRequiredChecked && (
                        <p className="text-xs text-muted-foreground">
                            All required QA checklist items must be checked before approval.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
