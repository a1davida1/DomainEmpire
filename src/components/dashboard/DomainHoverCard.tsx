'use client';

import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DomainHoverCardProps {
    domain: string;
    status: string;
    tier: number | null;
    niche: string | null;
    isDeployed: boolean | null;
    renewalDate: string | null;
    children: React.ReactNode;
}

const statusLabels: Record<string, string> = {
    parked: 'Parked', active: 'Building', redirect: 'Redirect',
    forsale: 'For Sale', defensive: 'Defensive',
};

const tierLabels: Record<number, string> = {
    1: 'High Value', 2: 'Growth', 3: 'Incubate', 4: 'Brand/Hold',
};

export function DomainHoverCard({
    domain, status, tier, niche, isDeployed, renewalDate, children,
}: DomainHoverCardProps) {
    const [show, setShow] = useState(false);
    const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (timeout.current) clearTimeout(timeout.current);
        };
    }, []);

    function enter() {
        if (timeout.current) clearTimeout(timeout.current);
        timeout.current = setTimeout(() => setShow(true), 400);
    }
    function leave() {
        if (timeout.current) clearTimeout(timeout.current);
        timeout.current = setTimeout(() => setShow(false), 150);
    }

    return (
        <span className="relative inline-block" onMouseEnter={enter} onMouseLeave={leave}>
            {children}
            {show && (
                <div
                    className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border bg-popover p-3 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150"
                    onMouseEnter={enter}
                    onMouseLeave={leave}
                >
                    <p className="font-semibold text-sm truncate">{domain}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[10px]">{statusLabels[status] || status}</Badge>
                        {tier && <Badge variant="outline" className="text-[10px]">T{tier} {tierLabels[tier] || ''}</Badge>}
                        {niche && <Badge variant="outline" className="text-[10px]">{niche}</Badge>}
                        {isDeployed && <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Live</Badge>}
                    </div>
                    {renewalDate && renewalDate !== '—' && (
                        <p className={cn('mt-2 text-[10px] text-muted-foreground')}>
                            Renewal: {renewalDate}
                        </p>
                    )}
                </div>
            )}
        </span>
    );
}
