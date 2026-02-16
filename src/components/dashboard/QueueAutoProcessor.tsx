'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const AUTO_INTERVAL_MS = 10_000;
const AUTO_ENABLED_KEY = 'queue_auto_processor_enabled';
const AUTO_MAX_JOBS_KEY = 'queue_auto_processor_max_jobs';

type QueueProcessResponse = {
    processed?: number;
    failed?: number;
    staleLocksCleaned?: number;
};

export function QueueAutoProcessor({ defaultMaxJobs = 10 }: { defaultMaxJobs?: number }) {
    const router = useRouter();
    const [enabled, setEnabled] = useState(false);
    const [running, setRunning] = useState(false);
    const [maxJobs, setMaxJobs] = useState(defaultMaxJobs);
    const [lastRunAt, setLastRunAt] = useState<string | null>(null);
    const [lastResult, setLastResult] = useState('idle');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const storedEnabled = window.localStorage.getItem(AUTO_ENABLED_KEY);
        const storedMaxJobs = window.localStorage.getItem(AUTO_MAX_JOBS_KEY);
        if (storedEnabled === '1') {
            setEnabled(true);
        }
        if (storedMaxJobs) {
            const parsed = Number.parseInt(storedMaxJobs, 10);
            if (Number.isFinite(parsed)) {
                setMaxJobs(Math.max(1, Math.min(parsed, 50)));
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(AUTO_ENABLED_KEY, enabled ? '1' : '0');
    }, [enabled]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(AUTO_MAX_JOBS_KEY, String(maxJobs));
    }, [maxJobs]);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const run = async () => {
            if (cancelled) return;
            setRunning(true);
            try {
                const response = await fetch('/api/queue/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ maxJobs }),
                });
                const body = (await response.json().catch(() => ({}))) as QueueProcessResponse & { error?: string };
                if (!response.ok) {
                    throw new Error(body.error || `Failed to process queue (${response.status})`);
                }

                const processed = typeof body.processed === 'number' ? body.processed : 0;
                const failed = typeof body.failed === 'number' ? body.failed : 0;
                const staleLocks = typeof body.staleLocksCleaned === 'number' ? body.staleLocksCleaned : 0;

                setLastResult(`processed ${processed}, failed ${failed}, stale locks ${staleLocks}`);
                setError(null);
                if (processed > 0 || failed > 0 || staleLocks > 0) {
                    router.refresh();
                }
            } catch (runError) {
                setError(runError instanceof Error ? runError.message : 'Auto-processing failed');
            } finally {
                setLastRunAt(new Date().toLocaleTimeString());
                setRunning(false);
                if (!cancelled) {
                    timer = setTimeout(run, AUTO_INTERVAL_MS);
                }
            }
        };

        timer = setTimeout(run, 300);

        return () => {
            cancelled = true;
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [enabled, maxJobs, router]);

    return (
        <div className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setEnabled((current) => !current)}
                    className={`rounded px-3 py-1.5 text-white ${enabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'}`}
                >
                    {enabled ? 'Auto-Run On' : 'Auto-Run Off'}
                </button>
                <label htmlFor="queue-auto-max-jobs" className="text-muted-foreground">jobs/run</label>
                <input
                    id="queue-auto-max-jobs"
                    type="number"
                    min={1}
                    max={50}
                    value={maxJobs}
                    onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(parsed)) return;
                        setMaxJobs(Math.max(1, Math.min(parsed, 50)));
                    }}
                    className="w-20 rounded border px-2 py-1.5"
                />
                <span className="text-xs text-muted-foreground">
                    interval {Math.round(AUTO_INTERVAL_MS / 1000)}s
                </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
                status: {running ? 'processing...' : enabled ? 'waiting for next run' : 'paused'}
                {lastRunAt ? ` • last run ${lastRunAt}` : ''}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
                Auto-run preference is saved in this browser.
            </p>
            <p className="mt-1 text-xs">{lastResult}</p>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}
