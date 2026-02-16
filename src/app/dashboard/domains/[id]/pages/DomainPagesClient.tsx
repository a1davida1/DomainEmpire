'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PageDef {
    id: string;
    route: string;
    title: string | null;
    theme: string;
    skin: string;
    isPublished: boolean;
    version: number;
    blockCount: number;
    createdAt: string | null;
    updatedAt: string | null;
}

interface Props {
    domainId: string;
    domainName: string;
    siteTemplate: string;
    initialPages: PageDef[];
}

export function DomainPagesClient({ domainId, domainName, siteTemplate, initialPages }: Props) {
    const [pages, setPages] = useState<PageDef[]>(initialPages);
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    async function handleSeed() {
        setLoading('seed');
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch('/api/pages/seed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domainId, publish: false }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to seed pages');
                return;
            }
            if (data.skipped) {
                setSuccess(data.skipReason || 'Pages already exist');
                return;
            }
            setSuccess(`Seeded ${data.homepageCreated ? 1 : 0} homepage + ${data.articlePagesCreated} article pages (${data.totalBlockCount} blocks)`);
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Seed failed');
        } finally {
            setLoading(null);
        }
    }

    async function handleGenerate(pageId: string) {
        setLoading(`gen-${pageId}`);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(`/api/pages/${pageId}/generate`, {
                method: 'POST',
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to generate content');
                return;
            }
            setSuccess(`Generated ${data.successCount} blocks, ${data.failureCount} failed, ${data.skippedCount} skipped. Cost: $${data.totalCost?.toFixed(4) || '0'}`);
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Generation failed');
        } finally {
            setLoading(null);
        }
    }

    async function handlePublish(pageId: string, publish: boolean) {
        setLoading(`pub-${pageId}`);
        setError(null);
        try {
            const res = await fetch(`/api/pages/${pageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isPublished: publish }),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to update');
                return;
            }
            setSuccess(`Page ${publish ? 'published' : 'unpublished'}`);
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setLoading(null);
        }
    }

    async function handleDelete(pageId: string) {
        if (!confirm('Delete this page definition? This cannot be undone.')) return;
        setLoading(`del-${pageId}`);
        setError(null);
        try {
            const res = await fetch(`/api/pages/${pageId}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to delete');
                return;
            }
            setSuccess('Page deleted');
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setLoading(null);
        }
    }

    async function refreshPages() {
        try {
            const res = await fetch(`/api/pages?domainId=${domainId}`);
            const data = await res.json();
            if (data.pages) {
                setPages(data.pages.map((p: Record<string, unknown>) => ({
                    id: p.id,
                    route: p.route,
                    title: p.title,
                    theme: p.theme,
                    skin: p.skin,
                    isPublished: p.isPublished,
                    version: p.version,
                    blockCount: Array.isArray(p.blocks) ? (p.blocks as unknown[]).length : 0,
                    createdAt: p.createdAt,
                    updatedAt: p.updatedAt,
                })));
            }
        } catch {
            // Silently fail refresh — user can reload
        }
    }

    return (
        <div className="space-y-4">
            {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
                    {success}
                </div>
            )}

            {pages.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-8 text-center">
                    <h3 className="text-lg font-semibold">No v2 page definitions yet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Seed block-based pages from the <code className="rounded bg-muted px-1">{siteTemplate}</code> preset for <strong>{domainName}</strong>.
                    </p>
                    <Button
                        className="mt-4"
                        onClick={handleSeed}
                        disabled={loading === 'seed'}
                    >
                        {loading === 'seed' ? 'Seeding...' : 'Seed Page Definitions'}
                    </Button>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {pages.length} page definition{pages.length !== 1 ? 's' : ''} — template: <code className="rounded bg-muted px-1">{siteTemplate}</code>
                        </p>
                        <Button variant="outline" size="sm" onClick={handleSeed} disabled={!!loading}>
                            Re-seed
                        </Button>
                    </div>

                    <div className="divide-y rounded-lg border">
                        {pages.map(page => (
                            <div key={page.id} className="flex items-center justify-between gap-4 p-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm font-medium">{page.route}</span>
                                        {page.isPublished ? (
                                            <Badge variant="default" className="bg-green-600">Published</Badge>
                                        ) : (
                                            <Badge variant="secondary">Draft</Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">v{page.version}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                        {page.title && <span>{page.title}</span>}
                                        <span>{page.blockCount} blocks</span>
                                        <span>theme: {page.theme}</span>
                                        <span>skin: {page.skin}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <a
                                        href={`/api/pages/${page.id}/preview`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                        Preview
                                    </a>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleGenerate(page.id)}
                                        disabled={!!loading}
                                    >
                                        {loading === `gen-${page.id}` ? 'Generating...' : 'Generate'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePublish(page.id, !page.isPublished)}
                                        disabled={!!loading}
                                    >
                                        {loading === `pub-${page.id}` ? '...' : page.isPublished ? 'Unpublish' : 'Publish'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => handleDelete(page.id)}
                                        disabled={!!loading}
                                    >
                                        {loading === `del-${page.id}` ? '...' : 'Delete'}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
