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

const DEPLOYMENT_STATES = [
    { value: 'deployed', label: 'Deployed', color: 'bg-emerald-500' },
    { value: 'project_ready', label: 'Project Ready', color: 'bg-yellow-500' },
    { value: 'not_deployed', label: 'Not Deployed', color: 'bg-slate-400' },
];

export function StatusFilterChips() {
    const [expanded, setExpanded] = useState(true);
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeStatus = searchParams.get('status');
    const activeDeploy = searchParams.get('deploy');

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

    function handleDeploymentClick(state: string) {
        const params = new URLSearchParams(searchParams.toString());
        if (activeDeploy === state) {
            params.delete('deploy');
        } else {
            params.set('deploy', state);
        }
        params.delete('page');
        router.push(`/dashboard/domains?${params.toString()}`);
    }

    function clearAll() {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('status');
        params.delete('deploy');
        params.delete('page');
        router.push(`/dashboard/domains?${params.toString()}`);
    }

    return (
        <div className="space-y-1">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
                <span>Filters</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', !expanded && '-rotate-90')} />
                {activeStatus && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{STATUSES.find(s => s.value === activeStatus)?.label || activeStatus}</Badge>}
                {activeDeploy && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{DEPLOYMENT_STATES.find(s => s.value === activeDeploy)?.label || activeDeploy}</Badge>}
            </button>
            {expanded && (
                <div className="space-y-2 animate-in slide-in-from-top-1 duration-150">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground">Operational</span>
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
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground">Deployment</span>
                        {DEPLOYMENT_STATES.map(s => (
                            <button
                                key={s.value}
                                onClick={() => handleDeploymentClick(s.value)}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                    activeDeploy === s.value
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                                )}
                            >
                                <span className={cn('h-2 w-2 rounded-full', s.color)} />
                                {s.label}
                            </button>
                        ))}
                    </div>
                    {(activeStatus || activeDeploy) && (
                        <button
                            onClick={clearAll}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
