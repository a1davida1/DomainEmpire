'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Monitor,
    Tablet,
    Smartphone,
    Maximize2,
    X,
    Share2,
    Loader2,
    Check,
    Copy,
} from 'lucide-react';
import { toast } from 'sonner';

interface PageSummary {
    id: string;
    route: string;
    title: string;
    theme: string;
    skin: string;
    status: string;
    isPublished: boolean;
    blockCount: number;
    version: number;
    updatedAt: string | null;
    previewUrl: string;
}

interface SiteGalleryClientProps {
    domainId: string;
    domainName: string;
    pages: PageSummary[];
}

type Viewport = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_SCALES: Record<Viewport, { width: number; height: number; scale: number }> = {
    desktop: { width: 1280, height: 800, scale: 0.25 },
    tablet: { width: 768, height: 1024, scale: 0.25 },
    mobile: { width: 375, height: 667, scale: 0.35 },
};

const STATUS_STYLES: Record<string, string> = {
    draft: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    review: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
    approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    published: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

export function SiteGalleryClient({ domainId, domainName: _domainName, pages }: SiteGalleryClientProps) {
    const [viewport, setViewport] = useState<Viewport>('desktop');
    const [expandedPageId, setExpandedPageId] = useState<string | null>(null);
    const [sharing, setSharing] = useState<string | null>(null);
    const [shareUrl, setShareUrl] = useState<string | null>(null);

    const vp = VIEWPORT_SCALES[viewport];

    async function handleShare(pageId: string) {
        setSharing(pageId);
        setShareUrl(null);
        try {
            const res = await fetch(`/api/pages/${pageId}/share`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || 'Failed to create share link');
                return;
            }
            const data = await res.json();
            setShareUrl(data.shareUrl);
            await navigator.clipboard.writeText(data.shareUrl);
            toast.success('Share link copied to clipboard');
        } catch {
            toast.error('Failed to create share link');
        } finally {
            setSharing(null);
        }
    }

    async function copyShareUrl() {
        if (!shareUrl) return;
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Copied');
    }

    const expandedPage = expandedPageId ? pages.find(p => p.id === expandedPageId) : null;

    return (
        <div className="flex-1 overflow-auto p-4">
            {/* Viewport toggle */}
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-md border bg-card p-1">
                    {([
                        { key: 'desktop' as Viewport, icon: Monitor, label: 'Desktop' },
                        { key: 'tablet' as Viewport, icon: Tablet, label: 'Tablet' },
                        { key: 'mobile' as Viewport, icon: Smartphone, label: 'Mobile' },
                    ]).map(({ key, icon: Icon, label }) => (
                        <Button
                            key={key}
                            size="sm"
                            variant={viewport === key ? 'default' : 'ghost'}
                            className="h-7 gap-1.5 text-xs"
                            onClick={() => setViewport(key)}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </Button>
                    ))}
                </div>
                <span className="text-xs text-muted-foreground">
                    {pages.length} page{pages.length !== 1 ? 's' : ''} · {viewport} view
                </span>
            </div>

            {/* Gallery Grid */}
            <div className={`grid gap-4 ${
                viewport === 'mobile'
                    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
                    : viewport === 'tablet'
                        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            }`}>
                {pages.map((page) => (
                    <div
                        key={page.id}
                        className="group relative rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md"
                    >
                        {/* Thumbnail */}
                        <div
                            className="relative overflow-hidden rounded-t-lg bg-white"
                            style={{
                                height: viewport === 'mobile' ? 200 : viewport === 'tablet' ? 220 : 200,
                            }}
                        >
                            <div
                                style={{
                                    width: vp.width,
                                    height: vp.height,
                                    transform: `scale(${vp.scale})`,
                                    transformOrigin: 'top left',
                                }}
                            >
                                <iframe
                                    src={page.previewUrl}
                                    title={`Preview: ${page.title}`}
                                    className="border-0"
                                    style={{ width: vp.width, height: vp.height }}
                                    sandbox="allow-scripts allow-same-origin"
                                    loading="lazy"
                                    tabIndex={-1}
                                />
                            </div>

                            {/* Hover overlay */}
                            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-8 gap-1.5 text-xs shadow-lg"
                                    onClick={() => setExpandedPageId(page.id)}
                                >
                                    <Maximize2 className="h-3.5 w-3.5" />
                                    Expand
                                </Button>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-8 gap-1.5 text-xs shadow-lg"
                                    onClick={() => handleShare(page.id)}
                                    disabled={sharing === page.id}
                                >
                                    {sharing === page.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Share2 className="h-3.5 w-3.5" />
                                    )}
                                    Share
                                </Button>
                            </div>
                        </div>

                        {/* Card footer */}
                        <div className="flex items-center justify-between px-3 py-2">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{page.title}</p>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                    <span className="text-[10px] text-muted-foreground">{page.route}</span>
                                    <span className="text-[10px] text-muted-foreground">·</span>
                                    <span className="text-[10px] text-muted-foreground">{page.theme}/{page.skin}</span>
                                    <span className="text-[10px] text-muted-foreground">·</span>
                                    <span className="text-[10px] text-muted-foreground">{page.blockCount} blocks</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Badge className={`px-1.5 py-0 text-[9px] ${STATUS_STYLES[page.status] || STATUS_STYLES.draft}`}>
                                    {page.status}
                                </Badge>
                                <Link href={`/dashboard/domains/${domainId}/pages?edit=${page.id}`}>
                                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px]">
                                        Edit
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {pages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <p className="text-sm text-muted-foreground">No pages yet.</p>
                    <Link href={`/dashboard/domains/${domainId}/pages`} className="mt-2 text-sm text-primary hover:underline">
                        Create pages →
                    </Link>
                </div>
            )}

            {/* Expanded preview modal */}
            {expandedPage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={() => { setExpandedPageId(null); setShareUrl(null); }}
                >
                    <div
                        className="relative flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-background shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="flex items-center justify-between border-b px-4 py-2">
                            <div>
                                <p className="text-sm font-semibold">{expandedPage.title}</p>
                                <p className="text-xs text-muted-foreground">
                                    {expandedPage.route} · {expandedPage.theme}/{expandedPage.skin} · v{expandedPage.version}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {shareUrl && (
                                    <div className="flex items-center gap-1 rounded border bg-muted px-2 py-1">
                                        <span className="max-w-[240px] truncate text-[10px]">{shareUrl}</span>
                                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={copyShareUrl}>
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1.5 text-xs"
                                    onClick={() => handleShare(expandedPage.id)}
                                    disabled={sharing === expandedPage.id}
                                >
                                    {sharing === expandedPage.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : shareUrl ? (
                                        <Check className="h-3.5 w-3.5" />
                                    ) : (
                                        <Share2 className="h-3.5 w-3.5" />
                                    )}
                                    {shareUrl ? 'Copied' : 'Share'}
                                </Button>
                                <Link href={`/dashboard/domains/${domainId}/pages?edit=${expandedPage.id}`}>
                                    <Button size="sm" variant="outline" className="h-7 text-xs">
                                        Edit Page
                                    </Button>
                                </Link>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => { setExpandedPageId(null); setShareUrl(null); }}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Full preview iframe */}
                        <div className="flex-1 overflow-hidden bg-white dark:bg-zinc-900">
                            <iframe
                                src={expandedPage.previewUrl}
                                title={`Preview: ${expandedPage.title}`}
                                className="h-full w-full border-0"
                                style={{ minHeight: '70vh' }}
                                sandbox="allow-scripts allow-same-origin"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
