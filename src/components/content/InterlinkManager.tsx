'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link as LinkIcon, AlertCircle, Copy, Check, Wand2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Suggestion {
    articleId: string;
    title: string;
    slug: string;
    phrase: string;
    context: string;
    relevance: number;
}

interface InterlinkManagerProps {
    articleId: string;
}

export function InterlinkManager({ articleId }: InterlinkManagerProps) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const fetchSuggestions = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/articles/${articleId}/interlink`);
            if (!res.ok) throw new Error('Failed to fetch suggestions');
            const data = await res.json();
            setSuggestions(data.suggestions || []);
            setSelected(new Set());
        } catch {
            setError('Failed to load interlinking suggestions');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (slug: string, phrase: string) => {
        const link = `[${phrase}](${slug}/)`;
        navigator.clipboard.writeText(link);
        setCopied(slug);
        setTimeout(() => setCopied(null), 2000);
    };

    const toggleSelect = (targetArticleId: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(targetArticleId)) next.delete(targetArticleId);
            else next.add(targetArticleId);
            return next;
        });
    };

    const selectAll = () => {
        if (selected.size === suggestions.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(suggestions.map(s => s.articleId)));
        }
    };

    const applyLinks = async (targetIds: string[]) => {
        if (targetIds.length === 0) return;
        setApplying(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const linksToApply = suggestions
                .filter(s => targetIds.includes(s.articleId))
                .map(s => ({
                    targetArticleId: s.articleId,
                    phrase: s.phrase,
                    slug: s.slug,
                }));

            const res = await fetch(`/api/articles/${articleId}/interlink/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links: linksToApply }),
            });

            if (!res.ok) throw new Error('Failed to apply links');
            const data = await res.json();
            setSuccessMessage(`Applied ${data.applied || linksToApply.length} link(s) to article content.`);

            // Remove applied suggestions
            setSuggestions(prev => prev.filter(s => !targetIds.includes(s.articleId)));
            setSelected(new Set());
        } catch {
            setError('Failed to apply links');
        } finally {
            setApplying(false);
        }
    };

    if (loading && suggestions.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LinkIcon className="h-5 w-5" />
                        Smart Interlinking
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-sm text-muted-foreground animate-pulse">Analyzing content for linking opportunities...</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <LinkIcon className="h-5 w-5" />
                        Smart Interlinking
                    </CardTitle>
                    <CardDescription>
                        Suggested internal links based on your content.
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    {suggestions.length > 0 && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={selectAll}
                            >
                                {selected.size === suggestions.length ? 'Deselect All' : 'Select All'}
                            </Button>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => applyLinks(Array.from(selected))}
                                disabled={applying || selected.size === 0}
                            >
                                <Wand2 className="h-3 w-3 mr-1" />
                                {applying ? 'Applying...' : `Apply Selected (${selected.size})`}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => applyLinks(suggestions.map(s => s.articleId))}
                                disabled={applying}
                            >
                                {applying ? 'Applying...' : 'Apply All'}
                            </Button>
                        </>
                    )}
                    <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {successMessage && (
                    <Alert>
                        <Check className="h-4 w-4" />
                        <AlertTitle>Success</AlertTitle>
                        <AlertDescription>{successMessage}</AlertDescription>
                    </Alert>
                )}

                {suggestions.length === 0 && !loading && !error ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                        No obvious interlinking opportunities found.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {suggestions.map((suggestion) => (
                            <label
                                key={suggestion.articleId}
                                className={`border rounded-lg p-3 cursor-pointer transition-colors block ${
                                    selected.has(suggestion.articleId) ? 'bg-primary/10 border-primary/30' : 'bg-muted/20'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-start gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(suggestion.articleId)}
                                            onChange={() => toggleSelect(suggestion.articleId)}
                                            className="mt-1"
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <div>
                                            <div className="font-medium text-sm flex items-center gap-2">
                                                Link phrase: <Badge variant="outline">{suggestion.phrase}</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                Target: {suggestion.title} (/{suggestion.slug})
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-8"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(suggestion.slug, suggestion.phrase);
                                        }}
                                    >
                                        {copied === suggestion.slug ? (
                                            <Check className="h-3 w-3 mr-1" />
                                        ) : (
                                            <Copy className="h-3 w-3 mr-1" />
                                        )}
                                        Copy Link
                                    </Button>
                                </div>
                                <div className="text-xs bg-background p-2 rounded border font-mono text-muted-foreground ml-6">
                                    {suggestion.context}
                                </div>
                            </label>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
