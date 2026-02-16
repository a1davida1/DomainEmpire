'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/dashboard/workflow': 'Workflow',
    '/dashboard/domains': 'Domains',
    '/dashboard/domains/new': 'Add Domain',
    '/dashboard/domains/import': 'Import Domains',
    '/dashboard/content': 'Content Queue',
    '/dashboard/keywords': 'Keywords',
    '/dashboard/analytics': 'Analytics',
    '/dashboard/revenue': 'Revenue',
    '/dashboard/finances': 'Finances',
    '/dashboard/competitors': 'Competitors',
    '/dashboard/growth': 'Growth',
    '/dashboard/integrations': 'Integrations',
    '/dashboard/review': 'Review',
    '/dashboard/compliance': 'Compliance',
    '/dashboard/kpis': 'KPIs',
    '/dashboard/deploy': 'Deploy',
    '/dashboard/monitoring': 'Monitoring',
    '/dashboard/subscribers': 'Subscribers',
    '/dashboard/queue': 'Queue',
    '/dashboard/research': 'Research',
    '/dashboard/acquisition': 'Acquisition',
    '/dashboard/settings': 'Settings',
};

function resolvePageName(pathname: string): string {
    const exact = PAGE_TITLES[pathname];
    if (exact) return exact;
    if (pathname.startsWith('/dashboard/domains/') && pathname.includes('/disclosures')) return 'Disclosures';
    if (pathname.startsWith('/dashboard/domains/') && pathname.includes('/monetization')) return 'Monetization';
    if (pathname.startsWith('/dashboard/domains/') && pathname.includes('/edit')) return 'Edit Domain';
    if (pathname.startsWith('/dashboard/domains/')) return 'Domain Detail';
    return 'Domain Empire';
}

export function PageTitle() {
    const pathname = usePathname();
    const [pendingCount, setPendingCount] = useState(0);

    // Poll for pending/failed queue jobs
    useEffect(() => {
        let active = true;
        function poll() {
            fetch('/api/queue/process')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!active || !data?.stats) return;
                    const count = (data.stats.pending ?? 0) + (data.stats.failed ?? 0);
                    setPendingCount(count);
                })
                .catch(() => {});
        }
        poll();
        const id = setInterval(poll, 30_000);
        return () => { active = false; clearInterval(id); };
    }, []);

    // Update document title
    useEffect(() => {
        const page = resolvePageName(pathname);
        const prefix = pendingCount > 0 ? `(${pendingCount}) ` : '';
        document.title = `${prefix}${page} — Domain Empire`;
    }, [pathname, pendingCount]);

    return null;
}
