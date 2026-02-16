'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const PROCESS_INTERVAL_MS = 15_000;
const LEASE_TTL_MS = 45_000;
const LEASE_KEY = 'queue_background_processor_lease_v1';
const ENABLED_KEY = 'queue_auto_processor_enabled';
const MAX_JOBS_KEY = 'queue_auto_processor_max_jobs';
const TAB_ID_KEY = 'queue_background_processor_tab_id';
const DEFAULT_MAX_JOBS = 10;

type QueueStatsPayload = {
    stats?: {
        pending?: number;
        processing?: number;
        failed?: number;
    };
};

type QueueLease = {
    owner: string;
    expiresAt: number;
};

function parseLease(raw: string | null): QueueLease | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<QueueLease>;
        if (typeof parsed.owner !== 'string') return null;
        if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) return null;
        return {
            owner: parsed.owner,
            expiresAt: parsed.expiresAt,
        };
    } catch {
        return null;
    }
}

function ensureTabId(): string {
    const existing = window.localStorage.getItem(TAB_ID_KEY);
    if (existing && existing.trim().length > 0) {
        return existing;
    }
    const generated = `tab-${crypto.randomUUID()}`;
    window.localStorage.setItem(TAB_ID_KEY, generated);
    return generated;
}

function acquireLease(owner: string): boolean {
    const now = Date.now();
    const current = parseLease(window.localStorage.getItem(LEASE_KEY));
    if (current && current.owner !== owner && current.expiresAt > now) {
        return false;
    }

    const nextLease: QueueLease = {
        owner,
        expiresAt: now + LEASE_TTL_MS,
    };
    window.localStorage.setItem(LEASE_KEY, JSON.stringify(nextLease));
    const verify = parseLease(window.localStorage.getItem(LEASE_KEY));
    return verify?.owner === owner;
}

function releaseLease(owner: string): void {
    const current = parseLease(window.localStorage.getItem(LEASE_KEY));
    if (!current || current.owner !== owner) {
        return;
    }
    window.localStorage.removeItem(LEASE_KEY);
}

export function QueueBackgroundProcessor() {
    const pathname = usePathname();
    const runningRef = useRef(false);
    const tabIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const stored = window.localStorage.getItem(ENABLED_KEY);
        if (stored === null) {
            window.localStorage.setItem(ENABLED_KEY, '1');
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        tabIdRef.current = tabIdRef.current ?? ensureTabId();
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const runTick = async () => {
            if (cancelled || runningRef.current) {
                timer = setTimeout(runTick, PROCESS_INTERVAL_MS);
                return;
            }
            if (document.visibilityState === 'hidden') {
                timer = setTimeout(runTick, PROCESS_INTERVAL_MS);
                return;
            }
            const enabled = window.localStorage.getItem(ENABLED_KEY) === '1';
            if (!enabled) {
                timer = setTimeout(runTick, PROCESS_INTERVAL_MS);
                return;
            }
            if (pathname.startsWith('/dashboard/queue')) {
                timer = setTimeout(runTick, PROCESS_INTERVAL_MS);
                return;
            }

            const tabId = tabIdRef.current;
            if (!tabId) {
                timer = setTimeout(runTick, PROCESS_INTERVAL_MS);
                return;
            }

            if (!acquireLease(tabId)) {
                timer = setTimeout(runTick, PROCESS_INTERVAL_MS);
                return;
            }

            runningRef.current = true;
            try {
                const statsRes = await fetch('/api/queue/process', { cache: 'no-store' });
                if (!statsRes.ok) {
                    return;
                }

                const payload = (await statsRes.json().catch(() => ({}))) as QueueStatsPayload;
                const pending = payload.stats?.pending ?? 0;
                const processing = payload.stats?.processing ?? 0;
                const failed = payload.stats?.failed ?? 0;
                if (processing > 0) {
                    return;
                }

                const rawMaxJobs = Number.parseInt(window.localStorage.getItem(MAX_JOBS_KEY) ?? '', 10);
                const maxJobs = Number.isFinite(rawMaxJobs)
                    ? Math.max(1, Math.min(rawMaxJobs, 50))
                    : DEFAULT_MAX_JOBS;

                if (pending <= 0 && failed > 0) {
                    const retryLimit = Math.max(1, Math.min(maxJobs, 5));
                    const retryRes = await fetch('/api/queue/retry', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ limit: retryLimit, mode: 'transient' }),
                    });
                    if (retryRes.ok) {
                        const retryPayload = (await retryRes.json().catch(() => ({}))) as { retriedCount?: number };
                        if ((retryPayload.retriedCount ?? 0) <= 0) {
                            return;
                        }
                    } else {
                        return;
                    }
                } else if (pending <= 0) {
                    return;
                }

                await fetch('/api/queue/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ maxJobs }),
                });
            } catch (error) {
                console.warn('Background queue processor tick failed:', error);
            } finally {
                runningRef.current = false;
                if (!cancelled) {
                    timer = setTimeout(runTick, PROCESS_INTERVAL_MS);
                }
            }
        };

        timer = setTimeout(runTick, 1_000);

        return () => {
            cancelled = true;
            if (timer) {
                clearTimeout(timer);
            }
            runningRef.current = false;
            const tabId = tabIdRef.current;
            if (tabId) {
                releaseLease(tabId);
            }
        };
    }, [pathname]);

    return null;
}
