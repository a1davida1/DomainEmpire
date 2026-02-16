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

type CloudflareShardHealthRow = {
    connectionId: string;
    shardKey: string;
    displayName: string | null;
    connectionStatus: 'pending' | 'connected' | 'error' | 'disabled';
    hasCredential: boolean;
    accountRef: string | null;
    accountId: string | null;
    region: string | null;
    baseWeight: number;
    penalty: number;
    cooldownUntil: string | null;
    cooldownRemainingSeconds: number;
    successCount: number;
    rateLimitCount: number;
    failureCount: number;
    observedCount?: number;
    instabilityRatio?: number;
    saturationSeverity?: 'healthy' | 'warning' | 'critical';
    lastOutcome: 'success' | 'rate_limited' | 'failure' | null;
    lastOutcomeAt: string | null;
    healthUpdatedAt: string | null;
    connectionUpdatedAt: string | null;
};

type CloudflareShardHealthSummary = {
    connectionCount: number;
    coolingCount: number;
    avgPenalty: number;
    totalSuccessCount: number;
    totalRateLimitCount: number;
    totalFailureCount: number;
    saturation?: {
        warningShards: number;
        criticalShards: number;
        warningRegions: number;
        criticalRegions: number;
        thresholds: {
            minSamples: number;
            shardFailureWarningRatio: number;
            shardFailureCriticalRatio: number;
            regionCoolingWarningRatio: number;
            regionCoolingCriticalRatio: number;
            minShardsPerRegion: number;
        };
    };
};

type RoutingPolicy = {
    defaultRegion: string | null;
    strictRegion: boolean;
    globalFallbackRegions: string[];
    regionFallbacks: Array<{ sourceRegion: string; fallbackRegions: string[] }>;
};

type RegionSaturationRow = {
    region: string;
    shardCount: number;
    coolingCount: number;
    warningCount: number;
    criticalCount: number;
    maxPenalty: number;
    coolingRatio: number;
    degradedRatio: number;
    avgInstabilityRatio: number;
    severity: 'healthy' | 'warning' | 'critical';
};

