'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, RefreshCw, CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';

interface DuplicatePair {
    articleA: { id: string; title: string; wordCount: number };
    articleB: { id: string; title: string; wordCount: number };
    similarity: number;
}

interface DuplicateResult {
    domainId: string;
    totalChecked: number;
    duplicateCount: number;
    duplicates: DuplicatePair[];
}

interface Domain {
    id: string;
    domain: string;
}

export default function DuplicatesPage() {
    const [domains, setDomains] = useState<Domain[]>([]);
    const [selectedDomain, setSelectedDomain] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<DuplicateResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/domains?status=active&limit=500', { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error('Failed to load domains');
                return res.json();
            })
            .then(data => {
                if (!controller.signal.aborted && data.domains) setDomains(data.domains);
            })
            .catch(err => {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.error('Failed to load domains', err);
            });
        return () => controller.abort();
    }, []);

    const checkDuplicates = async () => {
        if (!selectedDomain) return;

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch(`/api/articles/duplicates?domainId=${selectedDomain}&threshold=0.6`);
            if (!res.ok) throw new Error('Failed to check duplicates');
            const data = await res.json();
            setResult(data);
        } catch (err) {
            setError('Failed to analyze content. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Duplicate Content Detection</h1>
                <p className="text-muted-foreground">
                    Analyze your domain&apos;s articles to find potential duplicate content issues that could hurt SEO.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Run Analysis</CardTitle>
                    <CardDescription>Select a domain to scan for internal duplicate content</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-4 items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-medium">Domain</label>
                        <Select value={selectedDomain} onValueChange={setSelectedDomain} disabled={loading}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select domain..." />
                            </SelectTrigger>
                            <SelectContent>
                                {domains.map(d => (
                                    <SelectItem key={d.id} value={d.id}>{d.domain}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={checkDuplicates} disabled={!selectedDomain || loading}>
                        {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {loading ? 'Analyzing...' : 'Scan Content'}
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {result && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Articles Scanned</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{result.totalChecked}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Duplicates Found</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${result.duplicateCount > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                    {result.duplicateCount}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Status</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {result.duplicateCount === 0 ? 'Clean' : 'Attention Needed'}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Detailed Findings</CardTitle>
                            <CardDescription>
                                {result.duplicates.length > 0
                                    ? 'Found pairs with high content similarity (>60%)'
                                    : 'No significant content duplication found.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {result.duplicates.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                                    <CheckCircle2 className="h-12 w-12 mb-4 text-green-500" />
                                    <p>Your content appears unique!</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {result.duplicates.map((dup) => (
                                        <div key={`${dup.articleA.id}-${dup.articleB.id}`} className="flex flex-col md:flex-row items-center justify-between p-4 border rounded-lg bg-muted/20">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                                    <span className="font-medium text-sm truncate max-w-[200px]">{dup.articleA.title}</span>
                                                    <span className="text-xs text-muted-foreground">({dup.articleA.wordCount} words)</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                                    <span className="font-medium text-sm truncate max-w-[200px]">{dup.articleB.title}</span>
                                                    <span className="text-xs text-muted-foreground">({dup.articleB.wordCount} words)</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 mt-4 md:mt-0">
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold text-red-500">{Math.round(dup.similarity * 100)}%</div>
                                                    <div className="text-xs text-muted-foreground">Similarity</div>
                                                </div>
                                                <Button variant="outline" size="sm" asChild>
                                                    <Link href={`/dashboard/content/articles/${dup.articleA.id}`}>
                                                        Edit <ArrowRight className="ml-2 h-3 w-3" />
                                                    </Link>
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
