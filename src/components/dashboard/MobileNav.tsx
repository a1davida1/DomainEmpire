'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-fetch';
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
    Menu,
    X,
    LogOut,
    ListTodo,
    Wallet,
    Swords,
    Megaphone,
    PlugZap,
    ClipboardCheck,
    ShieldCheck,
    Gauge,
    Rocket,
    Activity,
    Mail,
    Target,
} from 'lucide-react';

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { label: string; items: NavItem[] };

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

export function MobileNav() {
    const pathname = usePathname();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    async function handleLogout() {
        try {
            await apiFetch('/api/auth/logout', { method: 'POST' });
        } catch (err) {
            console.error('[MobileNav] Logout request failed:', err);
        } finally {
            setIsOpen(false);
            router.push('/login');
            router.refresh();
        }
    }

    return (
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            <Link href="/dashboard" className="flex items-center gap-2">
                <Globe className="h-6 w-6 text-primary" />
                <span className="text-lg font-bold">Domain Empire</span>
            </Link>

            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>

            {/* Mobile Menu Overlay */}
            {isOpen && (
                <div className="fixed inset-0 top-[57px] z-50 bg-background border-t animate-in slide-in-from-top-5 duration-200">
                    <div className="flex flex-col p-4 space-y-4 h-[calc(100vh-57px)] overflow-y-auto">
                        <nav className="flex flex-col gap-1">
                            {navSections.map((section) => (
                                <div key={section.label}>
                                    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                        {section.label}
                                    </p>
                                    {section.items.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = item.href === '/dashboard'
                                            ? pathname === item.href
                                            : (pathname === item.href || pathname.startsWith(item.href + '/'));
                                        return (
                                            <Link
                                                key={item.name}
                                                href={item.href}
                                                onClick={() => setIsOpen(false)}
                                                className={cn(
                                                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                                                    isActive
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                                )}
                                            >
                                                <Icon className="h-5 w-5" />
                                                {item.name}
                                            </Link>
                                        );
                                    })}
                                </div>
                            ))}
                        </nav>

                        <div className="mt-auto border-t pt-4">
                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full justify-start gap-3 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                onClick={handleLogout}
                            >
                                <LogOut className="h-5 w-5" />
                                Sign Out
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
