'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Save, CheckCircle2 } from 'lucide-react';

interface AffiliateProgram {
    provider: string;
    programId: string;
    linkTemplate: string;
    commissionType: string;
    commissionValue: number;
}

interface AffiliateManagerProps {
    domainId: string;
    initialAffiliates: AffiliateProgram[];
}

export function AffiliateManager({ domainId, initialAffiliates }: AffiliateManagerProps) {
    const [affiliates, setAffiliates] = useState<AffiliateProgram[]>(initialAffiliates);
    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [newAffiliate, setNewAffiliate] = useState<AffiliateProgram>({
        provider: '',
        programId: '',
        linkTemplate: '',
        commissionType: 'percentage',
        commissionValue: 0
    });

    const handleAdd = () => {
        if (!newAffiliate.provider || !newAffiliate.linkTemplate) return;
        setAffiliates([...affiliates, newAffiliate]);
        setNewAffiliate({
            provider: '',
            programId: '',
            linkTemplate: '',
            commissionType: 'percentage',
            commissionValue: 0
        });
    };

    const handleRemove = (index: number) => {
        setAffiliates(affiliates.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        setLoading(true);
        setSaveStatus('idle');
        try {
            const res = await fetch('/api/monetization/affiliates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domainId, affiliates }),
            });

            if (!res.ok) throw new Error('Failed to save');
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (error) {
            console.error(error);
            setSaveStatus('error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Affiliate Programs</CardTitle>
                <CardDescription>Manage affiliate links and programs for this domain</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    {affiliates.map((aff, i) => (
                        <div key={`${aff.provider}-${aff.programId}`} className="flex items-start gap-4 p-4 border rounded-lg bg-muted/20">
                            <div className="grid gap-4 flex-1 md:grid-cols-2">
                                <div>
                                    <Label className="text-xs text-muted-foreground">Provider</Label>
                                    <div className="font-medium">{aff.provider}</div>
                                </div>
                                <div>
                                    <Label className="text-xs text-muted-foreground">Program ID</Label>
                                    <div className="font-medium">{aff.programId || '-'}</div>
                                </div>
                                <div className="md:col-span-2">
                                    <Label className="text-xs text-muted-foreground">Link Template</Label>
                                    <div className="font-mono text-sm truncate">{aff.linkTemplate}</div>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => handleRemove(i)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="border-t pt-4 space-y-4">
                    <Label>Add New Program</Label>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Input
                            placeholder="Provider Name (e.g. Amazon)"
                            value={newAffiliate.provider}
                            onChange={e => setNewAffiliate({ ...newAffiliate, provider: e.target.value })}
                        />
                        <Input
                            placeholder="Program ID / Tag"
                            value={newAffiliate.programId}
                            onChange={e => setNewAffiliate({ ...newAffiliate, programId: e.target.value })}
                        />
                        <div className="md:col-span-2">
                            <Input
                                placeholder="Link Template (use {keyword} or {asin} as placeholders)"
                                value={newAffiliate.linkTemplate}
                                onChange={e => setNewAffiliate({ ...newAffiliate, linkTemplate: e.target.value })}
                            />
                        </div>
                    </div>
                    <Button onClick={handleAdd} className="w-full" variant="secondary">
                        <Plus className="mr-2 h-4 w-4" /> Add Program
                    </Button>
                </div>

                <div className="flex justify-end pt-4">
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Changes'}
                        {saveStatus === 'saved' ? <CheckCircle2 className="ml-2 h-4 w-4 text-green-500" /> : <Save className="ml-2 h-4 w-4" />}
                    </Button>
                    {saveStatus === 'error' && (
                        <span className="text-sm text-destructive">Failed to save. Please try again.</span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
