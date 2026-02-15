'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';

interface ClassifyDomainsButtonProps {
    mode: 'all' | 'single';
    domainId?: string;
    label?: string;
    onComplete?: () => void;
}

export function ClassifyDomainsButton({ mode, domainId, label, onComplete }: ClassifyDomainsButtonProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ classified: number; errors: number } | null>(null);

    async function handleClassify() {
        setLoading(true);
        setResult(null);
        try {
            const body = mode === 'single' && domainId
                ? { domainId }
                : { all: true, limit: 30 };

            const response = await fetch('/api/domains/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Classification failed');
            }

            const data = await response.json();

            if (mode === 'single') {
                setResult({ classified: 1, errors: 0 });
            } else {
                setResult({ classified: data.classified ?? 0, errors: data.errors ?? 0 });
            }

            // Small delay so user sees result before refresh
            const refreshFn = onComplete ?? (() => router.refresh());
            setTimeout(refreshFn, 800);
        } catch (err) {
            setResult({ classified: 0, errors: 1 });
            console.error('Classification error:', err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                size={mode === 'single' ? 'sm' : 'default'}
                onClick={handleClassify}
                disabled={loading}
            >
                {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                )}
                {label || (mode === 'single' ? 'AI Classify' : 'AI Classify All')}
            </Button>
            {result && !loading && (
                <span className="text-xs text-muted-foreground">
                    {result.classified > 0
                        ? `✓ ${result.classified} classified`
                        : result.errors > 0
                            ? '✗ Failed'
                            : 'Nothing to classify'}
                    {result.errors > 0 && result.classified > 0
                        ? ` (${result.errors} errors)`
                        : ''}
                </span>
            )}
        </div>
    );
}
