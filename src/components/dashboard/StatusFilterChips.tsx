'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUSES = [
    { value: 'active', label: 'Building', color: 'bg-emerald-600' },
    { value: 'parked', label: 'Parked', color: 'bg-gray-500' },
    { value: 'redirect', label: 'Redirect', color: 'bg-blue-500' },
    { value: 'forsale', label: 'For Sale', color: 'bg-amber-500' },
    { value: 'defensive', label: 'Defensive', color: 'bg-purple-500' },
];

export function StatusFilterChips() {
    const [expanded, setExpanded] = useState(true);
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeStatus = searchParams.get('status');

    function handleClick(status: string) {
        const params = new URLSearchParams(searchParams.toString());
        if (activeStatus === status) {
            params.delete('status');
        } else {
            params.set('status', status);
        }
        params.delete('page');
        router.push(`/dashboard/domains?${params.toString()}`);
    }

    return (
        <div className="space-y-1">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                <span>Status Filter</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', !expanded && '-rotate-90')} />
                {activeStatus && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{STATUSES.find(s => s.value === activeStatus)?.label || activeStatus}</Badge>}
            </button>
            {expanded && (
                <div className="flex flex-wrap gap-1.5 animate-in slide-in-from-top-1 duration-150">
                    {STATUSES.map(s => (
                        <button
                            key={s.value}
                            onClick={() => handleClick(s.value)}
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                activeStatus === s.value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                            )}
                        >
                            <span className={cn('h-2 w-2 rounded-full', s.color)} />
                            {s.label}
                        </button>
                    ))}
                    {activeStatus && (
                        <button
                            onClick={() => handleClick(activeStatus)}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                            Clear
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
