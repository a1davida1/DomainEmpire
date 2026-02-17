'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

const CONTENT_TYPES = [
    { value: 'article', label: 'Article', description: 'Standard long-form blog post or informational article' },
    { value: 'comparison', label: 'Comparison', description: 'Side-by-side product or service comparison' },
    { value: 'calculator', label: 'Calculator', description: 'Interactive calculator with dynamic inputs' },
    { value: 'cost_guide', label: 'Cost Guide', description: 'Pricing breakdown and cost estimation guide' },
    { value: 'lead_capture', label: 'Lead Capture', description: 'Content optimized for lead generation' },
    { value: 'health_decision', label: 'Health Decision', description: 'Health-related decision support tool' },
    { value: 'checklist', label: 'Checklist', description: 'Step-by-step actionable checklist' },
    { value: 'faq', label: 'FAQ', description: 'Frequently asked questions page' },
    { value: 'review', label: 'Review', description: 'In-depth product or service review' },
    { value: 'wizard', label: 'Wizard', description: 'Multi-step interactive decision wizard' },
    { value: 'configurator', label: 'Configurator', description: 'Visual product or plan configurator' },
    { value: 'quiz', label: 'Quiz', description: 'Interactive quiz with scored results' },
    { value: 'survey', label: 'Survey', description: 'User survey with aggregated insights' },
    { value: 'assessment', label: 'Assessment', description: 'Self-assessment tool with personalized results' },
    { value: 'interactive_infographic', label: 'Interactive Infographic', description: 'Data visualization with interactive elements' },
    { value: 'interactive_map', label: 'Interactive Map', description: 'Geographic or conceptual interactive map' },
] as const;

type Domain = {
    id: string;
    domain: string;
    niche: string | null;
};

export default function NewArticlePage() {
    const router = useRouter();
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loadingDomains, setLoadingDomains] = useState(true);

    const [domainId, setDomainId] = useState('');
    const [contentType, setContentType] = useState('article');
    const [targetKeyword, setTargetKeyword] = useState('');
    const [secondaryKeywords, setSecondaryKeywords] = useState('');
    const [priority, setPriority] = useState(5);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/domains?limit=500')
            .then((res) => res.json())
            .then((data) => {
                if (data.domains) setDomains(data.domains);
            })
            .catch(() => setError('Failed to load domains'))
            .finally(() => setLoadingDomains(false));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!domainId) {
            setError('Please select a domain');
            return;
        }
        if (!targetKeyword.trim()) {
            setError('Please enter a target keyword');
            return;
        }

        setSubmitting(true);
        try {
            const body = {
                domainId,
                targetKeyword: targetKeyword.trim(),
                contentType,
                priority,
                secondaryKeywords: secondaryKeywords
                    .split(',')
                    .map((kw) => kw.trim())
                    .filter(Boolean),
            };

            const res = await fetch('/api/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const result = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(result.error || `Failed to create article (${res.status})`);
            }

            const newId = result.article?.id;
            if (newId) {
                router.push(`/dashboard/content/articles/${newId}`);
            } else {
                router.push('/dashboard/content/articles');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create article');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center gap-3">
                <Link href="/dashboard/content/articles">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">New Content</h1>
                    <p className="text-muted-foreground">
                        Create a new article or interactive page. The AI pipeline will generate an outline, then a draft.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Target</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="domain">Domain</Label>
                            {loadingDomains ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading domains...
                                </div>
                            ) : (
                                <select
                                    id="domain"
                                    value={domainId}
                                    onChange={(e) => setDomainId(e.target.value)}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    required
                                >
                                    <option value="">Select a domain...</option>
                                    {domains.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.domain}{d.niche ? ` (${d.niche})` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="targetKeyword">Target Keyword</Label>
                            <Input
                                id="targetKeyword"
                                value={targetKeyword}
                                onChange={(e) => setTargetKeyword(e.target.value)}
                                placeholder="e.g. best retirement plans 2026"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="secondaryKeywords">Secondary Keywords (comma-separated, optional)</Label>
                            <Input
                                id="secondaryKeywords"
                                value={secondaryKeywords}
                                onChange={(e) => setSecondaryKeywords(e.target.value)}
                                placeholder="e.g. 401k rollover, IRA comparison, retirement savings"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Content Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {CONTENT_TYPES.map((ct) => (
                                <label
                                    key={ct.value}
                                    className={`flex cursor-pointer rounded-lg border p-3 transition-colors ${
                                        contentType === ct.value
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                                            : 'hover:bg-muted/50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="contentType"
                                        value={ct.value}
                                        checked={contentType === ct.value}
                                        onChange={() => setContentType(ct.value)}
                                        className="sr-only"
                                    />
                                    <div>
                                        <div className="text-sm font-medium">{ct.label}</div>
                                        <div className="text-xs text-muted-foreground">{ct.description}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Options</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Label htmlFor="priority">Priority (1 = low, 10 = high)</Label>
                            <div className="flex items-center gap-3">
                                <input
                                    id="priority"
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={priority}
                                    onChange={(e) => setPriority(Number(e.target.value))}
                                    className="flex-1"
                                />
                                <span className="w-8 text-center text-sm font-medium">{priority}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                    </div>
                )}

                <div className="flex gap-3">
                    <Button type="submit" disabled={submitting}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {submitting ? 'Creating...' : 'Create & Generate'}
                    </Button>
                    <Link href="/dashboard/content/articles">
                        <Button type="button" variant="outline">Cancel</Button>
                    </Link>
                </div>
            </form>
        </div>
    );
}
