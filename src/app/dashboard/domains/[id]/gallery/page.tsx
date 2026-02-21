import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Eye, LayoutGrid, ExternalLink } from 'lucide-react';
import { db, domains, pageDefinitions } from '@/lib/db';
import { SiteGalleryClient } from './SiteGalleryClient';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function GalleryPage({ params }: PageProps) {
    const { id } = await params;

    const [domain] = await db.select({
        id: domains.id,
        domain: domains.domain,
        niche: domains.niche,
        skin: domains.skin,
        themeStyle: domains.themeStyle,
        siteTemplate: domains.siteTemplate,
    })
        .from(domains)
        .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
        .limit(1);

    if (!domain) notFound();

    const pages = await db.select({
        id: pageDefinitions.id,
        route: pageDefinitions.route,
        title: pageDefinitions.title,
        theme: pageDefinitions.theme,
        skin: pageDefinitions.skin,
        status: pageDefinitions.status,
        isPublished: pageDefinitions.isPublished,
        version: pageDefinitions.version,
        blocks: pageDefinitions.blocks,
        updatedAt: pageDefinitions.updatedAt,
    })
        .from(pageDefinitions)
        .where(eq(pageDefinitions.domainId, id));

    // Sort: homepage first, then alphabetical by route
    const sorted = pages.sort((a, b) => {
        if (a.route === '/') return -1;
        if (b.route === '/') return 1;
        return a.route.localeCompare(b.route);
    });

    const pageSummaries = sorted.map(p => ({
        id: p.id,
        route: p.route,
        title: p.title || (p.route === '/' ? 'Homepage' : p.route),
        theme: p.theme,
        skin: p.skin,
        status: p.status,
        isPublished: p.isPublished,
        blockCount: Array.isArray(p.blocks) ? p.blocks.length : 0,
        version: p.version,
        updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
        previewUrl: `/api/pages/${p.id}/preview?format=html`,
    }));

    const publishedCount = pageSummaries.filter(p => p.isPublished).length;
    const draftCount = pageSummaries.filter(p => !p.isPublished).length;

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-3">
                    <Link href={`/dashboard/domains/${id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                            <h1 className="text-sm font-semibold">{domain.domain}</h1>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Site Gallery · {pageSummaries.length} page{pageSummaries.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                        {publishedCount} published
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                        {draftCount} draft
                    </Badge>
                    <Link href={`/dashboard/domains/${id}/preview`}>
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                            <Eye className="h-3.5 w-3.5" />
                            Full Preview
                        </Button>
                    </Link>
                    <Link href={`/dashboard/domains/${id}/pages`}>
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Page Editor
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Gallery Grid */}
            <SiteGalleryClient
                domainId={id}
                domainName={domain.domain}
                pages={pageSummaries}
            />
        </div>
    );
}
