'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ExternalLink, Copy, Check, Rows3, Rows2, Globe, Search, X, LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DomainActions } from '@/components/dashboard/DomainActions';
import { DomainHoverCard } from '@/components/dashboard/DomainHoverCard';
import { toast } from 'sonner';

interface SerializedDomain {
    id: string;
    domain: string;
    status: string;
    tier: number | null;
    niche: string | null;
    siteTemplate: string | null;
    isDeployed: boolean | null;
    registrar: string | null;
    renewalDate: string | null;
}

const STATUSES = ['parked', 'active', 'redirect', 'forsale', 'defensive'] as const;

function relativeDate(dateStr: string | null): string {
    if (!dateStr || dateStr === '—') return '—';
    const d = new Date(dateStr);
    if (!Number.isFinite(d.getTime())) return dateStr;
    const diffMs = d.getTime() - Date.now();
    const diffDays = Math.round(diffMs / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0 && diffDays <= 90) return `in ${diffDays}d`;
    if (diffDays < 0 && diffDays >= -90) return `${Math.abs(diffDays)}d ago`;
    return dateStr;
}

function renewalUrgency(dateStr: string | null): string {
    if (!dateStr || dateStr === '—') return '';
    const d = new Date(dateStr);
    if (!Number.isFinite(d.getTime())) return '';
    const diffDays = Math.round((d.getTime() - Date.now()) / 86_400_000);
    if (diffDays < 0) return 'text-red-500 font-semibold';
    if (diffDays <= 14) return 'text-red-400 font-medium';
    if (diffDays <= 30) return 'text-amber-400 font-medium';
    return '';
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                navigator.clipboard.writeText(text);
                setCopied(true);
                toast.success(`Copied ${text}`);
                setTimeout(() => setCopied(false), 1500);
            }}
            className="ml-1 inline-flex text-muted-foreground hover:text-foreground transition-colors"
            title={`Copy ${text}`}
        >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

const statusConfig: Record<string, { color: string; label: string }> = {
    parked: { color: 'bg-gray-500', label: 'Parked' },
    active: { color: 'bg-emerald-600', label: 'Building' },
    redirect: { color: 'bg-blue-500', label: 'Redirect' },
    forsale: { color: 'bg-amber-500', label: 'For Sale' },
    defensive: { color: 'bg-purple-500', label: 'Defensive' },
};

const tierConfig: Record<number, { label: string; color: string }> = {
    1: { label: 'High Value', color: 'border-emerald-500 text-emerald-700' },
    2: { label: 'Growth', color: 'border-blue-500 text-blue-700' },
    3: { label: 'Incubate', color: 'border-gray-400 text-gray-600' },
    4: { label: 'Brand/Hold', color: 'border-purple-400 text-purple-600' },
};

interface Props {
    domains: SerializedDomain[];
    headerSlot: React.ReactNode;
    hasFilters: boolean;
}

