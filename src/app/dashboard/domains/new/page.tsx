'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Plus, X } from 'lucide-react';

const NICHES = [
    'health',
    'finance',
    'legal',
    'insurance',
    'auto',
    'home',
    'technology',
    'education',
    'travel',
    'pets',
    'relationships',
    'business',
    'other',
];

const REGISTRARS = ['godaddy', 'namecheap', 'cloudflare', 'other'] as const;
const STATUSES = ['parked', 'active', 'redirect', 'forsale', 'defensive'] as const;
const BUCKETS = ['build', 'redirect', 'park', 'defensive'] as const;
const TEMPLATES = [
    { value: 'authority', label: 'Authority', desc: 'Wide sidebar, magazine grid' },
    { value: 'comparison', label: 'Comparison', desc: 'Wide single-col, card grid' },
    { value: 'calculator', label: 'Calculator', desc: 'Medium, tool-first' },
    { value: 'review', label: 'Review', desc: 'Wide sidebar, rating cards' },
    { value: 'tool', label: 'Tool', desc: 'Full-width, app-like' },
    { value: 'hub', label: 'Hub', desc: 'Wide portal, 3-col cards' },
    { value: 'decision', label: 'Decision', desc: 'Narrow, guide-focused' },
    { value: 'cost_guide', label: 'Cost Guide', desc: 'Wide left sidebar, pricing' },
    { value: 'niche', label: 'Niche Blog', desc: 'Narrow, reading-focused' },
    { value: 'info', label: 'Info / Wiki', desc: 'Wide left sidebar, reference' },
    { value: 'consumer', label: 'Consumer', desc: 'Wide, newsletter footer' },
    { value: 'brand', label: 'Brand', desc: 'Medium, premium feel' },
    { value: 'magazine', label: 'Magazine', desc: 'Wide, editorial layout' },
    { value: 'landing', label: 'Landing Page', desc: 'Full-width, CTA-driven' },
    { value: 'docs', label: 'Docs', desc: 'Wide left sidebar, minimal' },
    { value: 'storefront', label: 'Storefront', desc: 'Wide, product showcase' },
    { value: 'minimal', label: 'Minimal', desc: 'Narrow, ultra-clean' },
    { value: 'dashboard', label: 'Dashboard', desc: 'Full-width, data-heavy' },
    { value: 'newsletter', label: 'Newsletter', desc: 'Narrow, email-style' },
    { value: 'community', label: 'Community', desc: 'Wide sidebar, forum-like' },
] as const;

interface FormData {
    domain: string;
    registrar: typeof REGISTRARS[number];
    purchasePrice: string;
    purchaseDate: string;
    renewalDate: string;
    renewalPrice: string;
    status: typeof STATUSES[number];
    bucket: typeof BUCKETS[number];
    tier: string;
    niche: string;
    subNiche: string;
    siteTemplate: string;
    themeStyle: string;
    notes: string;
    tags: string[];
}

export default function NewDomainPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tagInput, setTagInput] = useState('');

    const [formData, setFormData] = useState<FormData>({
        domain: '',
        registrar: 'godaddy',
        purchasePrice: '',
        purchaseDate: '',
        renewalDate: '',
        renewalPrice: '',
        status: 'parked',
        bucket: 'build',
        tier: '3',
        niche: '',
        subNiche: '',
        siteTemplate: 'authority',
        themeStyle: '',
        notes: '',
        tags: [],
    });

    function updateField<K extends keyof FormData>(field: K, value: FormData[K]) {
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
            // Validate domain format
            if (!formData.domain.match(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i)) {
                throw new Error('Invalid domain format. Example: example.com');
            }

            const payload = {
                domain: formData.domain,
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
                themeStyle: formData.themeStyle || undefined,
                notes: formData.notes || undefined,
                tags: formData.tags,
            };

            const response = await fetch('/api/domains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create domain');
            }

            // Success - redirect to domain detail page
            router.push(`/dashboard/domains/${data.domain.id}`);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/dashboard/domains">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Add New Domain</h1>
                    <p className="text-muted-foreground">Add a domain to your portfolio</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                {/* Domain Info Card */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Domain Information</CardTitle>
                        <CardDescription>Basic information about the domain</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Domain Name */}
                        <div className="space-y-2">
                            <Label htmlFor="domain">Domain Name *</Label>
                            <Input
                                id="domain"
                                type="text"
                                placeholder="example.com"
                                value={formData.domain}
                                onChange={(e) => updateField('domain', e.target.value.toLowerCase())}
                                required
                                disabled={loading}
                            />
                        </div>

                        {/* Two Column Grid */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* Registrar */}
                            <div className="space-y-2">
                                <Label>Registrar</Label>
                                <Select
                                    value={formData.registrar}
                                    onValueChange={(v) => updateField('registrar', v as typeof REGISTRARS[number])}
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

                            {/* Niche */}
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

                            {/* Sub-Niche */}
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

                            {/* Site Template */}
                            <div className="space-y-2 sm:col-span-2">
                                <Label>Site Layout</Label>
                                <Select
                                    value={formData.siteTemplate}
                                    onValueChange={(v) => updateField('siteTemplate', v)}
                                    disabled={loading}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {TEMPLATES.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>
                                                <span className="font-medium">{t.label}</span>
                                                <span className="ml-2 text-muted-foreground text-xs">{t.desc}</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="themeStyle">Theme Style</Label>
                                <Input
                                    id="themeStyle"
                                    placeholder="e.g., navy-serif or insurance-clean"
                                    value={formData.themeStyle}
                                    onChange={(e) => updateField('themeStyle', e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Classification Card */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Classification</CardTitle>
                        <CardDescription>How to categorize this domain</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-3">
                            {/* Status */}
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

                            {/* Bucket */}
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

                            {/* Tier */}
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
                        <CardDescription>Purchase and renewal information</CardDescription>
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

                {/* Notes & Tags Card */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Notes & Tags</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Tags */}
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
                                                aria-label={`Remove tag ${tag}`}
                                            >
                                                <X className="h-3 w-3" aria-hidden="true" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea
                                id="notes"
                                placeholder="Any additional notes about this domain..."
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
                                Adding Domain...
                            </>
                        ) : (
                            'Add Domain'
                        )}
                    </Button>
                    <Link href="/dashboard/domains">
                        <Button type="button" variant="outline" disabled={loading}>
                            Cancel
                        </Button>
                    </Link>
                </div>
            </form>
        </div>
    );
}
