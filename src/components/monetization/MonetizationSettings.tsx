'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface MonetizationSettingsProps {
    domainId: string;
    initialLeadGenEnabled: boolean;
    initialLeadGenFormType: string | null;
    initialLeadGenEndpoint: string | null;
    initialLeadGenValue: number | null;
}

const FORM_TYPES = ['contact', 'quote', 'newsletter', 'calculator', 'consultation', 'custom'] as const;

export function MonetizationSettings({
    domainId,
    initialLeadGenEnabled,
    initialLeadGenFormType,
    initialLeadGenEndpoint,
    initialLeadGenValue,
}: MonetizationSettingsProps) {
    const [leadGenEnabled, setLeadGenEnabled] = useState(initialLeadGenEnabled);
    const [formType, setFormType] = useState(initialLeadGenFormType || '');
    const [endpoint, setEndpoint] = useState(initialLeadGenEndpoint || '');
    const [leadValue, setLeadValue] = useState(initialLeadGenValue?.toString() || '');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function save() {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/domains/${domainId}/monetization`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadGenEnabled,
                    leadGenFormType: formType || null,
                    leadGenEndpoint: endpoint || null,
                    leadGenValue: (() => {
                        if (!leadValue) return null;
                        const parsed = parseFloat(leadValue);
                        if (Number.isNaN(parsed)) {
                            throw new Error('INVALID_LEAD_VALUE');
                        }
                        return parsed;
                    })(),
                }),
            });
            if (res.ok) {
                setMessage('Saved');
            } else {
                const data = await res.json().catch(() => ({}));
                setMessage(`Error: ${data.error || res.statusText}`);
            }
        } catch (err) {
            if (err instanceof Error && err.message === 'INVALID_LEAD_VALUE') {
                setMessage('Error: Invalid lead value');
                setSaving(false);
                return;
            }
            setMessage(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Lead Generation & Settings</CardTitle>
                <CardDescription>Configure lead capture forms and revenue attribution for this domain.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center gap-3">
                    <label htmlFor="lead-gen-toggle" className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            id="lead-gen-toggle"
                            checked={leadGenEnabled}
                            onChange={e => setLeadGenEnabled(e.target.checked)}
                            className="rounded border-gray-300 h-4 w-4"
                        />
                        <span className="text-sm font-medium">Enable Lead Generation</span>
                    </label>
                </div>

                {leadGenEnabled && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="form-type">Form Type</Label>
                            <select
                                id="form-type"
                                title="Lead gen form type"
                                value={formType}
                                onChange={e => setFormType(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                            >
                                <option value="">Select type...</option>
                                {FORM_TYPES.map(t => (
                                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lead-value">Estimated Lead Value ($)</Label>
                            <Input
                                id="lead-value"
                                type="number"
                                step="0.01"
                                min="0"
                                value={leadValue}
                                onChange={e => setLeadValue(e.target.value)}
                                placeholder="e.g. 25.00"
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="lead-endpoint">Lead Capture Endpoint URL</Label>
                            <Input
                                id="lead-endpoint"
                                type="url"
                                value={endpoint}
                                onChange={e => setEndpoint(e.target.value)}
                                placeholder="https://hooks.zapier.com/... or your CRM webhook URL"
                            />
                            <p className="text-xs text-muted-foreground">
                                Form submissions will be POSTed to this endpoint as JSON.
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3 pt-2 border-t">
                    <Button onClick={save} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Save Settings
                    </Button>
                    {message && (
                        <span className={`text-sm ${message.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}>
                            {message}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
