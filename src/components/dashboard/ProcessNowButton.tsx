'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ProcessResult = {
    processed?: number;
    failed?: number;
    staleLocksCleaned?: number;
    transientRetriesQueued?: number;
    error?: string;
};

export function ProcessNowButton({ defaultMaxJobs = 25 }: { defaultMaxJobs?: number }) {
    const router = useRouter();
    const [maxJobs, setMaxJobs] = useState(defaultMaxJobs);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<ProcessResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleProcess = async () => {
        setRunning(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch('/api/queue/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxJobs }),
            });

            const body = (await res.json().catch(() => ({}))) as ProcessResult;

            if (!res.ok) {
                throw new Error(body.error || `Processing failed (${res.status})`);
            }

            setResult(body);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Processing failed');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <input
                type="number"
                value={maxJobs}
                onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    if (Number.isFinite(parsed)) setMaxJobs(Math.max(1, Math.min(parsed, 200)));
                }}
                min={1}
                max={200}
                aria-label="Max jobs to process"
                className="w-20 rounded border px-2 py-2 text-sm"
            />
            <button
                type="button"
                onClick={handleProcess}
                disabled={running}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait flex items-center gap-2"
            >
                {running && (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                )}
                {running ? 'Processing...' : 'Process Now'}
            </button>
            {result && !error && (
                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                    {result.processed ?? 0} processed, {result.failed ?? 0} failed
                    {(result.staleLocksCleaned ?? 0) > 0 && `, ${result.staleLocksCleaned} stale locks cleaned`}
                </span>
            )}
            {error && (
                <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {error}
                </span>
            )}
        </div>
    );
}
