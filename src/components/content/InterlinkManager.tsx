'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link as LinkIcon, AlertCircle, Copy, ExternalLink, Check } from 'lucide-react';
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
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    const fetchSuggestions = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/articles/${articleId}/interlink`);
            if (!res.ok) throw new Error('Failed to fetch suggestions');
            const data = await res.json();
            setSuggestions(data.suggestions || []);
        } catch (err) {
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
                <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={loading}>
                    {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {suggestions.length === 0 && !loading && !error ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                        No obvious interlinking opportunities found.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {suggestions.map((suggestion) => (
                            <div key={suggestion.articleId} className="border rounded-lg p-3 bg-muted/20">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-medium text-sm flex items-center gap-2">
                                            Link phrase: <Badge variant="outline">{suggestion.phrase}</Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            Target: {suggestion.title} (/{suggestion.slug})
                                        </div>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-8"
                                        onClick={() => copyToClipboard(suggestion.slug, suggestion.phrase)}
                                    >
                                        {copied === suggestion.slug ? (
                                            <Check className="h-3 w-3 mr-1" />
                                        ) : (
                                            <Copy className="h-3 w-3 mr-1" />
                                        )}
                                        Copy Link
                                    </Button>
                                </div>
                                <div className="text-xs bg-background p-2 rounded border font-mono text-muted-foreground">
                                    {suggestion.context}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
