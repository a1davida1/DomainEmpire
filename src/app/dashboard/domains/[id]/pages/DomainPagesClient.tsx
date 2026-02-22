'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VisualConfigurator } from '@/components/dashboard/VisualConfigurator';
import {
    computeChecklist,
    generateRandomizePlan,
    generateSeed,
    type PageSnapshot,
} from '@/lib/site-randomizer';

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
    blockTypes: string[];
    createdAt: string | null;
    updatedAt: string | null;
}

interface Props {
    domainId: string;
    domainName: string;
    siteTemplate: string;
    contentTypeMix: Record<string, number> | null;
    initialSeed: number | null;
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
        blockTypes: Array.isArray(p.blocks)
            ? (p.blocks as { type?: string }[]).map(b => b.type || '').filter(Boolean)
            : [],
        createdAt: (p.createdAt as string | null) ?? null,
        updatedAt: (p.updatedAt as string | null) ?? null,
    };
}

export function DomainPagesClient({ domainId, domainName, siteTemplate, contentTypeMix, initialSeed, initialPages }: Props) {
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
    const [quickDeploySeed, setQuickDeploySeed] = useState<number | null>(initialSeed);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    const pageStats = useMemo(() => {
        const published = pages.filter(p => p.status === 'published').length;
        const review = pages.filter(p => p.status === 'review').length;
        const approved = pages.filter(p => p.status === 'approved').length;
        const draft = pages.filter(p => p.status === 'draft').length;
        const totalBlocks = pages.reduce((sum, p) => sum + p.blockCount, 0);
        return { published, review, approved, draft, totalBlocks };
    }, [pages]);

    const checklist = useMemo(() => {
        const snapshots: PageSnapshot[] = pages.map(p => ({
            id: p.id,
            route: p.route,
            title: p.title || '',
            theme: p.theme,
            skin: p.skin,
            isPublished: p.isPublished,
            blocks: p.blockTypes.map((type, i) => ({ id: `chk_${i}`, type })),
        }));
        return computeChecklist(snapshots, siteTemplate);
    }, [pages, siteTemplate]);

    const configuratorPage = useMemo(() => {
        if (pages.length === 0) return null;
        return pages.find((page) => page.route === '/') ?? pages[0];
    }, [pages]);

    async function applyRandomizePlan(seed: number) {
        setLoading('randomize');
        setError(null);
        setSuccess(null);

        try {
            // If no pages exist, seed them first
            if (pages.length === 0) {
                const seedRes = await fetch('/api/pages/seed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domainId, publish: false }),
                });
                if (!seedRes.ok) {
                    const data = await seedRes.json();
                    setError(data.error || 'Failed to seed pages before randomizing');
                    return;
                }
                await refreshPages();
            }

            // Re-fetch current pages list to get latest IDs
            const listRes = await fetch(`/api/pages?domainId=${domainId}`);
            if (!listRes.ok) {
                const listErr = await listRes.json().catch(() => ({}));
                setError((listErr as Record<string, string>).error || 'Failed to fetch page list');
                return;
            }
            const listData = await listRes.json();
            const currentPageIds: string[] = Array.isArray(listData.pages)
                ? listData.pages.map((p: Record<string, unknown>) => p.id as string)
                : [];

            // Fetch full page data for all pages
            const fullPages: PageSnapshot[] = [];
            for (const pid of currentPageIds) {
                const res = await fetch(`/api/pages/${pid}`);
                if (!res.ok) continue;
                const data = await res.json();
                fullPages.push({
                    id: data.id,
                    route: data.route,
                    title: data.title || '',
                    theme: data.theme,
                    skin: data.skin,
                    isPublished: data.isPublished,
                    blocks: Array.isArray(data.blocks) ? data.blocks : [],
                });
            }

            const plan = generateRandomizePlan(seed, fullPages, siteTemplate, domainName);

            // Apply page updates
            let updatedCount = 0;
            for (const pu of plan.pageUpdates) {
                const res = await fetch(`/api/pages/${pu.pageId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        theme: pu.theme,
                        skin: pu.skin,
                        blocks: pu.blocks,
                        isPublished: true,
                    }),
                });
                if (res.ok) updatedCount++;
            }

            // Create missing pages
            let createdCount = 0;
            for (const mp of plan.missingPages) {
                const res = await fetch('/api/pages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domainId,
                        route: mp.route,
                        title: mp.title,
                        theme: mp.theme,
                        skin: mp.skin,
                        blocks: mp.blocks,
                        isPublished: mp.publish,
                    }),
                });
                if (res.ok) createdCount++;
            }

            // Store seed in domain contentConfig
            await fetch(`/api/domains/${domainId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contentConfig: { quickDeploySeed: seed } }),
            });

            setQuickDeploySeed(seed);
            setSuccess(
                `Randomized: ${plan.theme}/${plan.skin} — ${updatedCount} page${updatedCount !== 1 ? 's' : ''} updated` +
                (createdCount > 0 ? `, ${createdCount} created` : '') +
                ` (seed: ${seed})`
            );
            await refreshPages();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Randomize failed');
        } finally {
            setLoading(null);
        }
    }

    async function handleRandomize() {
        const seed = quickDeploySeed ?? generateSeed();
        await applyRandomizePlan(seed);
    }

    async function handleReroll() {
        const seed = generateSeed();
        await applyRandomizePlan(seed);
    }

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
            setNewRoute('/landing');
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
            const duplicatedRoute = `${sourceRoute}-copy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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

        // Pre-filter: only attempt pages whose current status allows this transition
        const VALID_TRANSITIONS: Record<string, string[]> = {
            draft: ['review'],
            review: ['approved', 'draft'],
            approved: ['published', 'review', 'draft'],
            published: ['draft'],
        };
        const eligible = selectedIds.filter((id) => {
            const page = pages.find((p) => p.id === id);
            if (!page) return false;
            const allowed = VALID_TRANSITIONS[page.status];
            return allowed?.includes(newStatus) ?? false;
        });
        const skippedCount = selectedIds.length - eligible.length;

        if (eligible.length === 0) {
            setError(`No selected pages can transition to "${newStatus}". Valid transitions depend on current status.`);
            return;
        }

        setLoading(`bulk-${newStatus}`);
        setError(null);
        setSuccess(null);
        try {
            let okCount = 0;
            const errors: string[] = [];
            // Process in batches of 5 to avoid overwhelming the server
            for (let i = 0; i < eligible.length; i += 5) {
                const batch = eligible.slice(i, i + 5);
                const results = await Promise.all(batch.map(async (pageId) => {
                    const res = await fetch(`/api/pages/${pageId}/status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus }),
                    });
                    if (res.ok) return { ok: true, error: '' };
                    const data = await res.json().catch(() => ({}));
                    return { ok: false, error: (data as Record<string, unknown>).error as string || `HTTP ${res.status}` };
                }));
                for (const r of results) {
                    if (r.ok) okCount++;
                    else errors.push(r.error);
                }
            }
            let msg = `Updated ${okCount}/${eligible.length} eligible pages to ${newStatus}`;
            if (skippedCount > 0) msg += ` (${skippedCount} skipped — wrong status)`;
            if (errors.length > 0) msg += `. Errors: ${[...new Set(errors)].join('; ')}`;
            setSuccess(msg);
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
            let okCount = 0;
            // Process in batches of 5 to avoid overwhelming the server
            for (let i = 0; i < selectedIds.length; i += 5) {
                const batch = selectedIds.slice(i, i + 5);
                const results = await Promise.all(batch.map(async (pageId) => {
                    const res = await fetch(`/api/pages/${pageId}/generate`, { method: 'POST' });
                    return res.ok;
                }));
                okCount += results.filter(Boolean).length;
            }
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
                contentTypeMix={contentTypeMix}
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

    function statusBadge(status: string) {
        switch (status) {
            case 'published': return <Badge className="bg-green-600 text-white">Published</Badge>;
            case 'approved': return <Badge className="bg-emerald-600 text-white">Approved</Badge>;
            case 'review': return <Badge className="bg-amber-500 text-white">In Review</Badge>;
            default: return <Badge variant="secondary">Draft</Badge>;
        }
    }

    function primaryAction(page: PageDef) {
        if (page.status === 'draft') return { label: 'Submit for Review', action: () => handleStatusTransition(page.id, 'review') };
        if (page.status === 'review') return { label: 'Approve', action: () => handleStatusTransition(page.id, 'approved') };
        if (page.status === 'approved') return { label: 'Publish', action: () => handleStatusTransition(page.id, 'published') };
        return { label: 'Open Configurator', action: () => openBlockEditor(page.id) };
    }

    return (
        <div className="space-y-6">
            {/* Alerts */}
            {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                </div>
            )}
            {success && (
                <div className="rounded-lg border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
                    {success}
                    {stagingUrl && (
                        <a href={stagingUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block font-medium underline">
                            {stagingUrl}
                        </a>
                    )}
                </div>
            )}

            {/* Stats bar */}
            <div className="flex items-center gap-6 rounded-lg border px-5 py-3">
                <div className="text-sm"><span className="text-muted-foreground">Pages:</span> <strong>{pages.length}</strong></div>
                <div className="text-sm"><span className="text-green-600">Published:</span> <strong>{pageStats.published}</strong></div>
                <div className="text-sm"><span className="text-amber-600">Review:</span> <strong>{pageStats.review}</strong></div>
                <div className="text-sm"><span className="text-muted-foreground">Draft:</span> <strong>{pageStats.draft}</strong></div>
                <div className="ml-auto text-xs text-muted-foreground">
                    Template: <code className="rounded bg-muted px-1.5 py-0.5">{siteTemplate}</code>
                </div>
            </div>

            {/* Quick Actions — collapsed into a clean row */}
            <div className="flex flex-wrap items-center gap-2">
                {configuratorPage && (
                    <Button variant="outline" size="sm" onClick={() => openBlockEditor(configuratorPage.id)} disabled={!!loading}>
                        Visual Configurator
                    </Button>
                )}
                <Button onClick={handleRandomize} disabled={!!loading} size="sm">
                    {loading === 'randomize' ? 'Applying...' : quickDeploySeed ? 'Re-apply Design' : 'Auto-Design All Pages'}
                </Button>
                <Button variant="outline" onClick={handleReroll} disabled={!!loading} size="sm">
                    {loading === 'randomize' ? '...' : 'New Random Design'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleStagingDeploy} disabled={!!loading}>
                    {loading === 'staging' ? 'Deploying...' : 'Preview Staging'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowCreateForm(v => !v)}>
                    + Add Page
                </Button>
                {quickDeploySeed && (
                    <span className="text-xs text-muted-foreground">
                        Design seed: <code className="rounded bg-muted px-1">{quickDeploySeed}</code>
                    </span>
                )}
            </div>

            {/* Create new page form */}
            {showCreateForm && (
                <div className="rounded-lg border bg-muted/30 p-4">
                    <h4 className="mb-3 text-sm font-semibold">Create New Page</h4>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1 sm:col-span-2">
                            <label htmlFor="newRoute" className="text-xs font-medium text-muted-foreground">Route</label>
                            <input id="newRoute" className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="/pricing" value={newRoute} onChange={(e) => setNewRoute(e.target.value)} />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                            <label htmlFor="newTitle" className="text-xs font-medium text-muted-foreground">Title (optional)</label>
                            <input id="newTitle" className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Pricing Guide" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="newTheme" className="text-xs font-medium text-muted-foreground">Theme</label>
                            <select id="newTheme" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={newTheme} onChange={(e) => setNewTheme(e.target.value)}>
                                <option value="clean">Clean</option>
                                <option value="editorial">Editorial</option>
                                <option value="bold">Bold</option>
                                <option value="minimal">Minimal</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="newSkin" className="text-xs font-medium text-muted-foreground">Color Skin</label>
                            <select id="newSkin" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={newSkin} onChange={(e) => setNewSkin(e.target.value)}>
                                <option value="slate">Slate</option>
                                <option value="ocean">Ocean</option>
                                <option value="forest">Forest</option>
                                <option value="ember">Ember</option>
                                <option value="midnight">Midnight</option>
                                <option value="coral">Coral</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="newPreset" className="text-xs font-medium text-muted-foreground">Page Type</label>
                            <select id="newPreset" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={newPreset} onChange={(e) => setNewPreset(e.target.value as 'article' | 'homepage')}>
                                <option value="article">Article Page</option>
                                <option value="homepage">Homepage</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <Button className="w-full" onClick={handleCreatePage} disabled={!!loading}>
                                {loading === 'create' ? 'Creating...' : 'Create Page'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Search & filter */}
            <div className="flex flex-wrap items-center gap-2">
                <input
                    className="min-w-[200px] flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                    aria-label="Search pages"
                    placeholder="Search pages..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <select className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="review">In Review</option>
                    <option value="approved">Approved</option>
                    <option value="published">Published</option>
                </select>
                <select className="rounded-md border bg-background px-3 py-2 text-sm" aria-label="Sort pages" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
                    <option value="updated-desc">Newest first</option>
                    <option value="updated-asc">Oldest first</option>
                    <option value="route-asc">Route A-Z</option>
                    <option value="route-desc">Route Z-A</option>
                    <option value="blocks-desc">Most blocks</option>
                </select>
            </div>

            {/* Bulk actions — only visible when items selected */}
            {selectedIds.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 dark:border-blue-800 dark:bg-blue-950">
                    <span className="text-sm font-medium">{selectedIds.length} selected</span>
                    <span className="text-muted-foreground">|</span>
                    <Button variant="ghost" size="sm" onClick={handleBulkGenerate} disabled={!!loading}>Generate Content</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleBulkStatus('review')} disabled={!!loading}>Submit for Review</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleBulkStatus('published')} disabled={!!loading}>Publish All</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
                </div>
            )}

            {/* Page list */}
            {pages.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-12 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <span className="text-2xl">+</span>
                    </div>
                    <h3 className="text-lg font-semibold">No pages yet</h3>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                        Get started by auto-generating pages for <strong>{domainName}</strong>, or create one manually.
                    </p>
                    <div className="mt-4 flex justify-center gap-3">
                        <Button onClick={handleSeed} disabled={loading === 'seed'}>
                            {loading === 'seed' ? 'Generating...' : 'Auto-Generate Pages'}
                        </Button>
                        <Button variant="outline" onClick={() => setShowCreateForm(true)}>
                            Create Manually
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {filteredPages.length} of {pages.length} page{pages.length !== 1 ? 's' : ''}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={toggleSelectAllFiltered} disabled={filteredPages.length === 0}>
                                {allFilteredSelected ? 'Deselect all' : 'Select all'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleSeed} disabled={!!loading}>
                                Re-generate
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {filteredPages.map(page => {
                            const pa = primaryAction(page);
                            const menuOpen = openMenuId === page.id;
                            return (
                                <div key={page.id} className="group rounded-lg border p-4 transition-colors hover:bg-muted/30">
                                    <div className="flex items-start gap-3">
                                        <input
                                            type="checkbox"
                                            className="mt-1 h-4 w-4 rounded border"
                                            checked={selectedSet.has(page.id)}
                                            onChange={() => toggleSelected(page.id)}
                                            aria-label={`Select ${page.route}`}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-semibold">{page.route}</span>
                                                {statusBadge(page.status)}
                                            </div>
                                            {page.title && (
                                                <p className="mt-0.5 text-sm text-muted-foreground">{page.title}</p>
                                            )}
                                            <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
                                                <span>{page.blockCount} block{page.blockCount !== 1 ? 's' : ''}</span>
                                                <span className="capitalize">{page.theme} / {page.skin}</span>
                                                <span>{formatDateLabel(page.updatedAt)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={`/api/pages/${page.id}/preview`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                            >
                                                Preview
                                            </a>
                                            <Button size="sm" onClick={() => openBlockEditor(page.id)} disabled={!!loading}>
                                                Visual Configurator
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={pa.action} disabled={!!loading || loading === `status-${page.id}`}>
                                                {loading === `status-${page.id}` ? '...' : pa.label}
                                            </Button>
                                            {/* More actions dropdown */}
                                            <div className="relative">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="px-2"
                                                    onClick={() => setOpenMenuId(menuOpen ? null : page.id)}
                                                    aria-label="More actions"
                                                >
                                                    &#8943;
                                                </Button>
                                                {menuOpen && (
                                                    <div
                                                        className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border bg-background py-1 shadow-lg"
                                                        onMouseLeave={() => setOpenMenuId(null)}
                                                    >
                                                        <button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { handleGenerate(page.id); setOpenMenuId(null); }}>
                                                            Generate Content
                                                        </button>
                                                        <button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { handleDuplicate(page.id); setOpenMenuId(null); }}>
                                                            Duplicate Page
                                                        </button>
                                                        <button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { handleCreateSnapshot(page.id); setOpenMenuId(null); }}>
                                                            Create Snapshot
                                                        </button>
                                                        {page.status !== 'draft' && (
                                                            <button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { handleStatusTransition(page.id, 'draft'); setOpenMenuId(null); }}>
                                                                Revert to Draft
                                                            </button>
                                                        )}
                                                        <hr className="my-1 border-border" />
                                                        <button className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10" onClick={() => { handleDelete(page.id); setOpenMenuId(null); }}>
                                                            Delete Page
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {filteredPages.length === 0 && (
                            <div className="rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground">
                                No pages match your filters.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Checklist — collapsed at the bottom as a details disclosure */}
            {pages.length > 0 && (
                <details className="rounded-lg border">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                        Site Readiness Checklist
                        <span className="ml-2 text-xs text-muted-foreground">
                            {checklist.mustHaveMet}/{checklist.mustHaveTotal} required
                            {checklist.score >= 80 && ' — Ready!'}
                        </span>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                                className={`h-full rounded-full transition-all ${
                                    checklist.score >= 80 ? 'bg-green-500' :
                                    checklist.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${checklist.score}%` }}
                            />
                        </div>
                    </summary>
                    <div className="border-t px-4 py-3">
                        <ul className="space-y-1.5">
                            {checklist.items.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs">
                                    <span className={`mt-0.5 flex-shrink-0 ${item.met ? 'text-green-500' : 'text-muted-foreground'}`}>
                                        {item.met ? '✓' : '○'}
                                    </span>
                                    <span className={item.met ? 'text-muted-foreground line-through' : 'text-foreground'}>
                                        {item.label}
                                        {item.priority === 'must' && !item.met && (
                                            <Badge variant="destructive" className="ml-1.5 px-1 py-0 text-[10px]">Required</Badge>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </details>
            )}
        </div>
    );
}
