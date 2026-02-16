'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ============================================================
// Types
// ============================================================

interface Block {
    id: string;
    type: string;
    variant?: string;
    config?: Record<string, unknown>;
    content?: Record<string, unknown>;
}

interface BlockEditorProps {
    pageId: string;
    initialBlocks: Block[];
    onSave?: (blocks: Block[]) => void;
    onCancel?: () => void;
}

const BLOCK_CATEGORIES: Record<string, string[]> = {
    Layout: ['Header', 'Footer', 'Sidebar'],
    Content: ['Hero', 'ArticleBody', 'FAQ', 'StepByStep', 'Checklist', 'AuthorBio'],
    Comparison: ['ComparisonTable', 'VsCard', 'RankingList', 'ProsConsCard'],
    Conversion: ['LeadForm', 'CTABanner', 'PricingTable', 'ScrollCTA'],
    Data: ['QuoteCalculator', 'CostBreakdown', 'StatGrid', 'DataTable'],
    Social: ['TestimonialGrid', 'TrustBadges', 'CitationBlock'],
    Utility: ['LastUpdated', 'MedicalDisclaimer', 'PdfDownload', 'EmbedWidget'],
    Interactive: ['Wizard', 'GeoContent', 'InteractiveMap'],
};

const VARIANT_OPTIONS: Record<string, string[]> = {
    Header: ['topbar', 'centered', 'minimal', 'split'],
    Footer: ['multi-column', 'newsletter', 'minimal', 'legal'],
    Hero: ['centered', 'split', 'minimal', 'gradient', 'image'],
    Wizard: ['wizard', 'quiz', 'survey', 'assessment', 'configurator'],
    ComparisonTable: ['table', 'cards'],
    CTABanner: ['bar', 'card', 'banner'],
};

