'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 15_000;

export function QueueHealthPoller() {
    const router = useRouter();
    const [lastRefresh, setLastRefresh] = useState<string | null>(null);

    useEffect(() => {
        const timer = setInterval(() => {
            router.refresh();
            setLastRefresh(new Date().toLocaleTimeString());
        }, POLL_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [router]);

    return (
        <span className="text-[11px] text-muted-foreground">
            Auto-refreshing every {Math.round(POLL_INTERVAL_MS / 1000)}s
            {lastRefresh && ` · updated ${lastRefresh}`}
        </span>
    );
}
