'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ResearchResult {
    cached: boolean;
    score: number;
    domain: string;
    tld: string;
    isAvailable: boolean;
    registrationPrice: number;
    aftermarketPrice: number | null;
    keywordVolume: number;
    keywordCpc: number;
    estimatedRevenuePotential: number;
    backlinks: number;
    domainAuthority: number;
    nicheRelevance: number;
}

interface KeywordOpportunity {
    id: string;
    domain: string;
    keyword: string;
    monthlyVolume: number;
    difficulty: number;
    cpc: number;
    intent: string;
    opportunityScore: number;
}

export default function ResearchPage() {
    const [domainInput, setDomainInput] = useState('');
    const [tld, setTld] = useState('com');
    const [researching, setResearching] = useState(false);
    const [result, setResult] = useState<ResearchResult | null>(null);
    const [keywords, setKeywords] = useState<KeywordOpportunity[]>([]);
    const [loadingKeywords, setLoadingKeywords] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function researchDomain() {
        if (!domainInput.trim()) return;
        setResearching(true);
        setResult(null);
        setError(null);

        try {
            const res = await fetch('/api/research/domains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: domainInput.trim(), tld }),
            });

            const data = await res.json();

            if (res.ok) {
                setResult(data);
            } else {
                setError(data.error || 'Research failed');
            }
        } catch (err) {
            console.error('Research failed:', err);
            setError(err instanceof Error ? err.message : 'An error occurred during research');
        } finally {
            setResearching(false);
        }
    }

    async function loadKeywordOpportunities() {
        setLoadingKeywords(true);
        try {
            const res = await fetch('/api/research/keywords?unassigned=true&maxDifficulty=40&limit=20');
            if (res.ok) {
                const data = await res.json();
                setKeywords(Array.isArray(data?.keywords) ? data.keywords : []);
            }
        } catch (error) {
            console.error('Failed to load keywords:', error);
        } finally {
            setLoadingKeywords(false);
        }
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Research & Intelligence</h1>
                <p className="text-zinc-400">Discover domain and keyword opportunities</p>
            </div>

            {/* Domain Research */}
            <Card className="bg-zinc-900/50">
                <CardHeader>
                    <CardTitle>Domain Research</CardTitle>
                    <CardDescription>Check availability, value, and potential</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Enter domain name (without TLD)"
                            value={domainInput}
                            onChange={e => setDomainInput(e.target.value)}
                            className="flex-1"
                            onKeyDown={e => e.key === 'Enter' && researchDomain()}
                        />
                        <select
                            value={tld}
                            onChange={e => setTld(e.target.value)}
                            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg"
                        >
                            <option value="com">.com</option>
                            <option value="net">.net</option>
                            <option value="org">.org</option>
                            <option value="io">.io</option>
                            <option value="co">.co</option>
                        </select>
                        <Button onClick={researchDomain} disabled={researching}>
                            {researching ? 'Researching...' : 'Research'}
                        </Button>
                    </div>

                    {error && (
                        <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {result && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-zinc-800">
                            <div className="text-center">
                                <div className={`text-3xl font-bold ${result.isAvailable ? 'text-green-400' : 'text-red-400'}`}>
                                    {result.isAvailable ? '✓' : '✗'}
                                </div>
                                <div className="text-sm text-zinc-400">
                                    {result.isAvailable ? 'Available' : 'Taken'}
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-yellow-400">{result.score}</div>
                                <div className="text-sm text-zinc-400">Score</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold">{result.keywordVolume.toLocaleString()}</div>
                                <div className="text-sm text-zinc-400">Monthly Searches</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">${result.estimatedRevenuePotential}</div>
                                <div className="text-sm text-zinc-400">Est. Monthly</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl">${result.registrationPrice}</div>
                                <div className="text-sm text-zinc-400">Reg Price</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl">${result.keywordCpc}</div>
                                <div className="text-sm text-zinc-400">CPC</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl">{result.domainAuthority}</div>
                                <div className="text-sm text-zinc-400">DA</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl">{result.backlinks}</div>
                                <div className="text-sm text-zinc-400">Backlinks</div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Keyword Opportunities */}
            <Card className="bg-zinc-900/50">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Keyword Opportunities</CardTitle>
                        <CardDescription>Low difficulty, high volume keywords</CardDescription>
                    </div>
                    <Button variant="outline" onClick={loadKeywordOpportunities} disabled={loadingKeywords}>
                        {loadingKeywords ? 'Loading...' : 'Find Opportunities'}
                    </Button>
                </CardHeader>
                <CardContent>
                    {keywords.length === 0 ? (
                        <p className="text-zinc-500 text-center py-8">
                            Click &quot;Find Opportunities&quot; to discover keywords
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {keywords.map(kw => (
                                <div
                                    key={kw.id}
                                    className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
                                >
                                    <div>
                                        <span className="font-medium">{kw.keyword}</span>
                                        <span className="text-xs text-zinc-500 ml-2">{kw.domain}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span title="Monthly Volume">{kw.monthlyVolume?.toLocaleString() || 0}</span>
                                        <span title="Difficulty" className="text-yellow-400">D:{kw.difficulty || 0}</span>
                                        <span title="CPC" className="text-green-400">${kw.cpc || 0}</span>
                                        <span
                                            className="px-2 py-1 rounded bg-blue-900/50 text-blue-300 font-mono text-xs"
                                            title="Opportunity Score"
                                        >
                                            {kw.opportunityScore}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
