'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const CONTENT_TYPES = [
    { key: 'article', label: 'Article', desc: 'Standard informational articles' },
    { key: 'comparison', label: 'Comparison', desc: 'Side-by-side product or service comparisons' },
    { key: 'calculator', label: 'Calculator', desc: 'Interactive calculator tools' },
    { key: 'configurator', label: 'Configurator', desc: 'Product/plan configurators with selectable options' },
    { key: 'quiz', label: 'Quiz', desc: 'Interactive quiz flows with scored outcomes' },
    { key: 'survey', label: 'Survey', desc: 'User surveys and questionnaires with submission capture' },
    { key: 'assessment', label: 'Assessment', desc: 'Self-assessment and eligibility scoring tools' },
    { key: 'interactive_infographic', label: 'Infographic', desc: 'Interactive data cards and visual breakdowns' },
    { key: 'interactive_map', label: 'Interactive Map', desc: 'Region/state-aware map-style guidance pages' },
    { key: 'cost_guide', label: 'Cost Guide', desc: 'Pricing and cost breakdown guides' },
    { key: 'lead_capture', label: 'Lead Capture', desc: 'Lead generation pages with forms' },
    { key: 'checklist', label: 'Checklist', desc: 'Step-by-step checklist pages' },
    { key: 'faq', label: 'FAQ', desc: 'Frequently asked questions pages' },
    { key: 'review', label: 'Review', desc: 'Product or service reviews' },
    { key: 'wizard', label: 'Wizard', desc: 'Multi-step decision-making tools' },
    { key: 'guide', label: 'Guide', desc: 'Long-form comprehensive guides' },
] as const;

interface ContentTypeConfigProps {
    domainId: string;
    currentMix: Record<string, number> | null;
}

export default function ContentTypeConfig({ domainId, currentMix }: ContentTypeConfigProps) {
    const [mix, setMix] = useState<Record<string, number>>(() => {
        if (currentMix && Object.keys(currentMix).length > 0) return { ...currentMix };
        return { article: 60, comparison: 20, guide: 20 };
    });
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [seeding, setSeeding] = useState(false);
    const [seedResult, setSeedResult] = useState<string | null>(null);
    const [articleCount, setArticleCount] = useState(5);

    const total = Object.values(mix).reduce((sum, v) => sum + v, 0);

    function updateType(key: string, value: number) {
        setMix(prev => {
            const next = { ...prev };
            if (value <= 0) {
                delete next[key];
            } else {
                next[key] = value;
            }
            return next;
        });
        setSaved(false);
    }

    async function saveMix() {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/domains/${domainId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contentConfig: { contentTypeMix: mix },
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save');
            }
            setSaved(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Save failed';
            setError(message);
            throw err; // Propagate error so seedContent knows it failed
        } finally {
            setSaving(false);
        }
    }

    async function seedContent() {
        setSeeding(true);
        setSeedResult(null);
        setError(null);
        try {
            // Save config first
            try {
                await saveMix();
            } catch {
                throw new Error('Failed to save configuration before seeding');
            }

            const res = await fetch('/api/domains/bulk-seed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domainIds: [domainId],
                    articleCount,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Seeding failed');
            }
            const data = await res.json();
            setSeedResult(`Queued ${data.totalArticlesEstimate} articles for generation`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Seeding failed');
        } finally {
            setSeeding(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Content Type Mix</CardTitle>
                <CardDescription>Configure what types of content to generate for this domain</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    {CONTENT_TYPES.map(ct => {
                        const value = mix[ct.key] || 0;
                        const isActive = value > 0;
                        return (
                            <div key={ct.key} className="flex items-center gap-3">
                                <label className="flex items-center gap-2 w-36 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={e => updateType(ct.key, e.target.checked ? 10 : 0)}
                                    />
                                    <span className="text-sm font-medium">{ct.label}</span>
                                </label>
                                {isActive && (
                                    <input
                                        type="range"
                                        min={5}
                                        max={100}
                                        step={5}
                                        value={value}
                                        onChange={e => updateType(ct.key, Number(e.target.value))}
                                        className="flex-1"
                                    />
                                )}
                                {isActive && (
                                    <span className="text-sm font-mono w-12 text-right">
                                        {total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`}
                                    </span>
                                )}
                                <span className="text-xs text-muted-foreground hidden md:block w-48">
                                    {ct.desc}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-center gap-3 pt-2 border-t">
                    <Button onClick={saveMix} disabled={saving} variant="outline" size="sm">
                        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Mix'}
                    </Button>

                    <div className="flex items-center gap-2 ml-auto">
                        <label className="text-sm text-muted-foreground">Articles:</label>
                        <select
                            value={articleCount}
                            onChange={e => setArticleCount(Number(e.target.value))}
                            className="px-2 py-1 border rounded text-sm bg-background"
                        >
                            {[1, 3, 5, 10].map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                        <Button onClick={seedContent} disabled={seeding} size="sm">
                            {seeding ? 'Queuing...' : 'Generate Content'}
                        </Button>
                    </div>
                </div>

                {seedResult && (
                    <div className="p-3 bg-emerald-50 text-emerald-800 rounded text-sm">{seedResult}</div>
                )}
                {error && (
                    <div className="p-3 bg-destructive/10 text-destructive rounded text-sm">{error}</div>
                )}
            </CardContent>
        </Card>
    );
}
