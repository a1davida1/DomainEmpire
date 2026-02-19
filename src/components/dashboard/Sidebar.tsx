'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    PlayCircle,
    Globe,
    FileText,
    Search,
    BarChart3,
    DollarSign,
    Beaker,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ListTodo,
    Wallet,
    Swords,
    ClipboardCheck,
    ShieldCheck,
    Gauge,
    Megaphone,
    PlugZap,
    Rocket,
    Activity,
    Mail,
    Target,
    Sun,
    Moon,
    Search as SearchIcon,
} from 'lucide-react';
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { label: string; items: NavItem[] };

type QueueHealthPayload = {
    pending?: number;
    processing?: number;
    failed?: number;
    latestWorkerActivityAgeMs?: number | null;
};

type QueueHeartbeatState = {
    label: 'Running' | 'Recently Active' | 'Stalled' | 'Idle' | 'Unknown';
    className: string;
    detail: string;
};

function resolveQueueHeartbeat(health: QueueHealthPayload | null): QueueHeartbeatState {
    if (!health) {
        return {
            label: 'Unknown',
            className: 'bg-slate-100 text-slate-700',
            detail: 'Queue heartbeat is unavailable.',
        };
    }
    const processing = Number(health.processing ?? 0);
    const pending = Number(health.pending ?? 0);
    const latestAge = typeof health.latestWorkerActivityAgeMs === 'number'
        ? health.latestWorkerActivityAgeMs
        : null;

    if (processing > 0) {
        return {
            label: 'Running',
            className: 'bg-emerald-100 text-emerald-800',
            detail: `${processing} job${processing === 1 ? '' : 's'} processing now.`,
        };
    }
    if (latestAge !== null && latestAge < 5 * 60 * 1000) {
        return {
            label: 'Recently Active',
            className: 'bg-blue-100 text-blue-800',
            detail: 'Worker processed jobs in the last 5 minutes.',
        };
    }
    if (pending > 0) {
        return {
            label: 'Stalled',
            className: 'bg-amber-100 text-amber-900',
            detail: `${pending} pending job${pending === 1 ? '' : 's'} with no recent worker activity.`,
        };
    }
    return {
        label: 'Idle',
        className: 'bg-slate-100 text-slate-700',
        detail: 'No pending jobs.',
    };
}