export function DomainsTableClient({ domains, headerSlot, hasFilters }: Props) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [acting, setActing] = useState(false);
    const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ endpoint: string; label: string } | null>(null);
    const [compact, setCompact] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const router = useRouter();
    const searchInputRef = useRef<HTMLInputElement>(null);

    // '/' keyboard shortcut to focus search
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return domains;
        const q = searchQuery.toLowerCase();
        return domains.filter(d =>
            d.domain.toLowerCase().includes(q) ||
            d.status.toLowerCase().includes(q) ||
            (d.niche && d.niche.toLowerCase().includes(q))
        );
    }, [domains, searchQuery]);

    const allSelected = selected.size === filtered.length && filtered.length > 0;
    const someSelected = selected.size > 0;

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function toggleAll() {
        setSelected(allSelected ? new Set() : new Set(filtered.map(d => d.id)));
    }

    async function bulkAction(endpoint: string, label: string) {
        const ids = [...selected];
        if (ids.length === 0) return;
        setActing(true);
        setBulkProgress({ done: 0, total: ids.length });
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domainIds: ids }),
            });
            setBulkProgress({ done: ids.length, total: ids.length });
            if (res.ok) {
                toast.success(`${label}: ${ids.length} domains`);
                setSelected(new Set());
                router.refresh();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || `${label} failed`);
            }
        } catch {
            toast.error(`${label} request failed`);
        } finally {
            setActing(false);
            setTimeout(() => setBulkProgress(null), 800);
        }
    }

    function exportCsv() {
        const header = 'Domain,Status,Tier,Niche,Template,Deployed,Renewal';
        const rows = domains.map(d =>
            [d.domain, d.status, d.tier ?? '', d.niche ?? '', d.siteTemplate ?? '', d.isDeployed ? 'Yes' : 'No', d.renewalDate ?? ''].join(',')
        );
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `domains-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${domains.length} domains`);
    }

    return (
        <>
            {/* Quick Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder='Quick filter domains... (press "/")'
                    className="w-full rounded-lg border bg-background pl-9 pr-8 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {someSelected && (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2 animate-in slide-in-from-top-2">
                    <span className="text-sm font-medium">{selected.size} selected</span>
                    {confirmAction ? (
                        <>
                            <span className="text-sm text-amber-600 font-medium">{confirmAction.label} {selected.size} domains?</span>
                            <Button size="sm" variant="destructive" onClick={() => { bulkAction(confirmAction.endpoint, confirmAction.label); setConfirmAction(null); }} disabled={acting}>Confirm</Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmAction(null)} disabled={acting}>Cancel</Button>
                        </>
                    ) : (
                        <>
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ endpoint: '/api/domains/bulk-deploy', label: 'Deploy' })} disabled={acting}>Deploy</Button>
                            <Button size="sm" variant="outline" onClick={() => bulkAction('/api/domains/classify', 'Classify queued')} disabled={acting}>Classify</Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmAction({ endpoint: '/api/domains/bulk-seed', label: 'Seed' })} disabled={acting}>Seed Content</Button>
                        </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setSelected(new Set()); setConfirmAction(null); }} disabled={acting}>Clear</Button>
                    {bulkProgress && (
                        <div className="flex items-center gap-2 ml-auto">
                            <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-primary transition-all duration-300"
                                    style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }}
                                />
                            </div>
                            <span className="text-xs text-muted-foreground">{bulkProgress.done}/{bulkProgress.total}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3 p-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{domains.length} domains</span>
                    <Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>
                </div>
                {filtered.map(domain => {
                    const sCfg = statusConfig[domain.status] || { color: 'bg-gray-500', label: domain.status };
                    const t = domain.tier || 3;
                    const tCfg = tierConfig[t] || tierConfig[3];
                    return (
                        <div key={domain.id} className={cn('rounded-lg border p-3 space-y-2', selected.has(domain.id) && 'bg-muted/40')}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={selected.has(domain.id)} onChange={() => toggle(domain.id)} className="h-4 w-4 accent-primary" aria-label={`Select ${domain.domain}`} />
                                    <Link href={`/dashboard/domains/${domain.id}`} className="font-medium hover:underline text-sm">{domain.domain}</Link>
                                    <CopyButton text={domain.domain} />
                                </div>
                                <DomainActions domainId={domain.id} domainName={domain.domain} isDeployed={domain.isDeployed ?? false} />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <Badge variant="secondary" className={cn(sCfg.color, 'text-white text-[10px]')}>{sCfg.label}</Badge>
                                <Badge variant="outline" className={cn(tCfg.color, 'text-[10px]')}>T{t}</Badge>
                                {domain.niche && <Badge variant="outline" className="text-[10px]">{domain.niche}</Badge>}
                                {domain.isDeployed && <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Live</Badge>}
                            </div>
                            {domain.renewalDate && domain.renewalDate !== '—' && (
                                <p className={cn('text-[10px] text-muted-foreground', renewalUrgency(domain.renewalDate))}>Renewal: {relativeDate(domain.renewalDate)}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Desktop View */}
            <div className="hidden md:block">
            <div className="flex justify-end gap-1 p-2">
                <Button size="sm" variant={viewMode === 'table' ? 'secondary' : 'ghost'} onClick={() => setViewMode('table')} title="Table view">
                    <List className="h-4 w-4" />
                </Button>
                <Button size="sm" variant={viewMode === 'grid' ? 'secondary' : 'ghost'} onClick={() => setViewMode('grid')} title="Grid view">
                    <LayoutGrid className="h-4 w-4" />
                </Button>
                {viewMode === 'table' && (
                    <Button size="sm" variant="ghost" onClick={() => setCompact(!compact)} title={compact ? 'Comfortable view' : 'Compact view'}>
                        {compact ? <Rows3 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
                    </Button>
                )}
                <Button size="sm" variant="ghost" onClick={exportCsv}>Export CSV</Button>
            </div>

            {/* Grid View */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-2">
                    {filtered.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center gap-3 py-12">
                            <div className="rounded-full bg-muted p-4"><Globe className="h-8 w-8 text-muted-foreground" /></div>
                            <p className="text-muted-foreground font-medium">{hasFilters || searchQuery ? 'No domains match' : 'No domains yet'}</p>
                        </div>
                    ) : filtered.map(domain => {
                        const sCfg = statusConfig[domain.status] || { color: 'bg-gray-500', label: domain.status };
                        const t = domain.tier || 3;
                        const tCfg = tierConfig[t] || tierConfig[3];
                        return (
                            <div key={domain.id} className={cn('rounded-lg border p-3 space-y-2 hover:border-primary/40 transition-colors', selected.has(domain.id) && 'bg-muted/40 border-primary/30')}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <input type="checkbox" checked={selected.has(domain.id)} onChange={() => toggle(domain.id)} className="h-4 w-4 shrink-0 accent-primary" aria-label={`Select ${domain.domain}`} />
                                        <Link href={`/dashboard/domains/${domain.id}`} className="font-medium text-sm hover:underline truncate">{domain.domain}</Link>
                                    </div>
                                    <DomainActions domainId={domain.id} domainName={domain.domain} isDeployed={domain.isDeployed ?? false} />
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    <Badge variant="secondary" className={cn(sCfg.color, 'text-white text-[10px]')}>{sCfg.label}</Badge>
                                    <Badge variant="outline" className={cn(tCfg.color, 'text-[10px]')}>T{t}</Badge>
                                    {domain.niche && <Badge variant="outline" className="text-[10px]">{domain.niche}</Badge>}
                                    {domain.isDeployed && <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">Live</Badge>}
                                </div>
                                {domain.renewalDate && domain.renewalDate !== '\u2014' && (
                                    <p className={cn('text-[10px] text-muted-foreground', renewalUrgency(domain.renewalDate))}>Renewal: {relativeDate(domain.renewalDate)}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Table View */}
            {viewMode === 'table' && (
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                        <TableHead className="w-10">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                                onChange={toggleAll}
                                className="h-4 w-4 rounded accent-primary cursor-pointer"
                                aria-label="Select all domains"
                            />
                        </TableHead>
                        {headerSlot}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filtered.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={9} className="h-40 text-center">
                                <div className="flex flex-col items-center gap-3 py-8">
                                    <div className="rounded-full bg-muted p-4">
                                        <Globe className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                    <p className="text-muted-foreground font-medium">
                                        {hasFilters ? 'No domains match your filters' : 'No domains yet'}
                                    </p>
                                    <p className="text-xs text-muted-foreground/70 max-w-xs">
                                        {hasFilters
                                            ? 'Try adjusting your search or filter criteria to find what you\'re looking for.'
                                            : 'Get started by adding your first domain or importing a list from CSV.'}
                                    </p>
                                    <div className="flex gap-2 mt-1">
                                        {hasFilters ? (
                                            <Link href="/dashboard/domains">
                                                <Button variant="outline" size="sm">Clear Filters</Button>
                                            </Link>
                                        ) : (
                                            <>
                                                <Link href="/dashboard/domains/new">
                                                    <Button size="sm">Add Domain</Button>
                                                </Link>
                                                <Link href="/dashboard/domains/import">
                                                    <Button variant="outline" size="sm">Import CSV</Button>
                                                </Link>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : (
                        filtered.map(domain => {
                            const sCfg = statusConfig[domain.status] || { color: 'bg-gray-500', label: domain.status };
                            const t = domain.tier || 3;
                            const tCfg = tierConfig[t] || tierConfig[3];
                            return (
                                <TableRow key={domain.id} className={cn(selected.has(domain.id) ? 'bg-muted/40' : '', compact && '[&>td]:py-1 [&>td]:text-xs')}>
                                    <TableCell>
                                        <input
                                            type="checkbox"
                                            checked={selected.has(domain.id)}
                                            onChange={() => toggle(domain.id)}
                                            className="h-4 w-4 rounded accent-primary cursor-pointer"
                                            aria-label={`Select ${domain.domain}`}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <DomainHoverCard domain={domain.domain} status={domain.status} tier={domain.tier} niche={domain.niche} isDeployed={domain.isDeployed} renewalDate={domain.renewalDate}>
                                            <Link href={`/dashboard/domains/${domain.id}`} className="font-medium hover:underline">{domain.domain}</Link>
                                        </DomainHoverCard>
                                        <CopyButton text={domain.domain} />
                                        <Link href={`/dashboard/queue?domainId=${domain.id}`} className="ml-2 text-xs text-blue-600 hover:underline">Queue</Link>
                                        {domain.isDeployed && (
                                            <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex" aria-label={`Open ${domain.domain}`}>
                                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                            </a>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <select
                                            value={domain.status}
                                            onChange={async (e) => {
                                                const newStatus = e.target.value;
                                                try {
                                                    const res = await fetch(`/api/domains/${domain.id}`, {
                                                        method: 'PATCH',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ status: newStatus }),
                                                    });
                                                    if (res.ok) {
                                                        toast.success(`${domain.domain} → ${newStatus}`);
                                                        router.refresh();
                                                    } else {
                                                        toast.error('Status update failed');
                                                    }
                                                } catch {
                                                    toast.error('Status update failed');
                                                }
                                            }}
                                            className={cn(
                                                'rounded-full border-0 px-2 py-0.5 text-xs font-medium cursor-pointer appearance-none text-center',
                                                sCfg.color, 'text-white'
                                            )}
                                            title="Change status"
                                        >
                                            {STATUSES.map(s => (
                                                <option key={s} value={s} className="text-foreground bg-background">
                                                    {statusConfig[s]?.label || s}
                                                </option>
                                            ))}
                                        </select>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={tCfg.color}>T{t} {tCfg.label}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        {domain.niche ? (
                                            <span className="font-medium text-foreground">{domain.niche}</span>
                                        ) : (
                                            <span className="italic text-amber-500">Unclassified</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {domain.siteTemplate && domain.siteTemplate !== 'authority' ? (
                                            <Badge variant="outline" className="capitalize">{domain.siteTemplate.replaceAll('_', ' ')}</Badge>
                                        ) : !domain.niche ? (
                                            <span className="italic text-amber-500">—</span>
                                        ) : (
                                            <Badge variant="outline" className="capitalize">{domain.siteTemplate?.replaceAll('_', ' ') || 'authority'}</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {domain.isDeployed ? (
                                            <Badge variant="secondary" className="bg-green-100 text-green-800">Live</Badge>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <span className={cn('text-sm', renewalUrgency(domain.renewalDate))} title={domain.renewalDate || undefined}>{relativeDate(domain.renewalDate)}</span>
                                    </TableCell>
                                    <TableCell>
                                        <DomainActions domainId={domain.id} domainName={domain.domain} isDeployed={domain.isDeployed ?? false} />
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
            )}
            </div>
        </>
    );
}
