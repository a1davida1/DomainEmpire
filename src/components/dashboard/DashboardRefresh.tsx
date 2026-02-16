'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export function DashboardRefresh() {
    const router = useRouter();
    const [loadedAt] = useState(() => new Date());
    const [ago, setAgo] = useState('just now');
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        const tick = () => {
            const diff = Math.floor((Date.now() - loadedAt.getTime()) / 1000);
            if (diff < 60) setAgo(`${diff}s ago`);
            else if (diff < 3600) setAgo(`${Math.floor(diff / 60)}m ago`);
            else setAgo(`${Math.floor(diff / 3600)}h ago`);
        };
        tick();
        const id = setInterval(tick, 10_000);
        return () => clearInterval(id);
    }, [loadedAt]);

    function refresh() {
        setRefreshing(true);
        router.refresh();
        setTimeout(() => setRefreshing(false), 1000);
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{ago}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} title="Refresh data">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
        </div>
    );
}
