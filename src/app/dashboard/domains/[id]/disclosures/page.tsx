'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { DomainDetailTabs } from '@/components/dashboard/DomainDetailTabs';

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
    const [dirty, setDirty] = useState(false);
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialLoad = useRef(true);

    useEffect(() => {
        fetch(`/api/domains/${domainId}/disclosures`)
            .then(r => r.json())
            .then(data => { setConfig(data); initialLoad.current = true; })
            .finally(() => setLoading(false));
    }, [domainId]);

    function updateConfig(updater: (prev: Config) => Config) {
        setConfig(prev => {
            if (!prev) return prev;
            const next = updater(prev);
            setDirty(true);
            return next;
        });
    }

    const doSave = useCallback(async (cfg: Config) => {
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch(`/api/domains/${domainId}/disclosures`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cfg),
            });

            if (!res.ok) {
                console.error('Disclosures save failed:', res.status);
                return;
            }

            setSaved(true);
            setDirty(false);
            setTimeout(() => setSaved(false), 3000);
        } catch (error) {
            console.error('Disclosures save failed:', error);
        } finally {
            setSaving(false);
        }
    }, [domainId]);

    // Auto-save after 2s of inactivity
    useEffect(() => {
        if (initialLoad.current) {
            initialLoad.current = false;
            return;
        }
        if (!config || !dirty) return;
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => doSave(config), 2000);
        return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    }, [config, doSave, dirty]);

    async function handleSave() {
        if (!config) return;
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        await doSave(config);
    }

    if (loading || !config) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6 max-w-3xl">
            <h1 className="text-2xl font-bold tracking-tight">Disclosure Configuration</h1>
            <DomainDetailTabs domainId={domainId} />

            <div className="bg-card rounded-lg border p-4 space-y-4">
                <div className="space-y-1">
                    <Label htmlFor="affiliateDisclosure">Affiliate Disclosure</Label>
                    <textarea
                        id="affiliateDisclosure"
                        value={config.affiliateDisclosure || ''}
                        onChange={e => updateConfig(c => ({ ...c, affiliateDisclosure: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                        rows={3}
                    />
                </div>

                <div className="space-y-1">
                    <Label htmlFor="notAdviceDisclaimer">Not-Advice Disclaimer (YMYL)</Label>
                    <textarea
                        id="notAdviceDisclaimer"
                        value={config.notAdviceDisclaimer || ''}
                        onChange={e => updateConfig(c => ({ ...c, notAdviceDisclaimer: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                        rows={3}
                    />
                </div>

                <div className="space-y-1">
                    <Label htmlFor="adDisclosure">Ad Disclosure</Label>
                    <textarea
                        id="adDisclosure"
                        value={config.adDisclosure || ''}
                        onChange={e => updateConfig(c => ({ ...c, adDisclosure: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background resize-none"
                        rows={2}
                    />
                </div>

                <div className="space-y-1">
                    <Label htmlFor="aboutPage">About Page (Markdown)</Label>
                    <textarea
                        id="aboutPage"
                        value={config.aboutPage || ''}
                        onChange={e => updateConfig(c => ({ ...c, aboutPage: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono resize-none"
                        rows={6}
                        placeholder="# About Us..."
                    />
                </div>

                <div className="space-y-1">
                    <Label htmlFor="editorialPolicyPage">Editorial Policy Page (Markdown)</Label>
                    <textarea
                        id="editorialPolicyPage"
                        value={config.editorialPolicyPage || ''}
                        onChange={e => updateConfig(c => ({ ...c, editorialPolicyPage: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background font-mono resize-none"
                        rows={6}
                        placeholder="# Editorial Policy..."
                    />
                </div>

                <div className="space-y-1">
                    <Label htmlFor="howWeMoneyPage">How We Make Money Page (Markdown)</Label>
                    <textarea
                        id="howWeMoneyPage"
                        value={config.howWeMoneyPage || ''}
                        onChange={e => updateConfig(c => ({ ...c, howWeMoneyPage: e.target.value }))}
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
                                onChange={e => updateConfig(c => ({ ...c, [opt.key]: e.target.checked }))}
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
                    <div className="flex items-center gap-1.5 text-sm">
                        {saving && (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Saving...</span></>
                        )}
                        {!saving && saved && (
                            <><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /><span className="text-green-600">Saved</span></>
                        )}
                        {!saving && !saved && dirty && (
                            <><Circle className="h-3.5 w-3.5 text-amber-500" /><span className="text-amber-500">Unsaved changes</span></>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
