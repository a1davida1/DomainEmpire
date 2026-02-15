'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type Provider = {
    provider: string;
    displayName: string;
    category: string;
    scope: 'domain' | 'portfolio' | 'both';
    executableSync: boolean;
    supportsScheduledSync: boolean;
    defaultSyncIntervalMinutes: number | null;
    defaultLookbackDays: number | null;
    notes?: string;
};

type Connection = {
    id: string;
    provider: string;
    category: string;
    domainId: string | null;
    domain: string | null;
    displayName: string | null;
    status: 'pending' | 'connected' | 'error' | 'disabled';
    lastSyncAt: string | null;
    lastSyncStatus: 'never' | 'success' | 'failed' | 'partial';
    lastSyncError: string | null;
    hasCredential: boolean;
    config: Record<string, unknown>;
};

type DomainOption = {
    id: string;
    domain: string;
};

function formatDate(value: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
}

function toNumericConfig(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function readScheduleSettings(config: Record<string, unknown> | null | undefined): {
    autoSyncEnabled: boolean;
    intervalHours: number;
    lookbackDays: number;
} {
    if (!config) {
        return { autoSyncEnabled: true, intervalHours: 24, lookbackDays: 30 };
    }

    const autoSyncEnabled = typeof config.autoSyncEnabled === 'boolean'
        ? config.autoSyncEnabled
        : true;

    const intervalMinutes = toNumericConfig(config.syncIntervalMinutes) ?? 24 * 60;
    const lookbackDays = toNumericConfig(config.syncLookbackDays) ?? 30;

    return {
        autoSyncEnabled,
        intervalHours: Math.max(1, Math.round(intervalMinutes / 60)),
        lookbackDays: Math.max(1, Math.round(lookbackDays)),
    };
}

export default function IntegrationsPage() {
    const [providers, setProviders] = useState<Provider[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [domains, setDomains] = useState<DomainOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [provider, setProvider] = useState<string>('');
    const [domainScope, setDomainScope] = useState<'portfolio' | 'domain'>('portfolio');
    const [domainId, setDomainId] = useState<string>('');
    const [displayName, setDisplayName] = useState<string>('');
    const [autoSyncEnabled, setAutoSyncEnabled] = useState<'true' | 'false'>('true');
    const [syncIntervalHours, setSyncIntervalHours] = useState<string>('24');
    const [syncLookbackDays, setSyncLookbackDays] = useState<string>('30');

    const selectedProvider = useMemo(
        () => providers.find((p) => p.provider === provider) ?? null,
        [provider, providers],
    );

    async function loadData() {
        setLoading(true);
        setError(null);
        try {
            const [providerRes, connectionRes, domainRes] = await Promise.all([
                fetch('/api/integrations/providers'),
                fetch('/api/integrations/connections'),
                fetch('/api/domains?limit=100'),
            ]);

            if (!providerRes.ok || !connectionRes.ok || !domainRes.ok) {
                throw new Error('Failed to load integrations data');
            }

            const providerBody = await providerRes.json();
            const connectionBody = await connectionRes.json();
            const domainBody = await domainRes.json();

            setProviders(providerBody.providers || []);
            setConnections((connectionBody.connections || []).map((connection: Connection) => ({
                ...connection,
                config: connection?.config && typeof connection.config === 'object' ? connection.config : {},
            })));
            setDomains((domainBody.domains || []).map((d: { id: string; domain: string }) => ({
                id: d.id,
                domain: d.domain,
            })));

            if (!provider && providerBody.providers?.length) {
                const firstProvider = providerBody.providers[0] as Provider;
                setProvider(firstProvider.provider);
                setDomainScope(firstProvider.scope === 'portfolio' ? 'portfolio' : 'domain');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to load integrations data.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!selectedProvider) return;
        if (selectedProvider.scope === 'portfolio') {
            setDomainScope('portfolio');
        } else if (selectedProvider.scope === 'domain') {
            setDomainScope('domain');
        }

        if (selectedProvider.defaultSyncIntervalMinutes !== null) {
            setSyncIntervalHours(String(Math.max(1, Math.round(selectedProvider.defaultSyncIntervalMinutes / 60))));
        }
        if (selectedProvider.defaultLookbackDays !== null) {
            setSyncLookbackDays(String(Math.max(1, Math.round(selectedProvider.defaultLookbackDays))));
        }
        if (!selectedProvider.supportsScheduledSync) {
            setAutoSyncEnabled('false');
        } else {
            setAutoSyncEnabled('true');
        }
    }, [selectedProvider]);

    async function createConnection() {
        if (!selectedProvider) return;
        if (domainScope === 'domain' && !domainId) {
            setError('Please select a domain for domain-scoped connections.');
            return;
        }

        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const parsedIntervalHours = Number.parseFloat(syncIntervalHours);
            const parsedLookbackDays = Number.parseInt(syncLookbackDays, 10);
            const intervalMinutes = Number.isFinite(parsedIntervalHours)
                ? Math.max(15, Math.min(Math.round(parsedIntervalHours * 60), 7 * 24 * 60))
                : 24 * 60;
            const lookbackDays = Number.isFinite(parsedLookbackDays)
                ? Math.max(1, Math.min(parsedLookbackDays, 365))
                : 30;

            const config: Record<string, unknown> = {};
            if (selectedProvider.supportsScheduledSync) {
                config.autoSyncEnabled = autoSyncEnabled === 'true';
                config.syncIntervalMinutes = intervalMinutes;
                config.syncLookbackDays = lookbackDays;
            }

            const payload: Record<string, unknown> = {
                provider: selectedProvider.provider,
                category: selectedProvider.category,
                displayName: displayName.trim().length > 0 ? displayName.trim() : undefined,
                status: 'pending',
                domainId: domainScope === 'domain' ? domainId : null,
                config,
            };

            const res = await fetch('/api/integrations/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to create connection');
            }

            setDisplayName('');
            setDomainId('');
            setAutoSyncEnabled(selectedProvider.supportsScheduledSync ? 'true' : 'false');
            setMessage('Connection saved.');
            await loadData();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to create connection');
        } finally {
            setSaving(false);
        }
    }

    async function syncConnection(connectionId: string) {
        setSyncingId(connectionId);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch(`/api/integrations/connections/${connectionId}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: 30, runType: 'manual' }),
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.error || 'Failed to sync connection');
            }

            const runStatus = body?.run?.status || 'unknown';
            setMessage(`Sync completed with status: ${runStatus}`);
            await loadData();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to sync connection');
        } finally {
            setSyncingId(null);
        }
    }

    async function deleteConnection(connectionId: string) {
        setDeletingId(connectionId);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch(`/api/integrations/connections?id=${connectionId}`, {
                method: 'DELETE',
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.error || 'Failed to delete connection');
            }

            setMessage('Connection removed.');
            await loadData();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to delete connection');
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Integrations</h1>
                <p className="text-sm text-muted-foreground">
                    Manage registrar, analytics, email, affiliate, hosting, and design integrations.
                </p>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {message && (
                <Alert>
                    <AlertTitle>Update</AlertTitle>
                    <AlertDescription>{message}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Add Connection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Provider</Label>
                            <Select value={provider} onValueChange={setProvider}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    {providers.map((p) => (
                                        <SelectItem key={p.provider} value={p.provider}>
                                            {p.displayName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Scope</Label>
                            <Select
                                value={domainScope}
                                onValueChange={(v) => setDomainScope(v as 'portfolio' | 'domain')}
                                disabled={selectedProvider?.scope === 'portfolio' || selectedProvider?.scope === 'domain'}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="portfolio">Portfolio</SelectItem>
                                    <SelectItem value="domain">Domain</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {domainScope === 'domain' && (
                        <div className="space-y-2">
                            <Label>Domain</Label>
                            <Select value={domainId} onValueChange={setDomainId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select domain" />
                                </SelectTrigger>
                                <SelectContent>
                                    {domains.map((d) => (
                                        <SelectItem key={d.id} value={d.id}>
                                            {d.domain}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Display Name (optional)</Label>
                        <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="My Cloudflare Production Account"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                            <Label>Auto Sync</Label>
                            <Select
                                value={autoSyncEnabled}
                                onValueChange={(value) => setAutoSyncEnabled(value as 'true' | 'false')}
                                disabled={!selectedProvider?.supportsScheduledSync}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="true">Enabled</SelectItem>
                                    <SelectItem value="false">Disabled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Sync Interval (hours)</Label>
                            <Input
                                type="number"
                                min={1}
                                max={168}
                                value={syncIntervalHours}
                                onChange={(e) => setSyncIntervalHours(e.target.value)}
                                disabled={!selectedProvider?.supportsScheduledSync || autoSyncEnabled !== 'true'}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Lookback (days)</Label>
                            <Input
                                type="number"
                                min={1}
                                max={365}
                                value={syncLookbackDays}
                                onChange={(e) => setSyncLookbackDays(e.target.value)}
                                disabled={!selectedProvider?.supportsScheduledSync || autoSyncEnabled !== 'true'}
                            />
                        </div>
                    </div>

                    {selectedProvider && !selectedProvider.supportsScheduledSync && (
                        <p className="text-xs text-muted-foreground">
                            Scheduled sync is not available for this provider yet.
                        </p>
                    )}

                    <Button onClick={createConnection} disabled={saving || !selectedProvider}>
                        {saving ? 'Saving...' : 'Save Connection'}
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Connected Integrations</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading connections...</p>
                    ) : connections.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No connections yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40">
                                    <tr>
                                        <th className="p-2 text-left">Provider</th>
                                        <th className="p-2 text-left">Scope</th>
                                        <th className="p-2 text-left">Status</th>
                                        <th className="p-2 text-left">Last Sync</th>
                                        <th className="p-2 text-left">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {connections.map((connection) => {
                                        const providerDef = providers.find((p) => p.provider === connection.provider);
                                        const scheduleSettings = readScheduleSettings(connection.config);
                                        return (
                                            <tr key={connection.id} className="border-t">
                                                <td className="p-2">
                                                    <div className="font-medium">{providerDef?.displayName || connection.provider}</div>
                                                    <div className="text-xs text-muted-foreground">{connection.displayName || '-'}</div>
                                                </td>
                                                <td className="p-2">
                                                    {connection.domain ? connection.domain : 'Portfolio'}
                                                </td>
                                                <td className="p-2 space-y-1">
                                                    <div>
                                                        <Badge variant={connection.status === 'error' ? 'destructive' : 'default'}>
                                                            {connection.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        sync: {connection.lastSyncStatus}
                                                    </div>
                                                    {providerDef?.supportsScheduledSync && (
                                                        <div className="text-xs text-muted-foreground">
                                                            cadence: {scheduleSettings.autoSyncEnabled ? `${scheduleSettings.intervalHours}h` : 'off'}
                                                            {' · '}
                                                            lookback: {scheduleSettings.lookbackDays}d
                                                        </div>
                                                    )}
                                                    {connection.lastSyncError && (
                                                        <div className="text-xs text-red-600 max-w-[260px] truncate" title={connection.lastSyncError}>
                                                            {connection.lastSyncError}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-2">{formatDate(connection.lastSyncAt)}</td>
                                                <td className="p-2">
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => syncConnection(connection.id)}
                                                            disabled={syncingId === connection.id}
                                                        >
                                                            {syncingId === connection.id ? 'Syncing...' : 'Run Sync'}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => deleteConnection(connection.id)}
                                                            disabled={deletingId === connection.id}
                                                        >
                                                            {deletingId === connection.id ? 'Removing...' : 'Delete'}
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Provider Catalog</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {providers.map((p) => (
                            <div key={p.provider} className="rounded border p-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">{p.displayName}</span>
                                    <Badge variant={p.executableSync ? 'default' : 'secondary'}>
                                        {p.executableSync ? 'Sync Ready' : 'Planned'}
                                    </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    {p.category} · {p.scope}
                                </div>
                                {p.notes && (
                                    <p className="text-xs text-muted-foreground mt-2">{p.notes}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
