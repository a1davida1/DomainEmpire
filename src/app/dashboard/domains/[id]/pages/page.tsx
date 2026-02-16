import { notFound } from 'next/navigation';
import { db, domains, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { DomainDetailTabs } from '@/components/dashboard/DomainDetailTabs';
import { DomainPagesClient } from './DomainPagesClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function DomainPagesPage({ params }: PageProps) {
    const { id } = await params;

    const domain = await db.query.domains.findFirst({
        where: eq(domains.id, id),
    });

    if (!domain) {
        notFound();
    }

    const pages = await db.select().from(pageDefinitions)
        .where(eq(pageDefinitions.domainId, id));

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Pages: {domain.domain}</h1>
                <p className="text-muted-foreground">
                    Manage v2 block-based page definitions for this domain.
                </p>
            </div>
            <DomainDetailTabs domainId={id} />
            <DomainPagesClient
                domainId={id}
                domainName={domain.domain}
                siteTemplate={domain.siteTemplate || 'authority'}
                initialPages={pages.map(p => ({
                    id: p.id,
                    route: p.route,
                    title: p.title,
                    theme: p.theme,
                    skin: p.skin,
                    isPublished: p.isPublished,
                    status: p.status,
                    version: p.version,
                    blockCount: Array.isArray(p.blocks) ? p.blocks.length : 0,
                    createdAt: p.createdAt?.toISOString() || null,
                    updatedAt: p.updatedAt?.toISOString() || null,
                }))}
            />
        </div>
    );
}