type CloudflareShardDraft = {
    accountRef: string;
    shardKey: string;
    region: string;
    shardWeight: string;
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

function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readCloudflareShardDraft(config: Record<string, unknown>): CloudflareShardDraft {
    const accountRef = asNonEmptyString(config.accountId)
        ?? asNonEmptyString(config.accountRef)
        ?? '';
    const shardKey = asNonEmptyString(config.shardKey)
        ?? asNonEmptyString(config.hostShardKey)
        ?? '';
    const region = asNonEmptyString(config.region)
        ?? asNonEmptyString(config.routingRegion)
        ?? asNonEmptyString(config.shardRegion)
        ?? '';
    const weightRaw = toNumericConfig(config.shardWeight)
        ?? toNumericConfig(config.capacityWeight)
        ?? toNumericConfig(config.weight);
    const shardWeight = weightRaw && weightRaw > 0
        ? String(Math.max(1, Math.min(Math.round(weightRaw), 1000)))
        : '100';

    return {
        accountRef,
        shardKey,
        region,
        shardWeight,
    };
}

function formatDurationSeconds(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0s';
    if (value < 60) return `${value}s`;
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    if (minutes < 60) return `${minutes}m ${seconds}s`;
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m`;
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
    const [updatingShardId, setUpdatingShardId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [shardHealthRows, setShardHealthRows] = useState<CloudflareShardHealthRow[]>([]);
    const [shardHealthSummary, setShardHealthSummary] = useState<CloudflareShardHealthSummary | null>(null);
    const [routingPolicy, setRoutingPolicy] = useState<RoutingPolicy | null>(null);
    const [regionSaturation, setRegionSaturation] = useState<RegionSaturationRow[]>([]);
    const [cloudflareDrafts, setCloudflareDrafts] = useState<Record<string, CloudflareShardDraft>>({});

    const [provider, setProvider] = useState<string>('');
    const [domainScope, setDomainScope] = useState<'portfolio' | 'domain'>('portfolio');
    const [domainId, setDomainId] = useState<string>('');
    const [displayName, setDisplayName] = useState<string>('');
    const [credential, setCredential] = useState<string>('');
    const [cloudflareAccountRef, setCloudflareAccountRef] = useState<string>('');
    const [cloudflareShardKey, setCloudflareShardKey] = useState<string>('');
    const [cloudflareRegion, setCloudflareRegion] = useState<string>('');
    const [cloudflareShardWeight, setCloudflareShardWeight] = useState<string>('100');
    const [autoSyncEnabled, setAutoSyncEnabled] = useState<'true' | 'false'>('true');
    const [syncIntervalHours, setSyncIntervalHours] = useState<string>('24');
    const [syncLookbackDays, setSyncLookbackDays] = useState<string>('30');

    const selectedProvider = useMemo(
        () => providers.find((p) => p.provider === provider) ?? null,
        [provider, providers],
    );

    const shardHealthByConnectionId = useMemo(
        () => new Map(shardHealthRows.map((row) => [row.connectionId, row])),
        [shardHealthRows],
    );

    const cloudflarePortfolioConnections = useMemo(
        () => connections.filter((connection) => connection.provider === 'cloudflare' && connection.domainId === null),
        [connections],
    );

    async function loadData() {
        setLoading(true);
        setError(null);
        try {
            const [providerRes, connectionRes, domainRes, shardHealthRes] = await Promise.all([
                fetch('/api/integrations/providers'),
                fetch('/api/integrations/connections'),
                fetch('/api/domains?limit=100'),
                fetch('/api/integrations/cloudflare-shards/health').catch(() => null),
            ]);

            if (!providerRes.ok || !connectionRes.ok || !domainRes.ok) {
                throw new Error('Failed to load integrations data');
            }

            const providerBody = await providerRes.json();
            const connectionBody = await connectionRes.json();
            const domainBody = await domainRes.json();

            const loadedConnections = (connectionBody.connections || []).map((connection: Connection) => ({
                ...connection,
                config: connection?.config && typeof connection.config === 'object' ? connection.config : {},
            }));

            setProviders(providerBody.providers || []);
            setConnections(loadedConnections);
            setDomains((domainBody.domains || []).map((d: { id: string; domain: string }) => ({
                id: d.id,
                domain: d.domain,
            })));

            const shardDrafts: Record<string, CloudflareShardDraft> = {};
            for (const connection of loadedConnections) {
                if (connection.provider !== 'cloudflare' || connection.domainId !== null) continue;
                shardDrafts[connection.id] = readCloudflareShardDraft(connection.config);
            }
            setCloudflareDrafts(shardDrafts);

            if (shardHealthRes && shardHealthRes.ok) {
                const shardBody = await shardHealthRes.json();
                setShardHealthRows(Array.isArray(shardBody.rows) ? shardBody.rows : []);
                setShardHealthSummary(shardBody.summary ?? null);
                setRoutingPolicy(shardBody.routingPolicy ?? null);
                setRegionSaturation(Array.isArray(shardBody.regionSaturation) ? shardBody.regionSaturation : []);
            } else {
                setShardHealthRows([]);
                setShardHealthSummary(null);
                setRoutingPolicy(null);
                setRegionSaturation([]);
            }

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
            if (selectedProvider.provider === 'cloudflare') {
                const accountRef = cloudflareAccountRef.trim();
                if (accountRef) {
                    config.accountId = accountRef;
                }
                const shardKey = cloudflareShardKey.trim();
                if (shardKey) {
                    config.shardKey = shardKey;
                }
                const region = cloudflareRegion.trim().toLowerCase();
                if (region) {
                    config.region = region.replaceAll('_', '-');
                }
                const weightParsed = Number.parseInt(cloudflareShardWeight, 10);
                if (Number.isFinite(weightParsed) && weightParsed > 0) {
                    config.shardWeight = Math.max(1, Math.min(weightParsed, 1000));
                }
            }

            const payload: Record<string, unknown> = {
                provider: selectedProvider.provider,
                category: selectedProvider.category,
                displayName: displayName.trim().length > 0 ? displayName.trim() : undefined,
                status: selectedProvider.provider === 'cloudflare' && credential.trim().length > 0
                    ? 'connected'
                    : 'pending',
                domainId: domainScope === 'domain' ? domainId : null,
                config,
            };
            if (selectedProvider.provider === 'cloudflare' && credential.trim().length > 0) {
                payload.credential = credential.trim();
            }

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
            setCredential('');
            setCloudflareAccountRef('');
            setCloudflareShardKey('');
            setCloudflareRegion('');
            setCloudflareShardWeight('100');
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

    function updateCloudflareDraft(connectionId: string, field: keyof CloudflareShardDraft, value: string) {
        const defaultDraft: CloudflareShardDraft = {
            accountRef: '',
            shardKey: '',
            region: '',
            shardWeight: '100',
        };
        setCloudflareDrafts((current) => ({
            ...current,
            [connectionId]: {
                ...(current[connectionId] || defaultDraft),
                [field]: value,
            },
        }));
    }

    async function saveCloudflareShardConfig(connection: Connection) {
        const draft = cloudflareDrafts[connection.id] ?? readCloudflareShardDraft(connection.config);
        const nextConfig: Record<string, unknown> = { ...connection.config };

        const accountRef = draft.accountRef.trim();
        if (accountRef) nextConfig.accountId = accountRef;
        else delete nextConfig.accountId;

        const shardKey = draft.shardKey.trim();
        if (shardKey) nextConfig.shardKey = shardKey;
        else delete nextConfig.shardKey;

        const region = draft.region.trim().toLowerCase();
        if (region) nextConfig.region = region.replaceAll('_', '-');
        else delete nextConfig.region;

        const weight = Number.parseInt(draft.shardWeight, 10);
        if (Number.isFinite(weight) && weight > 0) {
            nextConfig.shardWeight = Math.max(1, Math.min(weight, 1000));
        } else {
            delete nextConfig.shardWeight;
        }

        setUpdatingShardId(connection.id);
        setError(null);
        setMessage(null);
        try {
            const res = await fetch('/api/integrations/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: connection.id,
                    provider: connection.provider,
                    category: connection.category,
                    domainId: connection.domainId,
                    status: connection.status,
                    config: nextConfig,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.error || 'Failed to update Cloudflare shard settings');
            }

            setMessage(`Updated shard settings for ${connection.displayName || connection.id}.`);
            await loadData();
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Failed to update shard settings');
        } finally {
            setUpdatingShardId(null);
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
                if (res.status === 409 && body.code === 'sync_already_running') {
                    const runningRunId = typeof body.runId === 'string' ? body.runId : null;
                    setMessage(
                        runningRunId
                            ? `A sync is already running (run ${runningRunId.slice(0, 8)}).`
                            : 'A sync is already running for this connection.',
                    );
                    await loadData();
                    return;
                }
                throw new Error(body.error || 'Failed to sync connection');
            }

            const runStatus = body?.run?.status || 'unknown';
            const cooldownSeconds = Number(body?.run?.details?.rateLimitCooldownSeconds);
            if (
                runStatus === 'partial'
                && Number.isFinite(cooldownSeconds)
                && cooldownSeconds > 0
            ) {
                setMessage(`Sync completed with status: partial (Cloudflare cooldown ~${Math.ceil(cooldownSeconds)}s).`);
            } else {
                setMessage(`Sync completed with status: ${runStatus}`);
            }
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

                    {selectedProvider?.provider === 'cloudflare' && (
                        <div className="grid gap-4 md:grid-cols-5">
                            <div className="space-y-2">
                                <Label>API Token</Label>
                                <Input
                                    type="password"
                                    value={credential}
                                    onChange={(e) => setCredential(e.target.value)}
                                    placeholder="Cloudflare API token"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Required for host sharding and API operations.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Account ID / Name</Label>
                                <Input
                                    value={cloudflareAccountRef}
                                    onChange={(e) => setCloudflareAccountRef(e.target.value)}
                                    placeholder="32-char account id or account name"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Used to resolve this shard&apos;s Cloudflare account.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Shard Key (optional)</Label>
                                <Input
                                    value={cloudflareShardKey}
                                    onChange={(e) => setCloudflareShardKey(e.target.value)}
                                    placeholder="legal-content-1"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Match per-domain host shard overrides.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Region (optional)</Label>
                                <Input
                                    value={cloudflareRegion}
                                    onChange={(e) => setCloudflareRegion(e.target.value)}
                                    placeholder="us-east"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Used by regional failover routing policy.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Shard Weight</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={cloudflareShardWeight}
                                    onChange={(e) => setCloudflareShardWeight(e.target.value)}
                                    placeholder="100"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Higher weight receives more assignments.
                                </p>
                            </div>
                        </div>
                    )}

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
                    <CardTitle>Cloudflare Shard Control Plane</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {shardHealthSummary && (
                        <div className="grid gap-3 md:grid-cols-6">
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Shards</div>
                                <div className="text-xl font-semibold">{shardHealthSummary.connectionCount}</div>
                            </div>
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Cooling</div>
                                <div className="text-xl font-semibold">{shardHealthSummary.coolingCount}</div>
                            </div>
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Avg Penalty</div>
                                <div className="text-xl font-semibold">{shardHealthSummary.avgPenalty}</div>
                            </div>
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Success</div>
                                <div className="text-xl font-semibold">{shardHealthSummary.totalSuccessCount}</div>
                            </div>
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Rate Limits</div>
                                <div className="text-xl font-semibold">{shardHealthSummary.totalRateLimitCount}</div>
                            </div>
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Failures</div>
                                <div className="text-xl font-semibold">{shardHealthSummary.totalFailureCount}</div>
                            </div>
                        </div>
                    )}

                    {shardHealthSummary?.saturation && (
                        <div className="grid gap-3 md:grid-cols-4">
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Shard Saturation</div>
                                <div className="text-sm font-medium">
                                    warning {shardHealthSummary.saturation.warningShards}
                                    {' · '}
                                    critical {shardHealthSummary.saturation.criticalShards}
                                </div>
                            </div>
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Region Saturation</div>
                                <div className="text-sm font-medium">
                                    warning {shardHealthSummary.saturation.warningRegions}
                                    {' · '}
                                    critical {shardHealthSummary.saturation.criticalRegions}
                                </div>
                            </div>
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Failure Thresholds</div>
                                <div className="text-sm font-medium">
                                    {Math.round(shardHealthSummary.saturation.thresholds.shardFailureWarningRatio * 100)}%
                                    {' / '}
                                    {Math.round(shardHealthSummary.saturation.thresholds.shardFailureCriticalRatio * 100)}%
                                </div>
                            </div>
                            <div className="rounded border p-3">
                                <div className="text-xs text-muted-foreground">Cooling Thresholds</div>
                                <div className="text-sm font-medium">
                                    {Math.round(shardHealthSummary.saturation.thresholds.regionCoolingWarningRatio * 100)}%
                                    {' / '}
                                    {Math.round(shardHealthSummary.saturation.thresholds.regionCoolingCriticalRatio * 100)}%
                                </div>
                            </div>
                        </div>
                    )}

                    {routingPolicy && (
                        <div className="rounded border p-3 text-xs text-muted-foreground">
                            <div>
                                routing default region: <span className="font-medium text-foreground">{routingPolicy.defaultRegion || 'not set'}</span>
                                {' · '}
                                strict region: <span className="font-medium text-foreground">{routingPolicy.strictRegion ? 'on' : 'off'}</span>
                            </div>
                            <div>
                                global fallbacks: <span className="font-medium text-foreground">{routingPolicy.globalFallbackRegions.length > 0 ? routingPolicy.globalFallbackRegions.join(', ') : 'none'}</span>
                            </div>
                            <div>
                                region fallback matrix: <span className="font-medium text-foreground">
                                    {routingPolicy.regionFallbacks.length > 0
                                        ? routingPolicy.regionFallbacks.map((entry) => `${entry.sourceRegion} -> ${entry.fallbackRegions.join(', ')}`).join(' | ')
                                        : 'none'}
                                </span>
                            </div>
                        </div>
                    )}

                    {regionSaturation.length > 0 && (
                        <div className="rounded border p-3">
                            <div className="text-xs text-muted-foreground mb-2">Region Saturation Snapshot</div>
                            <div className="flex flex-wrap gap-2">
                                {regionSaturation.slice(0, 8).map((entry) => (
                                    <span
                                        key={entry.region}
                                        className={`rounded-full border px-3 py-1 text-xs ${
                                            entry.severity === 'critical'
                                                ? 'border-red-300 bg-red-50 text-red-800'
                                                : entry.severity === 'warning'
                                                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                                                    : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                        }`}
                                    >
                                        {entry.region}: {entry.coolingCount}/{entry.shardCount} cooling
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {cloudflarePortfolioConnections.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No portfolio-level Cloudflare shards configured.</p>
                    ) : (
                        <div className="space-y-3">
                            {cloudflarePortfolioConnections.map((connection) => {
                                const draft = cloudflareDrafts[connection.id] ?? readCloudflareShardDraft(connection.config);
                                const health = shardHealthByConnectionId.get(connection.id);
                                return (
                                    <div key={connection.id} className="rounded border p-3 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <div className="font-medium">{connection.displayName || connection.id}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    status: {connection.status}
                                                    {' · '}
                                                    credential: {connection.hasCredential ? 'present' : 'missing'}
                                                    {' · '}
                                                    shard: {health?.shardKey || draft.shardKey || '-'}
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                cooldown: {health && health.cooldownRemainingSeconds > 0 ? formatDurationSeconds(health.cooldownRemainingSeconds) : 'none'}
                                                {' · '}
                                                penalty: {health?.penalty ?? 0}
                                            </div>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Account ID / Name</Label>
                                                <Input
                                                    value={draft.accountRef}
                                                    onChange={(event) => updateCloudflareDraft(connection.id, 'accountRef', event.target.value)}
                                                    placeholder="account id or name"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Shard Key</Label>
                                                <Input
                                                    value={draft.shardKey}
                                                    onChange={(event) => updateCloudflareDraft(connection.id, 'shardKey', event.target.value)}
                                                    placeholder="legal-content-1"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Region</Label>
                                                <Input
                                                    value={draft.region}
                                                    onChange={(event) => updateCloudflareDraft(connection.id, 'region', event.target.value)}
                                                    placeholder="us-east"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Weight</Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    max={1000}
                                                    value={draft.shardWeight}
                                                    onChange={(event) => updateCloudflareDraft(connection.id, 'shardWeight', event.target.value)}
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-xs text-muted-foreground">
                                                health: success {health?.successCount ?? 0}
                                                {' · '}
                                                rate-limit {health?.rateLimitCount ?? 0}
                                                {' · '}
                                                failure {health?.failureCount ?? 0}
                                                {' · '}
                                                instability {Math.round((health?.instabilityRatio ?? 0) * 100)}%
                                                {' · '}
                                                last outcome {health?.lastOutcome || '-'} {health?.lastOutcomeAt ? `(${formatDate(health.lastOutcomeAt)})` : ''}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => saveCloudflareShardConfig(connection)}
                                                disabled={updatingShardId === connection.id}
                                            >
                                                {updatingShardId === connection.id ? 'Saving...' : 'Save Shard Settings'}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
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
