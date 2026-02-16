'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Settings, Rocket, Globe, Trash2, AlertTriangle, Waypoints } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DomainActionsProps {
    domainId: string;
    domainName: string;
    isDeployed: boolean;
    registrar?: string | null;
    nameserverConfigured?: boolean | null;
    nameserverPending?: boolean | null;
}

type PreflightIssue = {
    code: string;
    message: string;
    severity: 'blocking' | 'warning';
};

type NameserverFailure = {
    code?: string;
    domain: string;
    error: string;
};

type NameserverSkip = {
    domain: string;
    reason: string;
};

type NameserverPreflightResponse = {
    readyCount?: number;
    failedCount?: number;
    skippedCount?: number;
    failures?: NameserverFailure[];
    skipped?: NameserverSkip[];
};

type NameserverApplyResponse = {
    successCount?: number;
    failedCount?: number;
    skippedCount?: number;
    failures?: NameserverFailure[];
    skipped?: NameserverSkip[];
};

type CloudflareZoneCreateResponse = {
    createdCount?: number;
    existingCount?: number;
    failedCount?: number;
    failed?: Array<{ domain: string; error: string }>;
};

const AUTOMATED_NAMESERVER_REGISTRARS = new Set(['godaddy', 'namecheap']);

function isMissingCloudflareZoneFailure(failure: NameserverFailure): boolean {
    if (failure.code === 'missing_cloudflare_zone') {
        return true;
    }
    return failure.error.includes('Unable to resolve Cloudflare nameservers');
}

