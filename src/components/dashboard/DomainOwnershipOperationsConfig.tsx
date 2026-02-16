'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Props {
    domainId: string;
}

type OwnershipStatus = 'unknown' | 'unverified' | 'verified' | 'pending_transfer' | 'transferred';
type TransferStatus = 'none' | 'initiated' | 'pending' | 'completed' | 'failed';
type LockStatus = 'unknown' | 'locked' | 'unlocked';
type DnssecStatus = 'unknown' | 'enabled' | 'disabled';
type ExpirationRisk = 'unknown' | 'none' | 'low' | 'medium' | 'high' | 'critical' | 'expired';

interface OwnershipProfile {
    id: string;
    connectionId: string | null;
    ownershipStatus: OwnershipStatus;
    transferStatus: TransferStatus;
    transferTargetRegistrar: string | null;
    transferRequestedAt: string | null;
    transferCompletedAt: string | null;
    autoRenewEnabled: boolean;
    lockStatus: LockStatus;
    dnssecStatus: DnssecStatus;
    ownerHandle: string | null;
    notes: string | null;
    metadata: Record<string, unknown>;
    expirationRisk: ExpirationRisk;
    expirationRiskScore: number;
    expirationRiskUpdatedAt: string | null;
    ownershipLastChangedAt: string | null;
    ownershipChangedBy: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface OwnershipEvent {
    id: string;
    profileId: string | null;
    eventType: string;
    source: 'manual' | 'integration_sync' | 'system';
    summary: string;
    reason: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    actorId: string | null;
    actorName: string | null;
}

interface OwnershipPayload {
    domain: {
        id: string;
        domain: string;
        registrar: string;
        lifecycleState: string;
        renewalDate: string | null;
        renewalPrice: string | null;
    };
    permissions?: {
        canEdit: boolean;
        role: string;
    };
    profile: OwnershipProfile | null;
    renewalRisk: {
        risk: ExpirationRisk;
        riskScore: number;
        daysUntilRenewal: number | null;
        renewalWindow: string;
        recommendation: string;
    };
    events: OwnershipEvent[];
}

interface FormState {
    ownershipStatus: OwnershipStatus;
    transferStatus: TransferStatus;
    transferTargetRegistrar: string;
    transferRequestedAt: string;
    transferCompletedAt: string;
    autoRenewEnabled: boolean;
    lockStatus: LockStatus;
    dnssecStatus: DnssecStatus;
    ownerHandle: string;
    notes: string;
    reason: string;
}

type NameserverOnboardingStage =
    | 'manual_required'
    | 'zone_missing'
    | 'ready_to_switch'
    | 'switch_recorded_waiting_dns'
    | 'propagating'
    | 'verified';

interface NameserverStatusPayload {
    domain: {
        id: string;
        domain: string;
        registrar: string;
        cloudflareAccount: string | null;
    };
    zone: {
        exists: boolean;
        zoneId: string | null;
        zoneName: string | null;
        nameservers: string[];
        shardKey: string | null;
        warnings: string[];
    };
    registrar: {
        automated: boolean;
        lastConfiguredNameservers: string[];
        source: string | null;
        lastUpdatedAt: string | null;
    };
    liveDns: {
        nameservers: string[];
        checkedAt: string;
        lookupError: string | null;
        matchToCloudflare: 'match' | 'partial' | 'mismatch' | 'unknown';
    };
    status: {
        stage: NameserverOnboardingStage;
        summary: string;
        nextAction: string;
    };
    actions: {
        canCreateZone: boolean;
        canSwitchNameservers: boolean;
    };
}

const OWNERSHIP_STATUSES: OwnershipStatus[] = [
    'unknown',
    'unverified',
    'verified',
    'pending_transfer',
    'transferred',
];

const TRANSFER_STATUSES: TransferStatus[] = [
    'none',
    'initiated',
    'pending',
    'completed',
    'failed',
];

const LOCK_STATUSES: LockStatus[] = ['unknown', 'locked', 'unlocked'];
const DNSSEC_STATUSES: DnssecStatus[] = ['unknown', 'enabled', 'disabled'];
const AUTOMATED_NS_REGISTRARS = new Set(['godaddy', 'namecheap']);

const RISK_BADGE_STYLES: Record<ExpirationRisk, string> = {
    unknown: 'bg-slate-100 text-slate-800',
    none: 'bg-emerald-100 text-emerald-800',
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-900',
    high: 'bg-orange-100 text-orange-900',
    critical: 'bg-red-100 text-red-900',
    expired: 'bg-red-200 text-red-950',
};

const DNS_STAGE_STYLES: Record<NameserverOnboardingStage, string> = {
    manual_required: 'bg-amber-100 text-amber-900',
    zone_missing: 'bg-orange-100 text-orange-900',
    ready_to_switch: 'bg-blue-100 text-blue-900',
    switch_recorded_waiting_dns: 'bg-blue-100 text-blue-900',
    propagating: 'bg-violet-100 text-violet-900',
    verified: 'bg-emerald-100 text-emerald-900',
};

function toLocalDateTime(value: string | null): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const tzOffset = parsed.getTimezoneOffset() * 60 * 1000;
    return new Date(parsed.getTime() - tzOffset).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function buildForm(profile: OwnershipProfile | null): FormState {
    return {
        ownershipStatus: profile?.ownershipStatus ?? 'unknown',
        transferStatus: profile?.transferStatus ?? 'none',
        transferTargetRegistrar: profile?.transferTargetRegistrar ?? '',
        transferRequestedAt: toLocalDateTime(profile?.transferRequestedAt ?? null),
        transferCompletedAt: toLocalDateTime(profile?.transferCompletedAt ?? null),
        autoRenewEnabled: profile?.autoRenewEnabled ?? true,
        lockStatus: profile?.lockStatus ?? 'unknown',
        dnssecStatus: profile?.dnssecStatus ?? 'unknown',
        ownerHandle: profile?.ownerHandle ?? '',
        notes: profile?.notes ?? '',
        reason: '',
    };
}

function formatTimestamp(value: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
}

function formatNameserverList(values: string[]): string {
    if (!Array.isArray(values) || values.length === 0) return '—';
    return values.join(', ');
}

function formatStageLabel(stage: NameserverOnboardingStage): string {
    return stage.replaceAll('_', ' ');
}

export default function DomainOwnershipOperationsConfig({ domainId }: Props) {
    const [payload, setPayload] = useState<OwnershipPayload | null>(null);
    const [dnsStatus, setDnsStatus] = useState<NameserverStatusPayload | null>(null);
    const [form, setForm] = useState<FormState>(buildForm(null));
    const [loading, setLoading] = useState(true);
    const [loadingDnsStatus, setLoadingDnsStatus] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncingRegistrar, setSyncingRegistrar] = useState(false);
    const [creatingZone, setCreatingZone] = useState(false);
    const [switchingNameservers, setSwitchingNameservers] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorAction, setErrorAction] = useState<{ href: string; label: string } | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const canEdit = payload?.permissions?.canEdit ?? false;
    const registrarForDns = (payload?.domain.registrar || '').toLowerCase();
    const canAutomateNameserverCutover = AUTOMATED_NS_REGISTRARS.has(registrarForDns);
    const eventCount = payload?.events.length ?? 0;
    const dnsStage = dnsStatus?.status.stage ?? null;

    const riskStyle = useMemo(() => {
        const risk = payload?.renewalRisk.risk ?? 'unknown';
        return RISK_BADGE_STYLES[risk];
    }, [payload]);

    const dnsStageStyle = useMemo(() => {
        if (!dnsStage) return 'bg-slate-100 text-slate-800';
        return DNS_STAGE_STYLES[dnsStage];
    }, [dnsStage]);

    async function loadOwnership() {
        setLoading(true);
        setError(null);
        setErrorAction(null);
        try {
            const response = await fetch(`/api/domains/${domainId}/ownership?limit=20`);
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to load ownership operations');
            }
            const data = await response.json() as OwnershipPayload;
            setPayload(data);
            setForm(buildForm(data.profile));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load ownership operations');
        } finally {
            setLoading(false);
        }
    }

    async function loadNameserverStatus() {
        setLoadingDnsStatus(true);
        try {
            const response = await fetch(`/api/domains/${domainId}/nameservers/status`);
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error || 'Failed to load nameserver status');
            }
            setDnsStatus(body as NameserverStatusPayload);
        } catch (statusError) {
            setDnsStatus(null);
            setError(statusError instanceof Error ? statusError.message : 'Failed to load nameserver status');
        } finally {
            setLoadingDnsStatus(false);
        }
    }

    useEffect(() => {
        void Promise.all([loadOwnership(), loadNameserverStatus()]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [domainId]);

    function update<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((current) => ({ ...current, [key]: value }));
        setMessage(null);
    }

    async function saveProfile() {
        if (!canEdit) return;
        setSaving(true);
        setError(null);
        setErrorAction(null);
        setMessage(null);

        const requestBody = {
            ownershipStatus: form.ownershipStatus,
            transferStatus: form.transferStatus,
            transferTargetRegistrar: form.transferTargetRegistrar.trim() || null,
            transferRequestedAt: toIsoDateTime(form.transferRequestedAt),
            transferCompletedAt: toIsoDateTime(form.transferCompletedAt),
            autoRenewEnabled: form.autoRenewEnabled,
            lockStatus: form.lockStatus,
            dnssecStatus: form.dnssecStatus,
            ownerHandle: form.ownerHandle.trim() || null,
            notes: form.notes.trim() || null,
            reason: form.reason.trim() || null,
        };

        try {
            const response = await fetch(`/api/domains/${domainId}/ownership`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error || 'Failed to save ownership profile');
            }
            setMessage('Ownership profile updated.');
            await Promise.all([loadOwnership(), loadNameserverStatus()]);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save ownership profile');
        } finally {
            setSaving(false);
        }
    }

    async function syncRenewalData() {
        setSyncing(true);
        setError(null);
        setErrorAction(null);
        setMessage(null);
        try {
            const renewalResponse = await fetch(`/api/domains/${domainId}/renewals`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const renewalBody = await renewalResponse.json().catch(() => ({}));
            if (!renewalResponse.ok) {
                throw new Error(renewalBody.error || 'Failed to sync renewal data');
            }

            if (canEdit) {
                const recomputeResponse = await fetch(`/api/domains/${domainId}/ownership`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recomputeRisk: true,
                        reason: 'Manual renewal sync recompute',
                    }),
                });
                const recomputeBody = await recomputeResponse.json().catch(() => ({}));
                if (!recomputeResponse.ok) {
                    throw new Error(recomputeBody.error || 'Failed to recompute renewal risk');
                }
            }

            setMessage('Renewal data synced.');
            await loadOwnership();
        } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : 'Failed to sync renewal data');
        } finally {
            setSyncing(false);
        }
    }

    async function createCloudflareZone() {
        if (!canEdit) return;
        setCreatingZone(true);
        setError(null);
        setErrorAction(null);
        setMessage(null);

        try {
            const response = await fetch(`/api/domains/${domainId}/cloudflare-zone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jumpStart: false }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error || body.message || 'Failed to create Cloudflare zone');
            }

            const nameservers = Array.isArray(body.nameservers)
                ? body.nameservers.join(', ')
                : 'pending';
            setMessage(
                body.created
                    ? `Cloudflare zone created. Nameservers: ${nameservers}`
                    : `Cloudflare zone already exists. Nameservers: ${nameservers}`,
            );
            await loadNameserverStatus();
        } catch (zoneError) {
            setError(zoneError instanceof Error ? zoneError.message : 'Failed to create Cloudflare zone');
        } finally {
            setCreatingZone(false);
        }
    }

    async function switchNameserversToCloudflare() {
        const activePayload = payload;
        if (!activePayload || !canEdit || !canAutomateNameserverCutover) return;

        setSwitchingNameservers(true);
        setError(null);
        setErrorAction(null);
        setMessage(null);

        try {
            const preflightResponse = await fetch(`/api/domains/${domainId}/nameservers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dryRun: true,
                    reason: form.reason.trim() || 'Manual nameserver cutover to Cloudflare from ownership panel',
                }),
            });
            const preflightBody = await preflightResponse.json().catch(() => ({}));
            if (!preflightResponse.ok) {
                throw new Error(preflightBody.error || preflightBody.message || 'Failed nameserver preflight');
            }

            const plannedNameservers = Array.isArray(preflightBody.nameservers)
                ? preflightBody.nameservers.join(', ')
                : 'Cloudflare nameservers';
            const previousNameservers = Array.isArray(preflightBody.previousNameservers)
                ? preflightBody.previousNameservers.join(', ')
                : 'unknown';
            const confirmed = window.confirm(
                `Switch ${activePayload.domain.domain} nameservers to Cloudflare now?\n\n` +
                `Current: ${previousNameservers}\n` +
                `Planned: ${plannedNameservers}\n\n` +
                `This updates nameservers at ${activePayload.domain.registrar} and may affect live DNS after propagation.`
            );
            if (!confirmed) return;

            const response = await fetch(`/api/domains/${domainId}/nameservers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason: form.reason.trim() || 'Manual nameserver cutover to Cloudflare from ownership panel',
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error || body.message || 'Failed to switch nameservers');
            }

            const nameserverList = Array.isArray(body.nameservers)
                ? body.nameservers.join(', ')
                : 'Cloudflare nameservers';
            setMessage(`Nameservers switched: ${nameserverList}`);
            await Promise.all([loadOwnership(), loadNameserverStatus()]);
        } catch (switchError) {
            setError(switchError instanceof Error ? switchError.message : 'Failed to switch nameservers');
        } finally {
            setSwitchingNameservers(false);
        }
    }

    async function syncRegistrarState() {
        if (!canEdit) return;
        setSyncingRegistrar(true);
        setError(null);
        setErrorAction(null);
        setMessage(null);

        try {
            const response = await fetch(`/api/domains/${domainId}/ownership/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    days: 90,
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                const actionHref = typeof body?.action === 'string' && body.action.startsWith('/dashboard/')
                    ? body.action
                    : null;
                if (actionHref) {
                    setErrorAction({ href: actionHref, label: 'Open Integrations' });
                }

                if (response.status === 409 && body?.code === 'registrar_integration_missing') {
                    const provider = typeof body?.provider === 'string'
                        ? body.provider
                        : (payload?.domain.registrar || 'registrar');
                    throw new Error(
                        `No connected ${provider} integration is available for this domain. ` +
                        'Connect the registrar first, then retry sync.',
                    );
                }

                if (response.status === 409 && body?.code === 'sync_already_running') {
                    const runId = typeof body?.runId === 'string' ? body.runId : null;
                    throw new Error(
                        runId
                            ? `Registrar sync already running (run ${runId.slice(0, 8)}).`
                            : 'Registrar sync already running for this domain connection.',
                    );
                }

                throw new Error(body.error || body.message || 'Failed to sync registrar state');
            }

            const runStatus = typeof body?.run?.status === 'string' ? body.run.status : 'success';
            const providerSignalError = typeof body?.run?.details?.providerSignalError === 'string'
                ? body.run.details.providerSignalError
                : null;

            if (runStatus === 'partial' && providerSignalError) {
                setMessage(`Registrar sync completed with warnings: ${providerSignalError}`);
            } else {
                setMessage('Registrar state synced.');
            }
            setErrorAction(null);
            await Promise.all([loadOwnership(), loadNameserverStatus()]);
        } catch (syncError) {
            setError(syncError instanceof Error ? syncError.message : 'Failed to sync registrar state');
        } finally {
            setSyncingRegistrar(false);
        }
    }

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Registrar and Ownership Operations</CardTitle>
                    <CardDescription>Loading ownership operations...</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (!payload) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Registrar and Ownership Operations</CardTitle>
                    <CardDescription>Unable to load ownership operations.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Registrar and Ownership Operations</CardTitle>
                <CardDescription>
                    Manage transfer, lock, DNSSEC, and renewal risk posture for this domain.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Renewal Risk</p>
                        <Badge className={`mt-1 capitalize ${riskStyle}`}>{payload.renewalRisk.risk}</Badge>
                        <p className="mt-2 text-sm">Score: {payload.renewalRisk.riskScore}</p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Days Until Renewal</p>
                        <p className="mt-2 text-sm">
                            {payload.renewalRisk.daysUntilRenewal === null ? '-' : payload.renewalRisk.daysUntilRenewal}
                        </p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Renewal Window</p>
                        <p className="mt-2 text-sm capitalize">{payload.renewalRisk.renewalWindow.replaceAll('_', ' ')}</p>
                    </div>
                    <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Last Synced</p>
                        <p className="mt-2 text-sm">{formatTimestamp(payload.profile?.lastSyncedAt ?? null)}</p>
                    </div>
                </div>

                <div className="rounded-md border p-3 text-sm">
                    <p className="font-medium">Recommendation</p>
                    <p className="mt-1 text-muted-foreground">{payload.renewalRisk.recommendation}</p>
                </div>

                <div className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p className="font-medium">DNS Onboarding Status</p>
                            <p className="text-xs text-muted-foreground">
                                Zone -&gt; registrar cutover -&gt; live DNS verification
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge className={`capitalize ${dnsStageStyle}`}>
                                {dnsStage ? formatStageLabel(dnsStage) : 'checking'}
                            </Badge>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadNameserverStatus}
                                disabled={loadingDnsStatus}
                            >
                                {loadingDnsStatus ? 'Checking...' : 'Refresh Status'}
                            </Button>
                        </div>
                    </div>

                    {loadingDnsStatus ? (
                        <p className="mt-3 text-sm text-muted-foreground">Checking Cloudflare + live DNS state...</p>
                    ) : !dnsStatus ? (
                        <p className="mt-3 text-sm text-muted-foreground">Nameserver status unavailable.</p>
                    ) : (
                        <div className="mt-3 space-y-3">
                            <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded border p-2">
                                    <p className="text-xs text-muted-foreground">Cloudflare Zone</p>
                                    <p className="mt-1 text-sm">
                                        {dnsStatus.zone.exists ? 'Ready' : 'Missing'}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {formatNameserverList(dnsStatus.zone.nameservers)}
                                    </p>
                                </div>
                                <div className="rounded border p-2">
                                    <p className="text-xs text-muted-foreground">Registrar Recorded</p>
                                    <p className="mt-1 text-sm">
                                        {dnsStatus.registrar.lastConfiguredNameservers.length > 0 ? 'Switch recorded' : 'Not switched'}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {formatNameserverList(dnsStatus.registrar.lastConfiguredNameservers)}
                                    </p>
                                </div>
                                <div className="rounded border p-2">
                                    <p className="text-xs text-muted-foreground">Live DNS</p>
                                    <p className="mt-1 text-sm capitalize">
                                        {dnsStatus.liveDns.matchToCloudflare.replaceAll('_', ' ')}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {dnsStatus.liveDns.lookupError
                                            ? `Lookup error: ${dnsStatus.liveDns.lookupError}`
                                            : formatNameserverList(dnsStatus.liveDns.nameservers)}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded border bg-muted/20 p-2">
                                <p className="text-sm">{dnsStatus.status.summary}</p>
                                <p className="text-xs text-muted-foreground mt-1">{dnsStatus.status.nextAction}</p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    onClick={createCloudflareZone}
                                    disabled={!canEdit || creatingZone || !dnsStatus.actions.canCreateZone}
                                    variant="secondary"
                                >
                                    {creatingZone ? 'Creating Zone...' : 'Create Cloudflare Zone'}
                                </Button>
                                <Button
                                    onClick={switchNameserversToCloudflare}
                                    disabled={!canEdit || switchingNameservers || !dnsStatus.actions.canSwitchNameservers || !canAutomateNameserverCutover}
                                    variant="secondary"
                                >
                                    {switchingNameservers ? 'Switching DNS...' : 'Switch Nameservers to Cloudflare'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="ownership-status">Ownership Status</Label>
                        <Select
                            value={form.ownershipStatus}
                            onValueChange={(value) => update('ownershipStatus', value as OwnershipStatus)}
                            disabled={!canEdit || saving}
                        >
                            <SelectTrigger id="ownership-status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {OWNERSHIP_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {status.replaceAll('_', ' ')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="transfer-status">Transfer Status</Label>
                        <Select
                            value={form.transferStatus}
                            onValueChange={(value) => update('transferStatus', value as TransferStatus)}
                            disabled={!canEdit || saving}
                        >
                            <SelectTrigger id="transfer-status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TRANSFER_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {status.replaceAll('_', ' ')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="lock-status">Lock Status</Label>
                        <Select
                            value={form.lockStatus}
                            onValueChange={(value) => update('lockStatus', value as LockStatus)}
                            disabled={!canEdit || saving}
                        >
                            <SelectTrigger id="lock-status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LOCK_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {status}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="dnssec-status">DNSSEC Status</Label>
                        <Select
                            value={form.dnssecStatus}
                            onValueChange={(value) => update('dnssecStatus', value as DnssecStatus)}
                            disabled={!canEdit || saving}
                        >
                            <SelectTrigger id="dnssec-status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DNSSEC_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>
                                        {status}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="transfer-target">Transfer Target Registrar</Label>
                        <Input
                            id="transfer-target"
                            value={form.transferTargetRegistrar}
                            onChange={(event) => update('transferTargetRegistrar', event.target.value)}
                            placeholder="e.g., namecheap"
                            disabled={!canEdit || saving}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="owner-handle">Owner Handle</Label>
                        <Input
                            id="owner-handle"
                            value={form.ownerHandle}
                            onChange={(event) => update('ownerHandle', event.target.value)}
                            placeholder="Registrar account/owner reference"
                            disabled={!canEdit || saving}
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="transfer-requested-at">Transfer Requested At</Label>
                        <Input
                            id="transfer-requested-at"
                            type="datetime-local"
                            value={form.transferRequestedAt}
                            onChange={(event) => update('transferRequestedAt', event.target.value)}
                            disabled={!canEdit || saving}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="transfer-completed-at">Transfer Completed At</Label>
                        <Input
                            id="transfer-completed-at"
                            type="datetime-local"
                            value={form.transferCompletedAt}
                            onChange={(event) => update('transferCompletedAt', event.target.value)}
                            disabled={!canEdit || saving}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="ownership-notes">Operations Notes</Label>
                    <Textarea
                        id="ownership-notes"
                        value={form.notes}
                        onChange={(event) => update('notes', event.target.value)}
                        placeholder="Document lock exceptions, transfer blockers, registrar incidents..."
                        disabled={!canEdit || saving}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="ownership-reason">Change Reason</Label>
                    <Input
                        id="ownership-reason"
                        value={form.reason}
                        onChange={(event) => update('reason', event.target.value)}
                        placeholder="Required for initiated/failed transfer updates"
                        disabled={!canEdit || saving}
                    />
                </div>

                <label htmlFor="auto-renew-enabled" className="flex items-center gap-2 text-sm">
                    <input
                        id="auto-renew-enabled"
                        type="checkbox"
                        checked={form.autoRenewEnabled}
                        onChange={(event) => update('autoRenewEnabled', event.target.checked)}
                        disabled={!canEdit || saving}
                    />
                    Auto-renew enabled
                </label>

                <div className="flex flex-wrap gap-2">
                    <Button onClick={syncRenewalData} disabled={syncing}>
                        {syncing ? 'Syncing...' : 'Sync Renewal Data'}
                    </Button>
                    <Button onClick={syncRegistrarState} disabled={!canEdit || syncingRegistrar} variant="secondary">
                        {syncingRegistrar ? 'Syncing Registrar...' : 'Sync Registrar State'}
                    </Button>
                    <Button onClick={saveProfile} disabled={!canEdit || saving} variant="outline">
                        {saving ? 'Saving...' : 'Save Ownership Profile'}
                    </Button>
                    {!canEdit && (
                        <p className="self-center text-xs text-muted-foreground">
                            Current role ({payload.permissions?.role || 'unknown'}) cannot edit ownership state.
                        </p>
                    )}
                    {!canAutomateNameserverCutover && (
                        <p className="self-center text-xs text-muted-foreground">
                            Automated nameserver cutover is currently supported for GoDaddy and Namecheap domains.
                        </p>
                    )}
                </div>

                <div className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <p className="font-medium">Recent Ownership Events</p>
                        <p className="text-xs text-muted-foreground">{eventCount} shown</p>
                    </div>
                    {eventCount === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">No ownership events recorded yet.</p>
                    ) : (
                        <div className="mt-3 space-y-2">
                            {payload.events.map((event) => (
                                <div key={event.id} className="rounded border p-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-medium">{event.summary}</p>
                                        <Badge variant="outline" className="capitalize">
                                            {event.source.replaceAll('_', ' ')}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {event.eventType.replaceAll('_', ' ')} • {formatTimestamp(event.createdAt)}
                                        {event.actorName ? ` • ${event.actorName}` : ''}
                                    </p>
                                    {event.reason && (
                                        <p className="mt-1 text-xs text-muted-foreground">Reason: {event.reason}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        <p>{error}</p>
                        {errorAction && (
                            <Link href={errorAction.href} className="mt-2 inline-block text-xs underline underline-offset-2">
                                {errorAction.label}
                            </Link>
                        )}
                    </div>
                )}
                {message && (
                    <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                        {message}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