const navSections: NavSection[] = [
    {
        label: 'Core',
        items: [
            { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { name: 'Reviewer', href: '/dashboard/reviewer', icon: ClipboardCheck },
            { name: 'Domains', href: '/dashboard/domains', icon: Globe },
            { name: 'Workflow', href: '/dashboard/workflow', icon: PlayCircle },
        ],
    },
    {
        label: 'Content & SEO',
        items: [
            { name: 'Content', href: '/dashboard/content', icon: FileText },
            { name: 'Keywords', href: '/dashboard/keywords', icon: Search },
            { name: 'Research', href: '/dashboard/research', icon: Beaker },
        ],
    },
    {
        label: 'Business',
        items: [
            { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
            { name: 'Revenue', href: '/dashboard/revenue', icon: DollarSign },
            { name: 'Finances', href: '/dashboard/finances', icon: Wallet },
            { name: 'Growth', href: '/dashboard/growth', icon: Megaphone },
            { name: 'Competitors', href: '/dashboard/competitors', icon: Swords },
            { name: 'Subscribers', href: '/dashboard/subscribers', icon: Mail },
            { name: 'Acquisition', href: '/dashboard/acquisition', icon: Target },
        ],
    },
    {
        label: 'Operations',
        items: [
            { name: 'Deploy', href: '/dashboard/deploy', icon: Rocket },
            { name: 'Queue', href: '/dashboard/queue', icon: ListTodo },
            { name: 'Monitoring', href: '/dashboard/monitoring', icon: Activity },
            { name: 'Review Center', href: '/dashboard/review', icon: ClipboardCheck },
            { name: 'Compliance', href: '/dashboard/compliance', icon: ShieldCheck },
            { name: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
        ],
    },
    {
        label: 'System',
        items: [
            { name: 'Integrations', href: '/dashboard/integrations', icon: PlugZap },
            { name: 'Settings', href: '/dashboard/settings', icon: Settings },
        ],
    },
];

const DEFAULT_OPEN = new Set(['Core', 'Content & SEO', 'Business', 'Operations', 'System']);

function subscribeSidebarCollapsed(callback: () => void) {
    const mql = window.matchMedia('(max-width: 1279px)');
    mql.addEventListener('change', callback);
    window.addEventListener('de-sidebar-change', callback);
    return () => {
        mql.removeEventListener('change', callback);
        window.removeEventListener('de-sidebar-change', callback);
    };
}

function getSidebarCollapsed(): boolean {
    const stored = localStorage.getItem('de-sidebar-collapsed');
    if (stored !== null) return stored === '1';
    return window.innerWidth < 1280;
}

function setSidebarCollapsed(value: boolean) {
    localStorage.setItem('de-sidebar-collapsed', value ? '1' : '0');
    window.dispatchEvent(new Event('de-sidebar-change'));
}

export function Sidebar() {
    const pathname = usePathname();
    const collapsed = useSyncExternalStore(subscribeSidebarCollapsed, getSidebarCollapsed, () => false);
    const { theme, setTheme } = useTheme();
    const [failedCount, setFailedCount] = useState(0);
    const [domainCount, setDomainCount] = useState(0);
    const [queueHeartbeat, setQueueHeartbeat] = useState<QueueHeartbeatState>(() => resolveQueueHeartbeat(null));
    const [openSections, setOpenSections] = useState<Set<string>>(DEFAULT_OPEN);
    const [navFilter, setNavFilter] = useState('');

    function toggleSection(label: string) {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label); else next.add(label);
            return next;
        });
    }

    const navRef = useRef<HTMLElement>(null);

    const handleNavKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const nav = navRef.current;
        if (!nav) return;
        const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
        if (links.length === 0) return;
        const idx = links.indexOf(document.activeElement as HTMLAnchorElement);
        let next: number;
        if (e.key === 'ArrowDown') {
            next = idx < links.length - 1 ? idx + 1 : 0;
        } else {
            next = idx > 0 ? idx - 1 : links.length - 1;
        }
        links[next].focus();
    }, []);

    // Shift+D keyboard shortcut to toggle dark mode
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'D' && e.shiftKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
                e.preventDefault();
                setTheme(theme === 'dark' ? 'light' : 'dark');
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [theme, setTheme]);

    useEffect(() => {
        let active = true;
        function fetchQueueHealth() {
            fetch('/api/queue/process?detailed=true')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!active || !data) return;
                    // detailed=true spreads health at top level, not under data.stats
                    const pending = data.pending ?? data.stats?.pending;
                    const processing = data.processing ?? data.stats?.processing;
                    const failed = Number(data.failed ?? data.stats?.failed ?? 0);
                    setFailedCount(Number.isFinite(failed) ? failed : 0);
                    setQueueHeartbeat(resolveQueueHeartbeat({
                        pending,
                        processing,
                        failed,
                        latestWorkerActivityAgeMs: data.latestWorkerActivityAgeMs,
                    }));
                })
                .catch((err) => console.error('[Sidebar] Queue health fetch failed:', err));
        }
        fetchQueueHealth();
        const id = setInterval(fetchQueueHealth, 30_000);
        return () => { active = false; clearInterval(id); };
    }, []);

    // Fetch domain count
    useEffect(() => {
        fetch('/api/domains?limit=1')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const total = data?.pagination?.total ?? data?.total;
                if (total != null) setDomainCount(total);
            })
            .catch((err) => console.error('[Sidebar] Domain count fetch failed:', err));
    }, []);

    return (
        <aside
            className={cn(
                'flex flex-col h-full border-r bg-card transition-all duration-300',
                collapsed ? 'w-16' : 'w-64'
            )}
        >
            {/* Logo */}
            <div className="flex h-16 items-center border-b px-4">
                <Link href="/dashboard" className="flex items-center gap-2">
                    <Globe className="h-8 w-8 text-primary" />
                    {!collapsed && (
                        <span className="text-xl font-bold">Domain Empire</span>
                    )}
                </Link>
            </div>

            {/* Nav Filter */}
            {!collapsed && (
                <div className="px-2 pt-2">
                    <div className="relative">
                        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                        <input
                            type="text"
                            value={navFilter}
                            onChange={e => setNavFilter(e.target.value)}
                            placeholder="Filter pages..."
                            className="w-full rounded-md border bg-muted/30 pl-8 pr-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
                        />
                    </div>
                </div>
            )}

            {/* Navigation */}
            <nav
                ref={navRef}
                className="flex-1 overflow-y-auto p-2 space-y-0.5"
                onKeyDown={handleNavKeyDown}
            >
                {navSections.map((section) => {
                    const q = navFilter.toLowerCase();
                    const visibleItems = q
                        ? section.items.filter(item => item.name.toLowerCase().includes(q))
                        : section.items;
                    if (q && visibleItems.length === 0) return null;
                    const isOpen = openSections.has(section.label);
                    return (
                        <div key={section.label}>
                            {!collapsed && (
                                <button
                                    onClick={() => toggleSection(section.label)}
                                    className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                                >
                                    <span>{section.label}</span>
                                    <ChevronDown className={cn('h-3 w-3 transition-transform', !isOpen && '-rotate-90')} />
                                </button>
                            )}
                            {(collapsed || isOpen) && visibleItems.map((item) => {
                                const isActive = item.href === '/dashboard'
                                    ? pathname === item.href
                                    : (pathname === item.href || pathname.startsWith(item.href + '/'));
                                return (
                                    <Tooltip key={item.name}>
                                        <TooltipTrigger asChild>
                                            <Link
                                                href={item.href}
                                                className={cn(
                                                    'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                                                    isActive
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                                )}
                                            >
                                                <item.icon className="h-5 w-5 shrink-0" />
                                                {!collapsed && <span>{item.name}</span>}
                                                {item.name === 'Queue' && failedCount > 0 && (
                                                    <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                                        {failedCount > 99 ? '99+' : failedCount}
                                                    </span>
                                                )}
                                                {item.name === 'Queue' && (
                                                    <span
                                                        className={cn(
                                                            'ml-auto h-2.5 w-2.5 rounded-full',
                                                            queueHeartbeat.label === 'Running'
                                                                ? 'bg-emerald-500'
                                                                : queueHeartbeat.label === 'Recently Active'
                                                                    ? 'bg-blue-500'
                                                                    : queueHeartbeat.label === 'Stalled'
                                                                        ? 'bg-amber-500'
                                                                        : 'bg-slate-400',
                                                        )}
                                                    />
                                                )}
                                                {item.name === 'Domains' && domainCount > 0 && !collapsed && (
                                                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                                                        {domainCount}
                                                    </span>
                                                )}
                                            </Link>
                                        </TooltipTrigger>
                                        {collapsed && (
                                            <TooltipContent side="right">
                                                {item.name}
                                                {item.name === 'Queue' && failedCount > 0 && ` (${failedCount} failed)`}
                                                {item.name === 'Queue' && ` • ${queueHeartbeat.label}`}
                                                {item.name === 'Domains' && domainCount > 0 && ` (${domainCount})`}
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="border-t p-2">
                {!collapsed && (
                    <div className="mb-2 rounded-md border bg-muted/30 px-2 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Worker</span>
                            <span className={cn('rounded-full px-2 py-0.5 font-medium', queueHeartbeat.className)}>
                                {queueHeartbeat.label}
                            </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{queueHeartbeat.detail}</p>
                    </div>
                )}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-3"
                            onClick={() => setSidebarCollapsed(!collapsed)}
                        >
                            {collapsed ? (
                                <ChevronRight className="h-5 w-5" />
                            ) : (
                                <>
                                    <ChevronLeft className="h-5 w-5" />
                                    <span>Collapse</span>
                                </>
                            )}
                        </Button>
                    </TooltipTrigger>
                    {collapsed && <TooltipContent side="right">Expand sidebar</TooltipContent>}
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-3"
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        >
                            <Sun className="h-5 w-5 hidden dark:block" />
                            <Moon className="h-5 w-5 block dark:hidden" />
                            {!collapsed && <span className="hidden dark:inline">Light Mode</span>}
                            {!collapsed && <span className="inline dark:hidden">Dark Mode</span>}
                        </Button>
                    </TooltipTrigger>
                    {collapsed && <TooltipContent side="right">Toggle theme (Shift+D)</TooltipContent>}
                </Tooltip>
                <form action="/api/auth/logout" method="POST">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start gap-3 text-red-500 hover:bg-red-50 hover:text-red-600"
                            >
                                <LogOut className="h-5 w-5" />
                                {!collapsed && <span>Logout</span>}
                            </Button>
                        </TooltipTrigger>
                        {collapsed && <TooltipContent side="right">Sign out</TooltipContent>}
                    </Tooltip>
                </form>
            </div>
        </aside>
    );
}
