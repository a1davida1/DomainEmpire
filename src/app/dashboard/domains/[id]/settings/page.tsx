import { notFound } from 'next/navigation';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { DomainDetailTabs } from '@/components/dashboard/DomainDetailTabs';
import { SiteSettingsClient } from './SiteSettingsClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function DomainSettingsPage({ params }: PageProps) {
    const { id } = await params;

    const domain = await db.query.domains.findFirst({
        where: eq(domains.id, id),
    });

    if (!domain) {
        notFound();
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Settings: {domain.domain}</h1>
                <p className="text-muted-foreground">
                    Configure site display settings — phone number, sidebar, footer, CTA, and more.
                </p>
            </div>
            <DomainDetailTabs domainId={id} />
            <SiteSettingsClient
                domainId={id}
                domainName={domain.domain}
                initialSettings={domain.siteSettings || {}}
            />
        </div>
    );
}
