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
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { label: string; items: NavItem[] };

const navSections: NavSection[] = [
    {
        label: 'Core',
        items: [
            { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
            { name: 'Workflow', href: '/dashboard/workflow', icon: PlayCircle },
            { name: 'Domains', href: '/dashboard/domains', icon: Globe },
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
            { name: 'Review', href: '/dashboard/review', icon: ClipboardCheck },
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

export function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { theme, setTheme } = useTheme();
    const [failedCount, setFailedCount] = useState(0);
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
        function fetchFailed() {
            fetch('/api/queue/process')
                .then(r => r.ok ? r.json() : null)
                .then(data => { if (active && data?.stats?.failed) setFailedCount(data.stats.failed); })
                .catch(() => {});
        }
        fetchFailed();
        const id = setInterval(fetchFailed, 30_000);
        return () => { active = false; clearInterval(id); };
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
                                    <Link
                                        key={item.name}
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
                                    </Link>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="border-t p-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-3"
                    onClick={() => setCollapsed(!collapsed)}
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
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-3"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                    {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
                </Button>
                <form action="/api/auth/logout" method="POST">
                    <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-3 text-red-500 hover:bg-red-50 hover:text-red-600"
                    >
                        <LogOut className="h-5 w-5" />
                        {!collapsed && <span>Logout</span>}
                    </Button>
                </form>
            </div>
        </aside>
    );
}
