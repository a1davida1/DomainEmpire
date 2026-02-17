'use client';

import { useState, useEffect, useRef } from 'react';

export interface QueueStreamData {
    timestamp: string;
    queue: {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        cancelled: number;
        total: number;
    };
    worker: {
        running: boolean;
        crashCount: number;
        uptimeMs: number;
        shuttingDown: boolean;
    };
    pool: {
        max: number;
        active: number;
        utilization: number;
        warning: boolean;
    };
}

interface UseQueueStreamOptions {
    enabled?: boolean;
}

/**
 * Hook that connects to the SSE queue stream and provides real-time stats.
 * Automatically reconnects on disconnection with exponential backoff.
 */
export function useQueueStream(options?: UseQueueStreamOptions) {
    const { enabled = true } = options ?? {};
    const [data, setData] = useState<QueueStreamData | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabled) return;

        function connect() {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }

            const es = new EventSource('/api/queue/stream');
            eventSourceRef.current = es;

            es.onopen = () => {
                setConnected(true);
                setError(null);
                retryCountRef.current = 0;
            };

            es.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data) as QueueStreamData;
                    setData(parsed);
                } catch {
                    // Ignore parse errors (e.g. keepalive comments)
                }
            };

            es.onerror = () => {
                es.close();
                eventSourceRef.current = null;
                setConnected(false);

                // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
                const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30_000);
                retryCountRef.current++;
                setError(`Disconnected. Reconnecting in ${(delay / 1000).toFixed(0)}s...`);

                retryTimerRef.current = setTimeout(connect, delay);
            };
        }

        connect();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (retryTimerRef.current) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };
    }, [enabled]);

    return { data, connected, error };
}
