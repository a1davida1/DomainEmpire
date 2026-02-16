'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useState, useEffect } from 'react';

const LABEL_MAP: Record<string, string> = {
    dashboard: 'Dashboard',
    domains: 'Domains',
    content: 'Content',
    workflow: 'Workflow',
    queue: 'Queue',
    settings: 'Settings',
    analytics: 'Analytics',
    revenue: 'Revenue',
    finances: 'Finances',
    competitors: 'Competitors',
    growth: 'Growth',
    integrations: 'Integrations',
    review: 'Review',
    compliance: 'Compliance',
    kpis: 'KPIs',
    deploy: 'Deploy',
    monitoring: 'Monitoring',
    subscribers: 'Subscribers',
    research: 'Research',
    acquisition: 'Acquisition',
    keywords: 'Keywords',
    monetization: 'Monetization',
    disclosures: 'Disclosures',
    edit: 'Edit',
    new: 'New',
    import: 'Import',
    operations: 'Operations',
    freshness: 'Freshness',
    articles: 'Articles',
    audit: 'Audit',
    citations: 'Citations',
    revisions: 'Revisions',
    calendar: 'Calendar',
    duplicates: 'Duplicates',
    'domain-buy': 'Domain Buy',
    'campaign-launch': 'Campaign Launch',
    preview: 'Preview',
};

function isUuid(segment: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
}

export function Breadcrumbs() {
    const pathname = usePathname();
    const segments = pathname.split('/').filter(Boolean);
    const [domainNames, setDomainNames] = useState<Record<string, string>>({});

    // Resolve domain name for UUID breadcrumb segments
    const domainUuid = segments.length >= 3 && segments[1] === 'domains' && isUuid(segments[2]) ? segments[2] : null;
    useEffect(() => {
        if (!domainUuid) return;
        if (domainNames[domainUuid]) return; // already cached
        let active = true;
        fetch(`/api/domains/${domainUuid}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const name = typeof data?.domain === 'string' ? data.domain : data?.domain?.domain;
                if (active && typeof name === 'string') {
                    setDomainNames(prev => ({ ...prev, [domainUuid]: name }));
                }
            })
            .catch((err) => console.error('[Breadcrumbs] Domain name fetch failed:', err));
        return () => { active = false; };
    }, [domainUuid, domainNames]);

    if (segments.length <= 1) return null;

    const crumbs: Array<{ label: string; href: string }> = [];
    let path = '';
    for (const segment of segments) {
        path += `/${segment}`;
        if (isUuid(segment)) {
            crumbs.push({ label: domainNames[segment] || '…', href: path });
        } else {
            crumbs.push({
                label: LABEL_MAP[segment] || segment.charAt(0).toUpperCase() + segment.slice(1),
                href: path,
            });
        }
    }

    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
                <Home className="h-3.5 w-3.5" />
            </Link>
            {crumbs.slice(1).map((crumb, i) => (
                <span key={crumb.href} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    {i === crumbs.length - 2 ? (
                        <span className="font-medium text-foreground">{crumb.label}</span>
                    ) : (
                        <Link href={crumb.href} className="hover:text-foreground transition-colors">
                            {crumb.label}
                        </Link>
                    )}
                </span>
            ))}
        </nav>
    );
}
