'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useState, useTransition, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, X } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const STATUSES = ['active', 'parked', 'redirect', 'forsale', 'defensive'] as const;
const TIERS = [1, 2, 3, 4] as const;

export function DomainSearch() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const currentSearch = searchParams.get('q') ?? '';
    const currentStatus = searchParams.get('status') ?? '';
    const currentTier = searchParams.get('tier') ?? '';
    const [query, setQuery] = useState(currentSearch);

    const updateParams = useCallback((updates: Record<string, string>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(updates)) {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        }
        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`);
        });
    }, [searchParams, pathname, router]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        updateParams({ q: query });
    };

    const clearFilters = () => {
        setQuery('');
        startTransition(() => {
            router.push(pathname);
        });
    };

    const hasFilters = currentSearch || currentStatus || currentTier;

    return (
        <div className="flex gap-4">
            <form onSubmit={handleSearch} className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search domains..."
                    className="pl-9"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={isPending}
                />
            </form>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={isPending}>
                        <Filter className="mr-2 h-4 w-4" />
                        Filters
                        {hasFilters && (
                            <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                                {[currentSearch, currentStatus, currentTier].filter(Boolean).length}
                            </span>
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Status</DropdownMenuLabel>
                    {STATUSES.map((s) => (
                        <DropdownMenuItem
                            key={s}
                            onSelect={() => updateParams({ status: currentStatus === s ? '' : s })}
                            className="capitalize"
                        >
                            {currentStatus === s && '✓ '}{s}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Tier</DropdownMenuLabel>
                    {TIERS.map((t) => (
                        <DropdownMenuItem
                            key={t}
                            onSelect={() => updateParams({ tier: currentTier === String(t) ? '' : String(t) })}
                        >
                            {currentTier === String(t) && '✓ '}Tier {t}
                        </DropdownMenuItem>
                    ))}
                    {hasFilters && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={clearFilters}>
                                <X className="mr-2 h-4 w-4" />
                                Clear All
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
