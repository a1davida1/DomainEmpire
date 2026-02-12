'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, ClipboardCheck, X } from 'lucide-react';

type ChecklistItem = {
    id: string;
    category: string;
    label: string;
    required: boolean;
};

type Template = {
    id: string;
    name: string;
    contentType: string | null;
    ymylLevel: string | null;
    items: ChecklistItem[];
    createdAt: string;
};

const YMYL_LEVELS = ['none', 'low', 'medium', 'high'] as const;
const CATEGORIES = [
    'purpose',
    'claim_coverage',
    'calculation_integrity',
    'disclosure',
    'ux',
] as const;

export default function QaTemplatesPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [contentType, setContentType] = useState('');
    const [ymylLevel, setYmylLevel] = useState('none');
    const [items, setItems] = useState<ChecklistItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    // New item form
    const [newItemLabel, setNewItemLabel] = useState('');
    const [newItemCategory, setNewItemCategory] = useState<string>(CATEGORIES[0]);
    const [newItemRequired, setNewItemRequired] = useState(true);

    useEffect(() => {
        loadTemplates();
    }, []);

    async function loadTemplates() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/qa-templates');
            if (res.ok) {
                setTemplates(await res.json());
            } else {
                setError('Failed to load templates');
            }
        } catch (err) {
            console.error('Error loading templates:', err);
            setError('Network error loading templates');
        } finally {
            setLoading(false);
        }
    }

    function resetForm() {
        setName('');
        setContentType('');
        setYmylLevel('none');
        setItems([]);
        setEditingId(null);
        setShowForm(false);
    }

    function startEdit(template: Template) {
        setName(template.name);
        setContentType(template.contentType || '');
        setYmylLevel(template.ymylLevel || 'none');
        setItems(template.items || []);
        setEditingId(template.id);
        setShowForm(true);
    }

    function addItem() {
        if (!newItemLabel.trim()) return;
        const id = newItemLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        setItems(prev => [...prev, {
            id: `${id}_${Date.now()}`,
            category: newItemCategory,
            label: newItemLabel.trim(),
            required: newItemRequired,
        }]);
        setNewItemLabel('');
        setNewItemRequired(true);
    }

    function removeItem(itemId: string) {
        setItems(prev => prev.filter(i => i.id !== itemId));
    }

    async function saveTemplate() {
        if (!name.trim() || items.length === 0) return;
        setSaving(true);
        setError(null);

        const payload = {
            name: name.trim(),
            contentType: contentType.trim() || null,
            ymylLevel,
            items,
        };

        try {
            if (editingId) {
                const res = await fetch(`/api/qa-templates/${editingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to update template');
                }
            } else {
                const res = await fetch('/api/qa-templates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to create template');
                }
            }

            await loadTemplates();
            resetForm();
        } catch (err: any) {
            console.error('Error saving template:', err);
            setError(err.message || 'Network error saving template');
        } finally {
            setSaving(false);
        }
    }

    async function deleteTemplate(id: string) {
        if (!confirm('Are you sure you want to delete this template?')) return;
        try {
            const res = await fetch(`/api/qa-templates?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                await loadTemplates();
            } else {
                setError('Failed to delete template');
            }
        } catch (err) {
            console.error('Error deleting template:', err);
            setError('Network error deleting template');
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-6 w-6" />
                    <h1 className="text-3xl font-bold">QA Checklist Templates</h1>
                </div>
                {!showForm && (
                    <Button onClick={() => setShowForm(true)} size="sm">
                        <Plus className="h-4 w-4 mr-1" /> New Template
                    </Button>
                )}
            </div>

            <p className="text-sm text-muted-foreground">
                Define QA checklists that reviewers must complete before approving articles.
                Templates are matched by content type and YMYL level.
            </p>

            {/* Create/Edit Form */}
            {showForm && (
                <div className="bg-card rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                            {editingId ? 'Edit Template' : 'New Template'}
                        </h2>
                        <Button variant="ghost" size="icon" onClick={resetForm}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium block mb-1">Template Name *</label>
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full border rounded px-3 py-2 text-sm bg-background"
                                placeholder="e.g. Finance Article QA"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium block mb-1">Content Type</label>
                            <input
                                value={contentType}
                                onChange={e => setContentType(e.target.value)}
                                className="w-full border rounded px-3 py-2 text-sm bg-background"
                                placeholder="e.g. calculator, blog, guide"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium block mb-1">YMYL Level</label>
                            <select
                                value={ymylLevel}
                                onChange={e => setYmylLevel(e.target.value)}
                                className="w-full border rounded px-3 py-2 text-sm bg-background"
                            >
                                {YMYL_LEVELS.map(l => (
                                    <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Checklist Items */}
                    <div>
                        <h3 className="text-sm font-medium mb-2">Checklist Items ({items.length})</h3>
                        {items.length > 0 && (
                            <div className="space-y-1 mb-3">
                                {items.map(item => (
                                    <div key={item.id} className="flex items-center gap-2 p-2 rounded bg-muted/30 text-sm">
                                        <span className="flex-1">{item.label}</span>
                                        <Badge variant="outline" className="text-xs capitalize">
                                            {item.category.replaceAll('_', ' ')}
                                        </Badge>
                                        {item.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => removeItem(item.id)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <label className="text-xs text-muted-foreground block mb-1">Label</label>
                                <input
                                    value={newItemLabel}
                                    onChange={e => setNewItemLabel(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addItem()}
                                    className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                                    placeholder="e.g. All calculations verified"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1">Category</label>
                                <select
                                    value={newItemCategory}
                                    onChange={e => setNewItemCategory(e.target.value)}
                                    className="border rounded px-2 py-1.5 text-sm bg-background"
                                >
                                    {CATEGORIES.map(c => (
                                        <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>
                                    ))}
                                </select>
                            </div>
                            <label className="flex items-center gap-1 text-sm whitespace-nowrap">
                                <input
                                    type="checkbox"
                                    checked={newItemRequired}
                                    onChange={e => setNewItemRequired(e.target.checked)}
                                />
                                Required
                            </label>
                            <Button size="sm" variant="outline" onClick={addItem} disabled={!newItemLabel.trim()}>
                                <Plus className="h-3 w-3 mr-1" /> Add
                            </Button>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                        <Button onClick={saveTemplate} disabled={saving || !name.trim() || items.length === 0}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {editingId ? 'Update Template' : 'Create Template'}
                        </Button>
                        <Button variant="outline" onClick={resetForm}>Cancel</Button>
                    </div>
                </div>
            )}

            {/* Existing Templates */}
            {templates.length === 0 && !showForm ? (
                <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">
                    <p>No QA templates yet. The system uses built-in defaults until you create custom templates.</p>
                    <p className="text-xs mt-2">Custom templates override defaults when matched by content type and YMYL level.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {templates.map(template => (
                        <div key={template.id} className="bg-card rounded-lg border p-4">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h3 className="font-semibold">{template.name}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        {template.contentType && (
                                            <Badge variant="outline" className="text-xs">{template.contentType}</Badge>
                                        )}
                                        <Badge variant="outline" className="text-xs capitalize">
                                            YMYL: {template.ymylLevel || 'none'}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {template.items?.length || 0} items
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="outline" size="sm" onClick={() => startEdit(template)}>
                                        Edit
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-500 hover:text-red-600"
                                        onClick={() => deleteTemplate(template.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1 mt-3">
                                {(template.items || []).map(item => (
                                    <div key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <span className="text-xs">
                                            {item.required ? '●' : '○'}
                                        </span>
                                        {item.label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
