'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    LayoutDashboard, Globe, FileText, Search, BarChart3, DollarSign,
    Beaker, Settings, ListTodo, Wallet, Swords, Megaphone, PlugZap,
    ClipboardCheck, ShieldCheck, Gauge, Rocket, Activity, Mail, PlayCircle,
    Command,
} from 'lucide-react';

const NAV_ITEMS = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, keywords: 'home overview metrics' },
    { name: 'Workflow', href: '/dashboard/workflow', icon: PlayCircle, keywords: 'actions next steps' },
    { name: 'Domains', href: '/dashboard/domains', icon: Globe, keywords: 'portfolio sites' },
    { name: 'Content', href: '/dashboard/content', icon: FileText, keywords: 'articles pages writing' },
    { name: 'Keywords', href: '/dashboard/keywords', icon: Search, keywords: 'seo research serp' },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, keywords: 'costs queue stats' },
    { name: 'Revenue', href: '/dashboard/revenue', icon: DollarSign, keywords: 'money earnings rpm' },
    { name: 'Finances', href: '/dashboard/finances', icon: Wallet, keywords: 'expenses costs roi' },
    { name: 'Competitors', href: '/dashboard/competitors', icon: Swords, keywords: 'competition tracking' },
    { name: 'Growth', href: '/dashboard/growth', icon: Megaphone, keywords: 'campaigns media promotions' },
    { name: 'Integrations', href: '/dashboard/integrations', icon: PlugZap, keywords: 'connections sync api' },
    { name: 'Review', href: '/dashboard/review', icon: ClipboardCheck, keywords: 'content approval qa' },
    { name: 'Compliance', href: '/dashboard/compliance', icon: ShieldCheck, keywords: 'legal ymyl policy' },
    { name: 'KPIs', href: '/dashboard/kpis', icon: Gauge, keywords: 'metrics performance targets' },
    { name: 'Deploy', href: '/dashboard/deploy', icon: Rocket, keywords: 'publish launch sites' },
    { name: 'Monitoring', href: '/dashboard/monitoring', icon: Activity, keywords: 'alerts health uptime' },
    { name: 'Subscribers', href: '/dashboard/subscribers', icon: Mail, keywords: 'email capture list' },
    { name: 'Queue', href: '/dashboard/queue', icon: ListTodo, keywords: 'jobs processing pipeline' },
    { name: 'Research', href: '/dashboard/research', icon: Beaker, keywords: 'domain evaluation acquisition' },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings, keywords: 'users templates policies config' },
    { name: 'Add Domain', href: '/dashboard/domains/new', icon: Globe, keywords: 'new create register' },
    { name: 'Import CSV', href: '/dashboard/domains/import', icon: Globe, keywords: 'bulk upload spreadsheet' },
];

export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const filtered = query.trim()
        ? NAV_ITEMS.filter(item => {
            const q = query.toLowerCase();
            return item.name.toLowerCase().includes(q) || item.keywords.includes(q);
        })
        : NAV_ITEMS;

    const navigate = useCallback((href: string) => {
        setOpen(false);
        setQuery('');
        router.push(href);
    }, [router]);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setOpen(prev => {
                    if (!prev) { setQuery(''); setSelectedIndex(0); }
                    return !prev;
                });
            }
            if (e.key === 'Escape') {
                setOpen(false);
            }
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && filtered[selectedIndex]) {
            navigate(filtered[selectedIndex].href);
        }
    }

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="hidden md:flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
                <Command className="h-3 w-3" />
                <span>Search...</span>
                <kbd className="ml-2 rounded border bg-muted px-1 text-[10px] font-mono">⌘K</kbd>
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)}>
            <div className="fixed inset-0 bg-black/50 animate-in fade-in" />
            <div className="fixed inset-x-0 top-[20%] mx-auto w-full max-w-lg animate-in slide-in-from-top-2" onClick={e => e.stopPropagation()}>
                <div className="rounded-xl border bg-popover shadow-2xl">
                    <div className="flex items-center gap-2 border-b px-4 py-3">
                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Search pages..."
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">ESC</kbd>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto p-2">
                        {filtered.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No results found.</p>
                        ) : (
                            filtered.map((item, i) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.href}
                                        onClick={() => navigate(item.href)}
                                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                                            i === selectedIndex
                                                ? 'bg-accent text-accent-foreground'
                                                : 'text-foreground hover:bg-muted'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span>{item.name}</span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
