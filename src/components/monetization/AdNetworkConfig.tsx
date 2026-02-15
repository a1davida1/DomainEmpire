'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2 } from 'lucide-react';

type AdPlacement = { position: string; type: string };

const AD_NETWORKS = ['ezoic', 'mediavine', 'adsense', 'none'] as const;
const PLACEMENT_POSITIONS = ['header', 'sidebar', 'in-content', 'after-paragraph-2', 'after-paragraph-4', 'footer', 'sticky-bottom'] as const;
const PLACEMENT_TYPES = ['display', 'native', 'anchor', 'vignette', 'interstitial', 'in-article'] as const;

interface AdNetworkConfigProps {
    domainId: string;
    initialNetwork: string;
    initialNetworkId: string | null;
    initialPlacements: AdPlacement[];
}

export function AdNetworkConfig({ domainId, initialNetwork, initialNetworkId, initialPlacements }: AdNetworkConfigProps) {
    const [network, setNetwork] = useState(initialNetwork || 'none');
    const [networkId, setNetworkId] = useState(initialNetworkId || '');
    const [placements, setPlacements] = useState<AdPlacement[]>(initialPlacements || []);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [newPosition, setNewPosition] = useState<string>(PLACEMENT_POSITIONS[0]);
    const [newType, setNewType] = useState<string>(PLACEMENT_TYPES[0]);

    async function save() {
        if (network !== 'none' && !networkId.trim()) {
            setMessage('Error: Please enter a Network Account / Site ID');
            return;
        }
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/domains/${domainId}/monetization`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adNetwork: network, adNetworkId: networkId || null, adPlacements: placements }),
            });
            if (res.ok) {
                setMessage('Saved');
            } else {
                const data = await res.json().catch(() => ({}));
                setMessage(`Error: ${data.error || res.statusText}`);
            }
        } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    function addPlacement() {
        if (placements.some(p => p.position === newPosition && p.type === newType)) return;
        setPlacements([...placements, { position: newPosition, type: newType }]);
    }

    function removePlacement(index: number) {
        setPlacements(placements.filter((_, i) => i !== index));
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Ad Network Configuration</CardTitle>
                <CardDescription>Configure your ad network provider and placement settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="ad-network">Ad Network</Label>
                        <select
                            id="ad-network"
                            title="Ad Network"
                            value={network}
                            onChange={e => setNetwork(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                        >
                            {AD_NETWORKS.map(n => (
                                <option key={n} value={n}>{n === 'none' ? 'None' : n.charAt(0).toUpperCase() + n.slice(1)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="ad-network-id">Network Account / Site ID</Label>
                        <Input
                            id="ad-network-id"
                            value={networkId}
                            onChange={e => setNetworkId(e.target.value)}
                            placeholder={network === 'ezoic' ? 'Ezoic Site ID' : network === 'mediavine' ? 'Mediavine Site ID' : network === 'adsense' ? 'ca-pub-XXXXX' : 'N/A'}
                            disabled={network === 'none'}
                        />
                    </div>
                </div>

                {network !== 'none' && (
                    <div className="space-y-3">
                        <Label>Ad Placements ({placements.length})</Label>
                        {placements.length > 0 && (
                            <div className="space-y-2">
                                {placements.map((p, i) => (
                                    <div key={`${p.position}-${p.type}`} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm">
                                        <span className="font-medium flex-1">{p.position}</span>
                                        <span className="text-muted-foreground">{p.type}</span>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePlacement(i)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex items-end gap-2">
                            <div className="flex-1">
                                <label htmlFor="placement-position" className="text-xs text-muted-foreground block mb-1">Position</label>
                                <select
                                    id="placement-position"
                                    title="Placement position"
                                    value={newPosition}
                                    onChange={e => setNewPosition(e.target.value)}
                                    className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                                >
                                    {PLACEMENT_POSITIONS.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1">
                                <label htmlFor="placement-type" className="text-xs text-muted-foreground block mb-1">Type</label>
                                <select
                                    id="placement-type"
                                    title="Placement type"
                                    value={newType}
                                    onChange={e => setNewType(e.target.value)}
                                    className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                                >
                                    {PLACEMENT_TYPES.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <Button variant="outline" size="sm" onClick={addPlacement}>
                                <Plus className="h-3 w-3 mr-1" /> Add
                            </Button>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3 pt-2 border-t">
                    <Button onClick={save} disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Save Ad Config
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
