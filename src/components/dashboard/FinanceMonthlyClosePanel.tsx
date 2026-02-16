'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type DomainOption = {
    id: string;
    domain: string;
};

type CloseSummary = {
    domainId: string;
    month: string;
    revenueTotal: number;
    costTotal: number;
    netTotal: number;
    marginPct: number | null;
    entryCount: number;
};

function defaultMonthValue(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

export function FinanceMonthlyClosePanel({ domains }: { domains: DomainOption[] }) {
    const router = useRouter();
    const [domainId, setDomainId] = useState<string>(domains[0]?.id ?? '');
    const [month, setMonth] = useState<string>(defaultMonthValue());
    const [notes, setNotes] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [summary, setSummary] = useState<CloseSummary | null>(null);

    const domainLookup = useMemo(
        () => new Map(domains.map((row) => [row.id, row.domain])),
        [domains],
    );

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!domainId) {
            setError('Choose a domain first.');
            return;
        }

        setSubmitting(true);
        setError(null);
        setMessage(null);

        try {
            const response = await fetch('/api/finance/monthly-close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domainId,
                    month,
                    notes: notes.trim().length > 0 ? notes.trim() : undefined,
                }),
            });
            const body = await response.json().catch(() => ({})) as {
                error?: string;
                summary?: CloseSummary;
            };

            if (!response.ok) {
                throw new Error(body.error || `Monthly close failed (${response.status})`);
            }

            const nextSummary = body.summary ?? null;
            setSummary(nextSummary);
            setMessage(nextSummary
                ? `Closed ${domainLookup.get(nextSummary.domainId) ?? 'domain'} for ${nextSummary.month}.`
                : 'Monthly close completed.');
            router.refresh();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Failed to run monthly close');
        } finally {
            setSubmitting(false);
        }
    }

    if (domains.length === 0) {
        return (
            <div className="rounded-lg border bg-card p-4">
                <h2 className="text-lg font-semibold">Run Monthly Close</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                    Add at least one domain before running monthly close snapshots.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-lg border bg-card p-4 space-y-3">
            <div>
                <h2 className="text-lg font-semibold">Run Monthly Close</h2>
                <p className="text-sm text-muted-foreground">
                    Snapshot ledger P&amp;L for a domain month. Requires expert/admin role.
                </p>
            </div>

            {(error || message) && (
                <div className={`rounded border px-3 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                    {error || message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-4">
                <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Domain</span>
                    <select
                        value={domainId}
                        onChange={(event) => setDomainId(event.target.value)}
                        className="w-full rounded border bg-background px-3 py-2 text-sm"
                    >
                        {domains.map((row) => (
                            <option key={row.id} value={row.id}>{row.domain}</option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Month (YYYY-MM)</span>
                    <Input
                        value={month}
                        onChange={(event) => setMonth(event.target.value)}
                        pattern="^\d{4}-\d{2}$"
                        placeholder="2026-02"
                    />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-muted-foreground">Notes (optional)</span>
                    <Input
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Close notes for audit trail"
                    />
                </label>
                <div className="md:col-span-4 flex items-center gap-2">
                    <Button type="submit" disabled={submitting}>
                        {submitting ? 'Running...' : 'Run Close Snapshot'}
                    </Button>
                </div>
            </form>

            {summary && (
                <div className="rounded border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">
                        {domainLookup.get(summary.domainId) ?? summary.domainId} · {summary.month}
                    </p>
                    <p className="text-muted-foreground">
                        Revenue ${summary.revenueTotal.toFixed(2)} · Cost ${summary.costTotal.toFixed(2)} · Net ${summary.netTotal.toFixed(2)}
                        {summary.marginPct !== null ? ` · Margin ${summary.marginPct.toFixed(2)}%` : ''}
                        {' '}· Entries {summary.entryCount}
                    </p>
                </div>
            )}
        </div>
    );
}