export function DomainActions({
    domainId,
    domainName,
    isDeployed,
    registrar,
    nameserverConfigured,
    nameserverPending,
}: DomainActionsProps) {
    const router = useRouter();
    const [deploying, setDeploying] = useState(false);
    const [fixingDns, setFixingDns] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const normalizedRegistrar = (registrar || '').trim().toLowerCase();
    const canAutomateNameserverCutover = AUTOMATED_NAMESERVER_REGISTRARS.has(normalizedRegistrar);

    const handleDeploy = async () => {
        setDeploying(true);
        try {
            const res = await fetch(`/api/domains/${domainId}/deploy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    triggerBuild: true,
                    addCustomDomain: true,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Deploy failed');
            }

            const warnings = Array.isArray(data.preflightWarnings)
                ? (data.preflightWarnings as PreflightIssue[]).filter((issue) => issue.severity === 'warning')
                : [];
            if (warnings.length > 0) {
                toast.warning(`Deploy queued with ${warnings.length} warning(s) for ${domainName}`);
            } else {
                toast.success(`Deploy queued for ${domainName}`);
            }
            router.refresh();
        } catch (err) {
            console.error('Deploy failed:', err);
            toast.error(err instanceof Error ? err.message : 'Deploy failed');
        } finally {
            setDeploying(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        try {
            const res = await fetch(`/api/domains/${domainId}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Delete failed');
            }
            toast.success(`${domainName} deleted`);
            router.refresh();
        } catch (err) {
            console.error('Delete failed:', err);
            toast.error(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setConfirmDelete(false);
        }
    };

    async function runNameserverPreflight(): Promise<NameserverPreflightResponse> {
        const response = await fetch('/api/domains/bulk-nameservers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domainIds: [domainId],
                dryRun: true,
                reason: `One-click DNS cutover preflight from domain actions for ${domainName}`,
            }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.error || body.message || 'Nameserver preflight failed');
        }
        return body as NameserverPreflightResponse;
    }

    async function runNameserverCutover(): Promise<NameserverApplyResponse> {
        const response = await fetch('/api/domains/bulk-nameservers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domainIds: [domainId],
                reason: `One-click DNS cutover from domain actions for ${domainName}`,
            }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.error || body.message || 'Nameserver cutover failed');
        }
        return body as NameserverApplyResponse;
    }

    async function runCloudflareZoneCreate(): Promise<CloudflareZoneCreateResponse> {
        const response = await fetch('/api/domains/bulk-cloudflare-zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domainIds: [domainId],
                jumpStart: false,
            }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.error || body.message || 'Cloudflare zone creation failed');
        }
        return body as CloudflareZoneCreateResponse;
    }

    const handleFixDns = async () => {
        if (!canAutomateNameserverCutover) {
            toast.error('Automated DNS cutover is currently supported for GoDaddy and Namecheap only.');
            return;
        }

        setFixingDns(true);
        let errorToastShown = false;
        try {
            let preflight = await runNameserverPreflight();
            const missingZone = (preflight.failures || []).some((failure) => isMissingCloudflareZoneFailure(failure));

            if ((preflight.readyCount ?? 0) === 0 && missingZone) {
                const zoneCreate = await runCloudflareZoneCreate();
                if ((zoneCreate.failedCount ?? 0) > 0) {
                    throw new Error(zoneCreate.failed?.[0]?.error || 'Failed to create Cloudflare zone');
                }
                preflight = await runNameserverPreflight();
            }

            if ((preflight.readyCount ?? 0) === 0) {
                const failureMessage = preflight.failures?.[0]?.error;
                const skipMessage = preflight.skipped?.[0]?.reason;
                throw new Error(failureMessage || skipMessage || 'Domain is not ready for nameserver cutover');
            }

            const result = await runNameserverCutover();
            const successCount = result.successCount ?? 0;
            const failedCount = result.failedCount ?? 0;
            const skippedCount = result.skippedCount ?? 0;
            const firstFailure = result.failures?.[0]?.error;
            const firstSkip = result.skipped?.[0]?.reason;

            if (successCount === 0) {
                const errorMessage = firstFailure || 'No DNS updates were applied.';
                toast.error(errorMessage);
                errorToastShown = true;
                throw new Error(errorMessage);
            }

            if (failedCount > 0 || skippedCount > 0) {
                toast.warning(firstFailure || firstSkip || `DNS cutover completed with issues for ${domainName}.`);
            } else {
                toast.success(`DNS cutover applied for ${domainName}.`);
            }

            router.refresh();
        } catch (error) {
            console.error('DNS fix failed:', error);
            if (!errorToastShown) {
                toast.error(error instanceof Error ? error.message : 'DNS fix failed');
            }
        } finally {
            setFixingDns(false);
        }
    };

    const dnsLabel = nameserverConfigured && !nameserverPending
        ? 'Re-check DNS/Cutover'
        : nameserverPending
            ? 'Complete DNS Cutover'
            : 'Fix DNS to Cloudflare';

    return (
        <DropdownMenu onOpenChange={(open) => { if (!open) setConfirmDelete(false); }}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${domainName}`}>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>{domainName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push(`/dashboard/domains/${domainId}`)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                </DropdownMenuItem>
                {isDeployed && (
                    <DropdownMenuItem onSelect={() => window.open(`https://${domainName}`, '_blank')}>
                        <Globe className="mr-2 h-4 w-4" />
                        Visit Site
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem
                    onSelect={handleDeploy}
                    disabled={deploying}
                >
                    <Rocket className="mr-2 h-4 w-4" />
                    {deploying ? 'Deploying...' : isDeployed ? 'Redeploy' : 'Deploy'}
                </DropdownMenuItem>
                {canAutomateNameserverCutover && (
                    <DropdownMenuItem
                        onSelect={handleFixDns}
                        disabled={fixingDns}
                    >
                        <Waypoints className="mr-2 h-4 w-4" />
                        {fixingDns ? 'Fixing DNS...' : dnsLabel}
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onSelect={handleDelete}
                    className={cn(
                        'text-destructive focus:text-destructive',
                        confirmDelete && 'bg-destructive/10 font-semibold'
                    )}
                >
                    {confirmDelete ? (
                        <><AlertTriangle className="mr-2 h-4 w-4" />Confirm Delete?</>
                    ) : (
                        <><Trash2 className="mr-2 h-4 w-4" />Delete</>
                    )}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
