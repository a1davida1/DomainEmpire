'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Workflow', href: '/dashboard/workflow', icon: PlayCircle },
    { name: 'Domains', href: '/dashboard/domains', icon: Globe },
    { name: 'Content', href: '/dashboard/content', icon: FileText },
    { name: 'Keywords', href: '/dashboard/keywords', icon: Search },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Revenue', href: '/dashboard/revenue', icon: DollarSign },
    { name: 'Finances', href: '/dashboard/finances', icon: Wallet },
    { name: 'Competitors', href: '/dashboard/competitors', icon: Swords },
    { name: 'Growth', href: '/dashboard/growth', icon: Megaphone },
    { name: 'Integrations', href: '/dashboard/integrations', icon: PlugZap },
    { name: 'Review', href: '/dashboard/review', icon: ClipboardCheck },
    { name: 'Compliance', href: '/dashboard/compliance', icon: ShieldCheck },
    { name: 'KPIs', href: '/dashboard/kpis', icon: Gauge },
    { name: 'Deploy', href: '/dashboard/deploy', icon: Rocket },
    { name: 'Monitoring', href: '/dashboard/monitoring', icon: Activity },
    { name: 'Subscribers', href: '/dashboard/subscribers', icon: Mail },
    { name: 'Queue', href: '/dashboard/queue', icon: ListTodo },
    { name: 'Research', href: '/dashboard/research', icon: Beaker },
    { name: 'Acquisition', href: '/dashboard/acquisition', icon: Target },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function MobileNav() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
            <Link href="/dashboard" className="flex items-center gap-2">
                <Globe className="h-6 w-6 text-primary" />
                <span className="text-lg font-bold">Domain Empire</span>
            </Link>

            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>

            {/* Mobile Menu Overlay */}
            {isOpen && (
                <div className="fixed inset-0 top-16 z-50 bg-background border-t animate-in slide-in-from-top-5">
                    <div className="flex flex-col p-4 space-y-4 h-[calc(100vh-4rem)] overflow-y-auto">
                        <nav className="flex flex-col gap-2">
                            {navigation.map((item) => {
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
                                            'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
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
                        </nav>

                        <div className="mt-auto border-t pt-4">
                            <form action="/api/auth/logout" method="POST">
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    className="w-full justify-start gap-3 text-red-500 hover:bg-red-50 hover:text-red-600"
                                >
                                    <LogOut className="h-5 w-5" />
                                    Sign Out
                                </Button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
