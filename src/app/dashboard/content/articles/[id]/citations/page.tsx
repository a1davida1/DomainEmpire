'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, ExternalLink } from 'lucide-react';

type Citation = {
    id: string;
    claimText: string;
    sourceUrl: string;
    sourceTitle: string | null;
    retrievedAt: string;
    quotedSnippet: string | null;
    notes: string | null;
    position: number;
};

export default function CitationsPage() {
    const params = useParams();
    const articleId = params.id as string;
    const [citations, setCitations] = useState<Citation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);

    const [claimText, setClaimText] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [sourceTitle, setSourceTitle] = useState('');
    const [quotedSnippet, setQuotedSnippet] = useState('');

    const loadCitations = useCallback(async () => {
        const res = await fetch(`/api/articles/${articleId}/citations`);
        if (res.ok) {
            const body = await res.json();
            setCitations(Array.isArray(body) ? body : body.data ?? []);
        }
        setLoading(false);
    }, [articleId]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { loadCitations(); }, [loadCitations]);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        await fetch(`/api/articles/${articleId}/citations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ claimText, sourceUrl, sourceTitle: sourceTitle || undefined, quotedSnippet: quotedSnippet || undefined }),
        });
        setClaimText(''); setSourceUrl(''); setSourceTitle(''); setQuotedSnippet('');
        setShowForm(false);
        setSaving(false);
        loadCitations();
    }

    async function handleDelete(citationId: string) {
        await fetch(`/api/articles/${articleId}/citations?citationId=${citationId}`, { method: 'DELETE' });
        loadCitations();
    }

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">Citations</h1>
                <Button onClick={() => setShowForm(!showForm)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Citation
                </Button>
            </div>

            {showForm && (
                <div className="bg-card rounded-lg border p-4">
                    <form onSubmit={handleAdd} className="space-y-3">
                        <div className="space-y-1">
                            <Label>Claim Text</Label>
                            <Input value={claimText} onChange={e => setClaimText(e.target.value)} required
                                placeholder="The factual claim being cited..." />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label>Source URL</Label>
                                <Input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} required
                                    placeholder="https://..." />
                            </div>
                            <div className="space-y-1">
                                <Label>Source Title</Label>
                                <Input value={sourceTitle} onChange={e => setSourceTitle(e.target.value)}
                                    placeholder="Article or page title" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Quoted Snippet (optional)</Label>
                            <textarea
                                value={quotedSnippet}
                                onChange={e => setQuotedSnippet(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                                rows={2}
                                placeholder="Direct quote from source..."
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button type="submit" disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Add
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                        </div>
                    </form>
                </div>
            )}

            {citations.length === 0 ? (
                <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">
                    No citations yet. Add sources to improve content trustworthiness.
                </div>
            ) : (
                <div className="space-y-3">
                    {citations.map((c, i) => (
                        <div key={c.id} className="bg-card rounded-lg border p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">[{i + 1}]</span>
                                        <p className="text-sm font-medium">{c.claimText}</p>
                                    </div>
                                    <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer"
                                        className="text-xs text-primary hover:underline flex items-center gap-1">
                                        {c.sourceTitle || c.sourceUrl}
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                    {c.quotedSnippet && (
                                        <blockquote className="mt-1 text-xs text-muted-foreground border-l-2 pl-2 italic">
                                            {c.quotedSnippet}
                                        </blockquote>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Retrieved: {new Date(c.retrievedAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
