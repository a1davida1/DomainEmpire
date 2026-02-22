'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
    { label: 'Overview', href: '' },
    { label: 'Pages', href: '/pages' },
    { label: 'Monetization', href: '/monetization' },
    { label: 'Disclosures', href: '/disclosures' },
    { label: 'Edit', href: '/edit' },
    { label: 'Settings', href: '/settings' },
] as const;

export function DomainDetailTabs({ domainId }: { domainId: string }) {
    const pathname = usePathname();
    const base = `/dashboard/domains/${domainId}`;

    return (
        <div className="flex gap-1 border-b">
            {TABS.map(tab => {
                const href = `${base}${tab.href}`;
                const isActive = tab.href === ''
                    ? pathname === base
                    : pathname.startsWith(href);
                return (
                    <Link
                        key={tab.label}
                        href={href}
                        className={cn(
                            'px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2',
                            isActive
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
                        )}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
