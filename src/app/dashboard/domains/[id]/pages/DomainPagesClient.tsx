'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VisualConfigurator } from '@/components/dashboard/VisualConfigurator';

interface PageDef {
    id: string;
    route: string;
    title: string | null;
    theme: string;
    skin: string;
    isPublished: boolean;
    status: string;
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
    const [stagingUrl, setStagingUrl] = useState<string | null>(null);
    const [editingPageId, setEditingPageId] = useState<string | null>(null);
    const [editingBlocks, setEditingBlocks] = useState<Record<string, unknown>[] | null>(null);
    const [editingTheme, setEditingTheme] = useState('clean');
    const [editingSkin, setEditingSkin] = useState('slate');

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

    async function handleDelete(pageId: string) {
        if (!confirm('Delete this page definition? This cannot be undone.')) return;
        setLoading(`del-${pageId}`);
        setError(null);
        setSuccess(null);
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

    async function handleStatusTransition(pageId: string, newStatus: string) {
        setLoading(`status-${pageId}`);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(`/api/pages/${pageId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || `Failed to transition to ${newStatus}`);
                return;
            }
            setSuccess(`Page status changed to ${newStatus}`);
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Status update failed');
        } finally {
            setLoading(null);
        }
    }

    async function handleStagingDeploy() {
        setLoading('staging');
        setError(null);
        setSuccess(null);
        setStagingUrl(null);
        try {
            const res = await fetch(`/api/domains/${domainId}/staging-deploy`, {
                method: 'POST',
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Staging deploy failed');
                return;
            }
            setStagingUrl(data.stagingUrl || null);
            setSuccess(`Staging deploy complete — ${data.fileCount} files uploaded`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Staging deploy failed');
        } finally {
            setLoading(null);
        }
    }

    async function openBlockEditor(pageId: string) {
        setError(null);
        try {
            const res = await fetch(`/api/pages/${pageId}`);
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to load page');
                return;
            }
            setEditingPageId(pageId);
            setEditingBlocks(Array.isArray(data.blocks) ? data.blocks : []);
            setEditingTheme(data.theme || 'clean');
            setEditingSkin(data.skin || 'slate');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load page');
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
                    status: (p.status as string) || 'draft',
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

    // If editing a page, show the Visual Configurator
    if (editingPageId && editingBlocks) {
        return (
            <VisualConfigurator
                pageId={editingPageId}
                domainId={domainId}
                initialBlocks={editingBlocks as { id: string; type: string; variant?: string; config?: Record<string, unknown>; content?: Record<string, unknown> }[]}
                initialTheme={editingTheme}
                initialSkin={editingSkin}
                onSave={() => {
                    setEditingPageId(null);
                    setEditingBlocks(null);
                    setSuccess('Blocks saved successfully');
                    refreshPages();
                }}
                onCancel={() => {
                    setEditingPageId(null);
                    setEditingBlocks(null);
                }}
            />
        );
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
                    {stagingUrl && (
                        <div className="mt-1">
                            <a
                                href={stagingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium underline"
                            >
                                {stagingUrl}
                            </a>
                        </div>
                    )}
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
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleStagingDeploy}
                                disabled={!!loading}
                            >
                                {loading === 'staging' ? 'Deploying...' : 'Staging Deploy'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleSeed} disabled={!!loading}>
                                Re-seed
                            </Button>
                        </div>
                    </div>

                    <div className="divide-y rounded-lg border">
                        {pages.map(page => (
                            <div key={page.id} className="flex items-center justify-between gap-4 p-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm font-medium">{page.route}</span>
                                        {page.status === 'published' ? (
                                            <Badge variant="default" className="bg-green-600">Published</Badge>
                                        ) : page.status === 'approved' ? (
                                            <Badge variant="default" className="bg-emerald-600">Approved</Badge>
                                        ) : page.status === 'review' ? (
                                            <Badge variant="default" className="bg-amber-500">In Review</Badge>
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
                                        onClick={() => openBlockEditor(page.id)}
                                        disabled={!!loading}
                                    >
                                        Edit Blocks
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleGenerate(page.id)}
                                        disabled={!!loading}
                                    >
                                        {loading === `gen-${page.id}` ? 'Generating...' : 'Generate'}
                                    </Button>
                                    {page.status === 'draft' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleStatusTransition(page.id, 'review')}
                                            disabled={!!loading}
                                        >
                                            {loading === `status-${page.id}` ? '...' : 'Submit for Review'}
                                        </Button>
                                    )}
                                    {page.status === 'approved' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleStatusTransition(page.id, 'published')}
                                            disabled={!!loading}
                                        >
                                            {loading === `status-${page.id}` ? '...' : 'Publish'}
                                        </Button>
                                    )}
                                    {(page.status === 'published' || page.status === 'review') && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleStatusTransition(page.id, 'draft')}
                                            disabled={!!loading}
                                        >
                                            {loading === `status-${page.id}` ? '...' : 'Back to Draft'}
                                        </Button>
                                    )}
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