function generateBlockId(): string {
    return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ============================================================
// Block Editor Component
// ============================================================

export function BlockEditor({ pageId, initialBlocks, onSave, onCancel }: BlockEditorProps) {
    const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
    const [showPalette, setShowPalette] = useState(false);
    const [insertIndex, setInsertIndex] = useState<number | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [dirty, setDirty] = useState(false);
    const [regenerating, setRegenerating] = useState<string | null>(null);
    const [regenResult, setRegenResult] = useState<string | null>(null);

    const markDirty = useCallback(() => setDirty(true), []);

    // --- Reorder via drag & drop ---
    function handleDragStart(index: number) {
        setDragIndex(index);
    }

    function handleDragOver(e: React.DragEvent, index: number) {
        e.preventDefault();
        setDragOverIndex(index);
    }

    function handleDrop(index: number) {
        if (dragIndex === null || dragIndex === index) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }
        const updated = [...blocks];
        const [moved] = updated.splice(dragIndex, 1);
        updated.splice(index, 0, moved);
        setBlocks(updated);
        setDragIndex(null);
        setDragOverIndex(null);
        markDirty();
    }

    function handleDragEnd() {
        setDragIndex(null);
        setDragOverIndex(null);
    }

    // --- Move up/down ---
    function moveBlock(index: number, direction: -1 | 1) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= blocks.length) return;
        const updated = [...blocks];
        [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
        setBlocks(updated);
        markDirty();
    }

    // --- Remove ---
    function removeBlock(index: number) {
        setBlocks(prev => prev.filter((_, i) => i !== index));
        markDirty();
    }

    // --- Add ---
    function openPalette(index: number) {
        setInsertIndex(index);
        setShowPalette(true);
    }

    function addBlock(type: string) {
        const newBlock: Block = {
            id: generateBlockId(),
            type,
            variant: VARIANT_OPTIONS[type]?.[0],
            config: {},
            content: {},
        };
        const idx = insertIndex ?? blocks.length;
        const updated = [...blocks];
        updated.splice(idx, 0, newBlock);
        setBlocks(updated);
        setShowPalette(false);
        setInsertIndex(null);
        markDirty();
    }

    // --- Edit block fields ---
    function updateBlockField(index: number, field: 'variant' | 'config' | 'content', key: string, value: unknown) {
        setBlocks(prev => {
            const updated = [...prev];
            const block = { ...updated[index] };
            if (field === 'variant') {
                block.variant = value as string;
            } else {
                const obj = { ...(block[field] || {}) };
                obj[key] = value;
                block[field] = obj;
            }
            updated[index] = block;
            return updated;
        });
        markDirty();
    }

    // --- Regenerate single block ---
    async function handleRegenerateBlock(blockId: string) {
        setRegenerating(blockId);
        setRegenResult(null);
        setError(null);
        try {
            const res = await fetch(`/api/pages/${pageId}/blocks/${blockId}/regenerate`, {
                method: 'POST',
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Regeneration failed');
                return;
            }
            setRegenResult(`Regenerated ${data.blockType} — ${data.tokensUsed} tokens, $${(data.cost || 0).toFixed(4)}`);
            // Reload blocks to get updated content
            const pageRes = await fetch(`/api/pages/${pageId}`);
            const pageData = await pageRes.json();
            if (pageRes.ok && Array.isArray(pageData.blocks)) {
                setBlocks(pageData.blocks);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Regeneration failed');
        } finally {
            setRegenerating(null);
        }
    }

    // --- Save ---
    async function handleSave() {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/pages/${pageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocks }),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Save failed');
                return;
            }
            setDirty(false);
            onSave?.(blocks);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{blocks.length} blocks</span>
                    {dirty && <Badge variant="secondary" className="text-xs">Unsaved changes</Badge>}
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openPalette(blocks.length)}>
                        + Add Block
                    </Button>
                    {onCancel && (
                        <Button size="sm" variant="ghost" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                        {saving ? 'Saving...' : 'Save Blocks'}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                </div>
            )}
            {regenResult && (
                <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
                    {regenResult}
                </div>
            )}

            {/* Block List */}
            <div className="space-y-1">
                {blocks.map((block, index) => (
                    <div key={block.id}>
                        {/* Drop zone above */}
                        <div
                            className={`h-1 rounded transition-all ${dragOverIndex === index ? 'bg-blue-400 h-2' : ''}`}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDrop={() => handleDrop(index)}
                        />
                        <div
                            className={`group rounded-lg border p-3 transition-all ${
                                dragIndex === index ? 'opacity-40' : ''
                            } ${expandedBlock === block.id ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20' : 'hover:border-muted-foreground/30'}`}
                            draggable
                            onDragStart={() => handleDragStart(index)}
                            onDragEnd={handleDragEnd}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="cursor-grab text-muted-foreground" title="Drag to reorder">⠿</span>
                                    <Badge variant="outline" className="font-mono text-xs">{block.type}</Badge>
                                    {block.variant && (
                                        <span className="text-xs text-muted-foreground">({block.variant})</span>
                                    )}
                                    {block.content && Object.keys(block.content).length > 0 && (
                                        <span className="text-xs text-green-600">●</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        className="rounded p-1 text-xs text-muted-foreground hover:bg-muted"
                                        onClick={() => moveBlock(index, -1)}
                                        disabled={index === 0}
                                        title="Move up"
                                    >↑</button>
                                    <button
                                        className="rounded p-1 text-xs text-muted-foreground hover:bg-muted"
                                        onClick={() => moveBlock(index, 1)}
                                        disabled={index === blocks.length - 1}
                                        title="Move down"
                                    >↓</button>
                                    <button
                                        className="rounded p-1 text-xs text-muted-foreground hover:bg-muted"
                                        onClick={() => setExpandedBlock(expandedBlock === block.id ? null : block.id)}
                                        title="Edit"
                                    >✎</button>
                                    <button
                                        className="rounded p-1 text-xs text-muted-foreground hover:bg-muted"
                                        onClick={() => openPalette(index + 1)}
                                        title="Insert after"
                                    >+</button>
                                    <button
                                        className="rounded p-1 text-xs text-destructive hover:bg-destructive/10"
                                        onClick={() => removeBlock(index)}
                                        title="Remove"
                                    >✕</button>
                                </div>
                            </div>

                            {/* Expanded edit panel */}
                            {expandedBlock === block.id && (
                                <div className="mt-3 space-y-3 border-t pt-3">
                                    {/* Variant selector */}
                                    {VARIANT_OPTIONS[block.type] && (
                                        <div>
                                            <label className="text-xs font-medium text-muted-foreground">Variant</label>
                                            <select
                                                className="mt-1 block w-full rounded-md border bg-background px-2 py-1 text-sm"
                                                value={block.variant || ''}
                                                onChange={(e) => updateBlockField(index, 'variant', '', e.target.value)}
                                                title="Block variant"
                                            >
                                                {VARIANT_OPTIONS[block.type].map(v => (
                                                    <option key={v} value={v}>{v}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Config editor */}
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Config (JSON)</label>
                                        <textarea
                                            className="mt-1 block w-full rounded-md border bg-background px-2 py-1 font-mono text-xs"
                                            rows={3}
                                            defaultValue={JSON.stringify(block.config || {}, null, 2)}
                                            title="Block config JSON"
                                            onBlur={(e) => {
                                                try {
                                                    const parsed = JSON.parse(e.target.value);
                                                    setBlocks(prev => {
                                                        const updated = [...prev];
                                                        updated[index] = { ...updated[index], config: parsed };
                                                        return updated;
                                                    });
                                                    markDirty();
                                                } catch {
                                                    // Invalid JSON — ignore
                                                }
                                            }}
                                        />
                                    </div>

                                    {/* Regenerate button */}
                                    <div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleRegenerateBlock(block.id)}
                                            disabled={regenerating === block.id}
                                        >
                                            {regenerating === block.id ? 'Regenerating...' : `Regenerate ${block.type} Content`}
                                        </Button>
                                    </div>

                                    {/* Content editor */}
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Content (JSON)</label>
                                        <textarea
                                            className="mt-1 block w-full rounded-md border bg-background px-2 py-1 font-mono text-xs"
                                            rows={6}
                                            defaultValue={JSON.stringify(block.content || {}, null, 2)}
                                            title="Block content JSON"
                                            onBlur={(e) => {
                                                try {
                                                    const parsed = JSON.parse(e.target.value);
                                                    setBlocks(prev => {
                                                        const updated = [...prev];
                                                        updated[index] = { ...updated[index], content: parsed };
                                                        return updated;
                                                    });
                                                    markDirty();
                                                } catch {
                                                    // Invalid JSON — ignore
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Final drop zone */}
                <div
                    className={`h-1 rounded transition-all ${dragOverIndex === blocks.length ? 'bg-blue-400 h-2' : ''}`}
                    onDragOver={(e) => handleDragOver(e, blocks.length)}
                    onDrop={() => handleDrop(blocks.length)}
                />
            </div>

            {/* Block Palette Modal */}
            {showPalette && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl border bg-background p-6 shadow-lg">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Add Block</h3>
                            <Button size="sm" variant="ghost" onClick={() => { setShowPalette(false); setInsertIndex(null); }}>
                                ✕
                            </Button>
                        </div>
                        <div className="space-y-4">
                            {Object.entries(BLOCK_CATEGORIES).map(([category, types]) => (
                                <div key={category}>
                                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        {category}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {types.map(type => (
                                            <button
                                                key={type}
                                                className="rounded-md border bg-muted/50 px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                                                onClick={() => addBlock(type)}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
