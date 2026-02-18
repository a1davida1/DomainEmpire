'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Keyword {
    id: string;
    domainId: string;
    domain: string | null;
    keyword: string;
    monthlyVolume: number | null;
    cpc: number | null;
    difficulty: number | null;
    intent: string | null;
    status: string | null;
    articleId: string | null;
    opportunityScore: number;
}

interface Summary {
    totalKeywords: number;
    avgVolume: number;
    avgDifficulty: number;
    unassignedCount: number;
}

export default function KeywordsPage() {
    const [keywords, setKeywords] = useState<Keyword[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const domainIdParam = searchParams.get('domainId') ?? '';

    // Filters
    const [search, setSearch] = useState('');
    const [maxDifficulty, setMaxDifficulty] = useState<number | null>(100);
    const [minVolume, setMinVolume] = useState(0);
    const [unassignedOnly, setUnassignedOnly] = useState(false);

    const loadKeywords = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                limit: '200',
                minVolume: String(minVolume),
            });
            if (domainIdParam) params.set('domainId', domainIdParam);
            if (maxDifficulty !== null) params.set('maxDifficulty', String(maxDifficulty));
            if (unassignedOnly) params.set('unassigned', 'true');

            const res = await fetch(`/api/research/keywords?${params}`);
            if (!res.ok) throw new Error('Failed to load keywords');
            const data = await res.json();
            setKeywords(Array.isArray(data?.keywords) ? data.keywords : []);
            setSummary(data?.summary || null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [domainIdParam, maxDifficulty, minVolume, unassignedOnly]);

    useEffect(() => {
        loadKeywords();
    }, [loadKeywords]);

    const filtered = keywords.filter(kw =>
        !search || kw.keyword.toLowerCase().includes(search.toLowerCase())
        || kw.domain?.toLowerCase().includes(search.toLowerCase())
    );

    const intentColors: Record<string, string> = {
        informational: 'bg-blue-100 text-blue-800',
        transactional: 'bg-green-100 text-green-800',
        commercial: 'bg-yellow-100 text-yellow-800',
        navigational: 'bg-purple-100 text-purple-800',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Keywords</h1>
                    <p className="text-muted-foreground">Track and manage keyword opportunities across domains</p>
                </div>
                <Button onClick={loadKeywords} disabled={loading}>
                    {loading ? 'Loading...' : 'Refresh'}
                </Button>
            </div>

            {/* Summary Stats */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold">{summary.totalKeywords}</p>
                            <p className="text-sm text-muted-foreground">Total Keywords</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold">{summary?.avgVolume?.toLocaleString() ?? '—'}</p>
                            <p className="text-sm text-muted-foreground">Avg Volume</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold">{summary.avgDifficulty}</p>
                            <p className="text-sm text-muted-foreground">Avg Difficulty</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold text-orange-600">{summary.unassignedCount}</p>
                            <p className="text-sm text-muted-foreground">No Article</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-sm text-muted-foreground mb-1 block">Search</label>
                            <Input
                                placeholder="Filter by keyword or domain..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="w-32">
                            <label className="text-sm text-muted-foreground mb-1 block">Max Difficulty</label>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                value={maxDifficulty ?? ''}
                                onChange={e => {
                                    const val = parseInt(e.target.value);
                                    if (isNaN(val)) {
                                        setMaxDifficulty(null);
                                    } else {
                                        setMaxDifficulty(Math.max(0, Math.min(100, val)));
                                    }
                                }}
                            />
                        </div>
                        <div className="w-32">
                            <label className="text-sm text-muted-foreground mb-1 block">Min Volume</label>
                            <Input
                                type="number"
                                min={0}
                                value={minVolume}
                                onChange={e => setMinVolume(Number(e.target.value))}
                            />
                        </div>
                        <label className="flex items-center gap-2 pb-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={unassignedOnly}
                                onChange={e => setUnassignedOnly(e.target.checked)}
                            />
                            <span className="text-sm">No article only</span>
                        </label>
                    </div>
                </CardContent>
            </Card>

            {/* Error */}
            {error && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>
            )}

            {/* Keywords Table */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        {filtered.length} Keyword{filtered.length !== 1 ? 's' : ''}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left p-3">Keyword</th>
                                    <th className="text-left p-3">Domain</th>
                                    <th className="text-right p-3">Volume</th>
                                    <th className="text-right p-3">Difficulty</th>
                                    <th className="text-right p-3">CPC</th>
                                    <th className="text-left p-3">Intent</th>
                                    <th className="text-left p-3">Status</th>
                                    <th className="text-right p-3">Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                            {loading ? 'Loading keywords...' : 'No keywords found matching filters.'}
                                        </td>
                                    </tr>
                                ) : filtered.map(kw => (
                                    <tr key={kw.id} className="border-t hover:bg-muted/30">
                                        <td className="p-3 font-medium">{kw.keyword}</td>
                                        <td className="p-3 text-muted-foreground">{kw.domain || '—'}</td>
                                        <td className="p-3 text-right">{kw.monthlyVolume?.toLocaleString() || '—'}</td>
                                        <td className="p-3 text-right">
                                            {kw.difficulty != null ? (
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${kw.difficulty <= 30 ? 'bg-green-100 text-green-800' :
                                                    kw.difficulty <= 60 ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-red-100 text-red-800'
                                                    }`}>
                                                    {kw.difficulty}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="p-3 text-right">
                                            {kw.cpc != null ? `$${Number(kw.cpc).toFixed(2)}` : '—'}
                                        </td>
                                        <td className="p-3">
                                            {kw.intent ? (
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${intentColors[kw.intent] || 'bg-gray-100 text-gray-600'}`}>
                                                    {kw.intent}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="p-3">
                                            {kw.articleId ? (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                                    has article
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                                    no article
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-right">
                                            <span className="px-2 py-1 rounded bg-primary/10 text-primary font-mono text-xs font-bold">
                                                {kw.opportunityScore}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
