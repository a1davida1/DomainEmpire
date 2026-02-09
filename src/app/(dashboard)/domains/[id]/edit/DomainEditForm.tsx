'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X } from 'lucide-react';
import type { Domain } from '@/lib/db/schema';

const NICHES = [
    'health', 'finance', 'legal', 'insurance', 'auto', 'home',
    'technology', 'education', 'travel', 'pets', 'relationships', 'business', 'other',
];

const REGISTRARS = ['godaddy', 'namecheap', 'cloudflare', 'other'] as const;
const STATUSES = ['parked', 'active', 'redirect', 'forsale', 'defensive'] as const;
const BUCKETS = ['build', 'redirect', 'park', 'defensive'] as const;
const TEMPLATES = ['authority', 'comparison', 'calculator', 'review'] as const;

interface Props {
    domain: Domain;
}

export default function DomainEditForm({ domain }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tagInput, setTagInput] = useState('');

    const [formData, setFormData] = useState({
        registrar: domain.registrar || 'godaddy',
        purchasePrice: domain.purchasePrice?.toString() || '',
        purchaseDate: domain.purchaseDate ? new Date(domain.purchaseDate).toISOString().split('T')[0] : '',
        renewalDate: domain.renewalDate ? new Date(domain.renewalDate).toISOString().split('T')[0] : '',
        renewalPrice: domain.renewalPrice?.toString() || '',
        status: domain.status,
        bucket: domain.bucket,
        tier: domain.tier?.toString() || '3',
        niche: domain.niche || '',
        subNiche: domain.subNiche || '',
        siteTemplate: domain.siteTemplate || 'authority',
        notes: domain.notes || '',
        tags: domain.tags || [],
    });

    function updateField<K extends keyof typeof formData>(field: K, value: typeof formData[K]) {
        setFormData(prev => ({ ...prev, [field]: value }));
    }

    function addTag(tag: string) {
        const trimmed = tag.trim().toLowerCase();
        if (trimmed && !formData.tags.includes(trimmed)) {
            updateField('tags', [...formData.tags, trimmed]);
        }
        setTagInput('');
    }

    function removeTag(tag: string) {
        updateField('tags', formData.tags.filter(t => t !== tag));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const payload = {
                registrar: formData.registrar,
                purchasePrice: formData.purchasePrice ? Number(formData.purchasePrice) : undefined,
                purchaseDate: formData.purchaseDate || undefined,
                renewalDate: formData.renewalDate || undefined,
                renewalPrice: formData.renewalPrice ? Number(formData.renewalPrice) : undefined,
                status: formData.status,
                bucket: formData.bucket,
                tier: Number(formData.tier),
                niche: formData.niche || undefined,
                subNiche: formData.subNiche || undefined,
                siteTemplate: formData.siteTemplate,
                notes: formData.notes || undefined,
                tags: formData.tags,
            };

            const response = await fetch(`/api/domains/${domain.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update domain');
            }

            router.push(`/dashboard/domains/${domain.id}`);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            {/* Domain display (not editable) */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <Label>Domain Name</Label>
                    <p className="mt-1 text-lg font-medium">{domain.domain}</p>
                    <p className="text-sm text-muted-foreground">Domain name cannot be changed</p>
                </CardContent>
            </Card>

            {/* Domain Info Card */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Domain Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Registrar</Label>
                            <Select
                                value={formData.registrar}
                                onValueChange={(v) => updateField('registrar', v)}
                                disabled={loading}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {REGISTRARS.map((r) => (
                                        <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Niche</Label>
                            <Select
                                value={formData.niche}
                                onValueChange={(v) => updateField('niche', v)}
                                disabled={loading}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select niche" />
                                </SelectTrigger>
                                <SelectContent>
                                    {NICHES.map((n) => (
                                        <SelectItem key={n} value={n} className="capitalize">{n}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="subNiche">Sub-Niche</Label>
                            <Input
                                id="subNiche"
                                placeholder="e.g., therapy, medicare"
                                value={formData.subNiche}
                                onChange={(e) => updateField('subNiche', e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Site Template</Label>
                            <Select
                                value={formData.siteTemplate}
                                onValueChange={(v) => updateField('siteTemplate', v as typeof TEMPLATES[number])}
                                disabled={loading}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TEMPLATES.map((t) => (
                                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Classification Card */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Classification</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(v) => updateField('status', v as typeof STATUSES[number])}
                                disabled={loading}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUSES.map((s) => (
                                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Bucket</Label>
                            <Select
                                value={formData.bucket}
                                onValueChange={(v) => updateField('bucket', v as typeof BUCKETS[number])}
                                disabled={loading}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BUCKETS.map((b) => (
                                        <SelectItem key={b} value={b} className="capitalize">{b}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Tier</Label>
                            <Select
                                value={formData.tier}
                                onValueChange={(v) => updateField('tier', v)}
                                disabled={loading}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 - Priority</SelectItem>
                                    <SelectItem value="2">2 - Secondary</SelectItem>
                                    <SelectItem value="3">3 - Hold</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Financial Card */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Financial Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="purchasePrice">Purchase Price ($)</Label>
                            <Input
                                id="purchasePrice"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={formData.purchasePrice}
                                onChange={(e) => updateField('purchasePrice', e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="purchaseDate">Purchase Date</Label>
                            <Input
                                id="purchaseDate"
                                type="date"
                                value={formData.purchaseDate}
                                onChange={(e) => updateField('purchaseDate', e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="renewalPrice">Renewal Price ($)</Label>
                            <Input
                                id="renewalPrice"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={formData.renewalPrice}
                                onChange={(e) => updateField('renewalPrice', e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="renewalDate">Renewal Date</Label>
                            <Input
                                id="renewalDate"
                                type="date"
                                value={formData.renewalDate}
                                onChange={(e) => updateField('renewalDate', e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Notes & Tags */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Notes & Tags</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Tags</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Add a tag..."
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTag(tagInput);
                                    }
                                }}
                                disabled={loading}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => addTag(tagInput)}
                                disabled={loading || !tagInput.trim()}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        {formData.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                                {formData.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary" className="gap-1">
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => removeTag(tag)}
                                            className="ml-1 hover:text-destructive"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea
                            id="notes"
                            rows={4}
                            value={formData.notes}
                            onChange={(e) => updateField('notes', e.target.value)}
                            disabled={loading}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Error Display */}
            {error && (
                <div className="mb-6 rounded-md bg-destructive/10 p-4 text-destructive">
                    {error}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
                <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        'Save Changes'
                    )}
                </Button>
                <Link href={`/dashboard/domains/${domain.id}`}>
                    <Button type="button" variant="outline" disabled={loading}>
                        Cancel
                    </Button>
                </Link>
            </div>
        </form>
    );
}
