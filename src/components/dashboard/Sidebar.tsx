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
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Domains', href: '/domains', icon: Globe },
    { name: 'Content', href: '/content', icon: FileText },
    { name: 'Keywords', href: '/keywords', icon: Search },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Revenue', href: '/revenue', icon: DollarSign },
    { name: 'Research', href: '/research', icon: Beaker },
    { name: 'Settings', href: '/settings', icon: Settings },
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
                <Link href="/" className="flex items-center gap-2">
                    <Globe className="h-8 w-8 text-primary" />
                    {!collapsed && (
                        <span className="text-xl font-bold">Domain Empire</span>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 p-2">
                {navigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            )}
                        >
                            <item.icon className="h-5 w-5 shrink-0" />
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
