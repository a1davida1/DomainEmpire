'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

type Config = {
    affiliateDisclosure: string | null;
    adDisclosure: string | null;
    notAdviceDisclaimer: string | null;
    howWeMoneyPage: string | null;
    editorialPolicyPage: string | null;
    aboutPage: string | null;
    showReviewedBy: boolean;
    showLastUpdated: boolean;
    showChangeLog: boolean;
    showMethodology: boolean;
};

export default function DisclosuresPage() {
    const params = useParams();
    const domainId = params.id as string;
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetch(`/api/domains/${domainId}/disclosures`)
            .then(r => r.json())
            .then(setConfig)
            .finally(() => setLoading(false));
    }, [domainId]);

    async function handleSave() {
        if (!config) return;
        setSaving(true);
        setSaved(false);
        await fetch(`/api/domains/${domainId}/disclosures`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    }

    if (loading || !config) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <h1 className="text-3xl font-bold">Disclosure Configuration</h1>

            <div className="bg-card rounded-lg border p-4 space-y-4">
                <div className="space-y-1">
                    <Label>Affiliate Disclosure</Label>
                    <textarea
                        value={config.affiliateDisclosure || ''}
                        onChange={e => setConfig({ ...config, affiliateDisclosure: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                        rows={3}
                    />
                </div>

                <div className="space-y-1">
                    <Label>Not-Advice Disclaimer (YMYL)</Label>
                    <textarea
                        value={config.notAdviceDisclaimer || ''}
                        onChange={e => setConfig({ ...config, notAdviceDisclaimer: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                        rows={3}
                    />
                </div>

                <div className="space-y-1">
                    <Label>Ad Disclosure</Label>
                    <textarea
                        value={config.adDisclosure || ''}
                        onChange={e => setConfig({ ...config, adDisclosure: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                        rows={2}
                    />
                </div>

                <div className="space-y-1">
                    <Label>About Page (Markdown)</Label>
                    <textarea
                        value={config.aboutPage || ''}
                        onChange={e => setConfig({ ...config, aboutPage: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono resize-none"
                        rows={6}
                        placeholder="# About Us..."
                    />
                </div>

                <div className="space-y-1">
                    <Label>Editorial Policy Page (Markdown)</Label>
                    <textarea
                        value={config.editorialPolicyPage || ''}
                        onChange={e => setConfig({ ...config, editorialPolicyPage: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono resize-none"
                        rows={6}
                        placeholder="# Editorial Policy..."
                    />
                </div>

                <div className="space-y-1">
                    <Label>How We Make Money Page (Markdown)</Label>
                    <textarea
                        value={config.howWeMoneyPage || ''}
                        onChange={e => setConfig({ ...config, howWeMoneyPage: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono resize-none"
                        rows={6}
                        placeholder="# How We Make Money..."
                    />
                </div>

                <div className="border-t pt-4 space-y-2">
                    <Label className="text-base font-semibold">Display Options</Label>
                    {[
                        { key: 'showReviewedBy' as const, label: 'Show "Reviewed by" attribution on articles' },
                        { key: 'showLastUpdated' as const, label: 'Show "Last Updated" date on articles' },
                        { key: 'showChangeLog' as const, label: 'Show public change log on articles' },
                        { key: 'showMethodology' as const, label: 'Show methodology block on calculator/tool pages' },
                    ].map(opt => (
                        <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config[opt.key]}
                                onChange={e => setConfig({ ...config, [opt.key]: e.target.checked })}
                            />
                            <span className="text-sm">{opt.label}</span>
                        </label>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save Configuration
                    </Button>
                    {saved && <span className="text-sm text-green-600">Saved!</span>}
                </div>
            </div>
        </div>
    );
}
