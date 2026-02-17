'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-fetch';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format-utils';

interface DetectionResult {
    verdict?: 'pass' | 'marginal' | 'fail';
    burstiness?: number;
    sentenceCount?: number;
    highProbSentences?: Array<{ sentence: string; prob: number }>;
}

interface AiDetectionCardProps {
    articleId: string;
    initialScore: number | null;
    initialResult: DetectionResult | null;
    initialCheckedAt: Date | string | null;
}

const VERDICT_CONFIG = {
    pass: {
        label: 'Human-like',
        badge: 'bg-green-500/10 text-green-600 border-green-200 dark:text-green-400 dark:border-green-800',
        bar: 'bg-green-500',
        Icon: ShieldCheck,
        iconColor: 'text-green-600 dark:text-green-400',
    },
    marginal: {
        label: 'Marginal',
        badge: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
        bar: 'bg-yellow-500',
        Icon: ShieldAlert,
        iconColor: 'text-yellow-600 dark:text-yellow-400',
    },
    fail: {
        label: 'AI-detected',
        badge: 'bg-red-500/10 text-red-600 border-red-200 dark:text-red-400 dark:border-red-800',
        bar: 'bg-red-500',
        Icon: ShieldX,
        iconColor: 'text-red-600 dark:text-red-400',
    },
} as const;

function getVerdictFromScore(score: number): 'pass' | 'marginal' | 'fail' {
    if (score < 0.30) return 'pass';
    if (score < 0.50) return 'marginal';
    return 'fail';
}

export function AiDetectionCard({ articleId, initialScore, initialResult, initialCheckedAt }: AiDetectionCardProps) {
    const [score, setScore] = useState(initialScore);
    const [result, setResult] = useState<DetectionResult | null>(initialResult);
    const [checkedAt, setCheckedAt] = useState<Date | string | null>(initialCheckedAt);
    const [checking, setChecking] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const hasData = score != null && result != null;
    const verdict = hasData ? (result.verdict || getVerdictFromScore(score)) : null;
    const config = verdict ? VERDICT_CONFIG[verdict] : null;

    async function handleCheck() {
        setChecking(true);
        try {
            const res = await apiFetch(`/api/articles/${articleId}/ai-detection`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Check failed (${res.status})`);
            }
            const data = await res.json();
            setScore(data.score);
            setResult({
                verdict: data.verdict,
                burstiness: data.burstiness,
                sentenceCount: data.sentenceCount,
                highProbSentences: data.highProbSentences,
            });
            setCheckedAt(data.checkedAt);
            toast.success('AI detection check complete');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'AI detection check failed');
        } finally {
            setChecking(false);
        }
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    {config ? (
                        <config.Icon className={cn('h-4 w-4', config.iconColor)} />
                    ) : (
                        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                    )}
                    AI Detection
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {hasData && config && verdict ? (
                    <>
                        {/* Verdict badge */}
                        <Badge variant="outline" className={cn('text-xs', config.badge)}>
                            {config.label}
                        </Badge>

                        {/* Score bar */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Score</span>
                                <span className="font-bold tabular-nums">{score.toFixed(3)}</span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                    className={cn('h-full rounded-full transition-all', config.bar)}
                                    style={{ width: `${Math.round(score * 100)}%` }}
                                />
                            </div>
                        </div>

                        {/* Metrics */}
                        {result.burstiness != null && (
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Burstiness</span>
                                <span className="font-bold tabular-nums">{result.burstiness.toFixed(1)}</span>
                            </div>
                        )}
                        {result.sentenceCount != null && (
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Sentences</span>
                                <span className="font-bold tabular-nums">{result.sentenceCount}</span>
                            </div>
                        )}

                        {/* Flagged sentences */}
                        {result.highProbSentences && result.highProbSentences.length > 0 && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setExpanded(!expanded)}
                                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    {result.highProbSentences.length} flagged sentence{result.highProbSentences.length !== 1 ? 's' : ''}
                                </button>
                                {expanded && (
                                    <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
                                        {result.highProbSentences.map((s, i) => (
                                            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded border bg-muted/30">
                                                <Badge variant="outline" className="shrink-0 text-[10px] bg-red-500/10 text-red-600 dark:text-red-400 tabular-nums">
                                                    {(s.prob * 100).toFixed(0)}%
                                                </Badge>
                                                <span className="text-muted-foreground leading-relaxed">{s.sentence}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Checked timestamp */}
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Checked</span>
                            <span className="text-xs text-muted-foreground">
                                {checkedAt ? formatDate(checkedAt) : '—'}
                            </span>
                        </div>

                        {/* Re-check button */}
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={handleCheck}
                            disabled={checking}
                        >
                            {checking ? (
                                <>
                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                    Checking...
                                </>
                            ) : (
                                'Re-check'
                            )}
                        </Button>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-muted-foreground">Not yet checked</p>
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={handleCheck}
                            disabled={checking}
                        >
                            {checking ? (
                                <>
                                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                    Checking...
                                </>
                            ) : (
                                'Run Check'
                            )}
                        </Button>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
