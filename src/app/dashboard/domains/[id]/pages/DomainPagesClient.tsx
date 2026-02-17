'use client';

import { useMemo, useState } from 'react';
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

type SortOption = 'updated-desc' | 'updated-asc' | 'route-asc' | 'route-desc' | 'blocks-desc';

function formatDateLabel(value: string | null): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return '—';
    return parsed.toLocaleString();
}

function mapPage(p: Record<string, unknown>): PageDef {
    return {
        id: p.id as string,
        route: p.route as string,
        title: (p.title as string | null) ?? null,
        theme: (p.theme as string) || 'clean',
        skin: (p.skin as string) || 'slate',
        isPublished: Boolean(p.isPublished),
        status: (p.status as string) || 'draft',
        version: Number(p.version || 1),
        blockCount: Array.isArray(p.blocks) ? (p.blocks as unknown[]).length : 0,
        createdAt: (p.createdAt as string | null) ?? null,
        updatedAt: (p.updatedAt as string | null) ?? null,
    };
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
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState<SortOption>('updated-desc');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newRoute, setNewRoute] = useState('/landing');
    const [newTitle, setNewTitle] = useState('');
    const [newTheme, setNewTheme] = useState('clean');
    const [newSkin, setNewSkin] = useState('slate');
    const [newPreset, setNewPreset] = useState<'article' | 'homepage'>('article');

    const pageStats = useMemo(() => {
        const published = pages.filter(p => p.status === 'published').length;
        const review = pages.filter(p => p.status === 'review').length;
        const approved = pages.filter(p => p.status === 'approved').length;
        const draft = pages.filter(p => p.status === 'draft').length;
        const totalBlocks = pages.reduce((sum, p) => sum + p.blockCount, 0);
        return { published, review, approved, draft, totalBlocks };
    }, [pages]);

    const filteredPages = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        let next = pages.filter((page) => {
            if (statusFilter !== 'all' && page.status !== statusFilter) return false;
            if (!normalizedQuery) return true;
            return page.route.toLowerCase().includes(normalizedQuery)
                || (page.title || '').toLowerCase().includes(normalizedQuery)
                || page.theme.toLowerCase().includes(normalizedQuery)
                || page.skin.toLowerCase().includes(normalizedQuery);
        });

        next = [...next].sort((a, b) => {
            switch (sortBy) {
                case 'updated-asc':
                    return new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime();
                case 'route-asc':
                    return a.route.localeCompare(b.route);
                case 'route-desc':
                    return b.route.localeCompare(a.route);
                case 'blocks-desc':
                    return b.blockCount - a.blockCount;
                case 'updated-desc':
                default:
                    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
            }
        });

        return next;
    }, [pages, query, statusFilter, sortBy]);

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const allFilteredSelected = filteredPages.length > 0 && filteredPages.every((p) => selectedSet.has(p.id));

    async function refreshPages() {
        try {
            const res = await fetch(`/api/pages?domainId=${domainId}`);
            const data = await res.json();
            if (!Array.isArray(data.pages)) return;
            const mapped = data.pages.map((p: Record<string, unknown>) => mapPage(p));
            setPages(mapped);
            const validIds = new Set(mapped.map((page: PageDef) => page.id));
            setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
        } catch {
            // Silently fail refresh; user can hard refresh
        }
    }

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

    async function handleCreatePage() {
        setLoading('create');
        setError(null);
        setSuccess(null);
        try {
            const normalizedRoute = newRoute.trim();
            if (!normalizedRoute.startsWith('/')) {
                setError('Route must start with /');
                return;
            }

            const preset = newPreset === 'homepage'
                ? `homepage:${siteTemplate}`
                : 'article:article';

            const res = await fetch('/api/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domainId,
                    route: normalizedRoute,
                    title: newTitle.trim() || null,
                    theme: newTheme,
                    skin: newSkin,
                    preset,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to create page');
                return;
            }
            setSuccess(`Created page ${normalizedRoute}`);
            setShowCreateForm(false);
            setNewTitle('');
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Create page failed');
        } finally {
            setLoading(null);
        }
    }

    async function handleDuplicate(pageId: string) {
        setLoading(`dup-${pageId}`);
        setError(null);
        setSuccess(null);
        try {
            const sourceRes = await fetch(`/api/pages/${pageId}`);
            const source = await sourceRes.json();
            if (!sourceRes.ok) {
                setError(source.error || 'Failed to load source page');
                return;
            }

            const sourceRoute = typeof source.route === 'string' ? source.route : '/page';
            const duplicatedRoute = `${sourceRoute}-copy-${Date.now().toString().slice(-4)}`;
            const createRes = await fetch('/api/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domainId,
                    route: duplicatedRoute,
                    title: typeof source.title === 'string' ? `${source.title} (Copy)` : 'Copied page',
                    theme: typeof source.theme === 'string' ? source.theme : 'clean',
                    skin: typeof source.skin === 'string' ? source.skin : 'slate',
                    blocks: Array.isArray(source.blocks) ? source.blocks : [],
                }),
            });
            const created = await createRes.json();
            if (!createRes.ok) {
                setError(created.error || 'Failed to duplicate page');
                return;
            }

            setSuccess(`Duplicated ${sourceRoute} to ${duplicatedRoute}`);
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Duplicate failed');
        } finally {
            setLoading(null);
        }
    }

    async function handleCreateSnapshot(pageId: string) {
        setLoading(`snap-${pageId}`);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(`/api/pages/${pageId}/preview`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to create preview snapshot');
                return;
            }
            const previewPath = data.previewBuild?.previewUrl;
            if (typeof previewPath === 'string') {
                const previewUrl = `${window.location.origin}${previewPath}`;
                await navigator.clipboard.writeText(previewUrl);
                setSuccess('Snapshot created and preview URL copied');
            } else {
                setSuccess('Snapshot created');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Snapshot creation failed');
        } finally {
            setLoading(null);
        }
    }

    function toggleSelected(pageId: string) {
        setSelectedIds((prev) => prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]);
    }

    function toggleSelectAllFiltered() {
        if (allFilteredSelected) {
            setSelectedIds((prev) => prev.filter((id) => !filteredPages.some((p) => p.id === id)));
            return;
        }
        setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const page of filteredPages) next.add(page.id);
            return [...next];
        });
    }

    async function handleBulkStatus(newStatus: string) {
        if (selectedIds.length === 0) return;
        setLoading(`bulk-${newStatus}`);
        setError(null);
        setSuccess(null);
        try {
            const results = await Promise.all(selectedIds.map(async (pageId) => {
                const res = await fetch(`/api/pages/${pageId}/status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                });
                return res.ok;
            }));
            const okCount = results.filter(Boolean).length;
            setSuccess(`Updated ${okCount}/${selectedIds.length} selected pages to ${newStatus}`);
            setSelectedIds([]);
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bulk status update failed');
        } finally {
            setLoading(null);
        }
    }

    async function handleBulkGenerate() {
        if (selectedIds.length === 0) return;
        setLoading('bulk-generate');
        setError(null);
        setSuccess(null);
        try {
            const results = await Promise.all(selectedIds.map(async (pageId) => {
                const res = await fetch(`/api/pages/${pageId}/generate`, { method: 'POST' });
                return res.ok;
            }));
            const okCount = results.filter(Boolean).length;
            setSuccess(`Triggered generation for ${okCount}/${selectedIds.length} selected pages`);
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Bulk generate failed');
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

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Total</span><div className="text-lg font-semibold">{pages.length}</div></div>
                <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Published</span><div className="text-lg font-semibold text-green-600">{pageStats.published}</div></div>
                <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Review</span><div className="text-lg font-semibold text-amber-600">{pageStats.review}</div></div>
                <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Draft</span><div className="text-lg font-semibold">{pageStats.draft}</div></div>
                <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Blocks</span><div className="text-lg font-semibold">{pageStats.totalBlocks}</div></div>
            </div>

            <div className="rounded-lg border p-3">
                <div className="grid gap-2 md:grid-cols-4">
                    <input
                        className="rounded border bg-background px-2 py-1 text-sm"
                        aria-label="Search pages"
                        placeholder="Search route/title/theme/skin"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                        className="rounded border bg-background px-2 py-1 text-sm"
                        aria-label="Filter pages by status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">All statuses</option>
                        <option value="draft">Draft</option>
                        <option value="review">Review</option>
                        <option value="approved">Approved</option>
                        <option value="published">Published</option>
                    </select>
                    <select
                        className="rounded border bg-background px-2 py-1 text-sm"
                        aria-label="Sort pages"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                    >
                        <option value="updated-desc">Last updated (newest)</option>
                        <option value="updated-asc">Last updated (oldest)</option>
                        <option value="route-asc">Route A-Z</option>
                        <option value="route-desc">Route Z-A</option>
                        <option value="blocks-desc">Most blocks</option>
                    </select>
                    <Button variant="outline" size="sm" onClick={() => setShowCreateForm((v) => !v)}>
                        {showCreateForm ? 'Hide Create Form' : 'Create New Page'}
                    </Button>
                </div>

                {showCreateForm && (
                    <div className="mt-3 grid gap-2 md:grid-cols-6">
                        <input
                            className="rounded border bg-background px-2 py-1 text-sm md:col-span-2"
                            aria-label="New page route"
                            placeholder="Route (e.g. /pricing)"
                            value={newRoute}
                            onChange={(e) => setNewRoute(e.target.value)}
                        />
                        <input
                            className="rounded border bg-background px-2 py-1 text-sm md:col-span-2"
                            aria-label="New page title"
                            placeholder="Title (optional)"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                        />
                        <select aria-label="New page theme" className="rounded border bg-background px-2 py-1 text-sm" value={newTheme} onChange={(e) => setNewTheme(e.target.value)}>
                            <option value="clean">clean</option>
                            <option value="editorial">editorial</option>
                            <option value="bold">bold</option>
                            <option value="minimal">minimal</option>
                        </select>
                        <select aria-label="New page skin" className="rounded border bg-background px-2 py-1 text-sm" value={newSkin} onChange={(e) => setNewSkin(e.target.value)}>
                            <option value="slate">slate</option>
                            <option value="ocean">ocean</option>
                            <option value="forest">forest</option>
                            <option value="ember">ember</option>
                            <option value="midnight">midnight</option>
                            <option value="coral">coral</option>
                        </select>
                        <select aria-label="New page preset" className="rounded border bg-background px-2 py-1 text-sm" value={newPreset} onChange={(e) => setNewPreset(e.target.value as 'article' | 'homepage')}>
                            <option value="article">Article preset</option>
                            <option value="homepage">Homepage preset</option>
                        </select>
                        <Button size="sm" onClick={handleCreatePage} disabled={!!loading}>Create Page</Button>
                    </div>
                )}
            </div>

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
                            Showing {filteredPages.length} of {pages.length} page definition{pages.length !== 1 ? 's' : ''} — template: <code className="rounded bg-muted px-1">{siteTemplate}</code>
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={toggleSelectAllFiltered} disabled={filteredPages.length === 0}>
                                {allFilteredSelected ? 'Unselect Visible' : 'Select Visible'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleBulkGenerate} disabled={selectedIds.length === 0 || !!loading}>
                                Generate Selected ({selectedIds.length})
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleBulkStatus('review')} disabled={selectedIds.length === 0 || !!loading}>
                                Submit Selected
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleBulkStatus('published')} disabled={selectedIds.length === 0 || !!loading}>
                                Publish Selected
                            </Button>
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
                        {filteredPages.map(page => (
                            <div key={page.id} className="flex items-center justify-between gap-4 p-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedSet.has(page.id)}
                                            onChange={() => toggleSelected(page.id)}
                                            aria-label={`Select ${page.route}`}
                                        />
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
                                        <span>updated: {formatDateLabel(page.updatedAt)}</span>
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
                                        onClick={() => handleCreateSnapshot(page.id)}
                                        disabled={!!loading}
                                    >
                                        {loading === `snap-${page.id}` ? '...' : 'Snapshot'}
                                    </Button>
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
                                        onClick={() => handleDuplicate(page.id)}
                                        disabled={!!loading}
                                    >
                                        {loading === `dup-${page.id}` ? '...' : 'Duplicate'}
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
                        {filteredPages.length === 0 && (
                            <div className="p-8 text-center text-sm text-muted-foreground">No pages match current filters.</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
