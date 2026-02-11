'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
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
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Domains', href: '/dashboard/domains', icon: Globe },
    { name: 'Content', href: '/dashboard/content', icon: FileText },
    { name: 'Keywords', href: '/dashboard/keywords', icon: Search },
    { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Revenue', href: '/dashboard/revenue', icon: DollarSign },
    { name: 'Research', href: '/dashboard/research', icon: Beaker },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

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

            {/* Navigation */}
            <nav className="flex-1 space-y-1 p-2">
                {navigation.map((item) => {
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
                        >                 <item.icon className="h-5 w-5 shrink-0" />
                            {!collapsed && <span>{item.name}</span>}
                        </Link>
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
