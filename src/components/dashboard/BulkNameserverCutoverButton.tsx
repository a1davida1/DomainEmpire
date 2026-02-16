'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Waypoints } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const BATCH_SIZE = 50;

type BulkNameserverCutoverButtonProps = {
    domainIds: string[];
};

type NameserverFailure = {
    domainId?: string;
    domain: string;
    error: string;
    code?: string;
};

type BatchResult = {
    readyCount: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    ready: Array<{ domainId?: string; domain: string; nameservers: string[] }>;
    failures: NameserverFailure[];
    skipped: Array<{ domain: string; reason: string }>;
};

type ZoneCreateBatchResult = {
    createdCount: number;
    existingCount: number;
    failedCount: number;
    created: Array<{ domainId?: string; domain: string; nameservers?: string[] }>;
    existing: Array<{ domainId?: string; domain: string; nameservers?: string[] }>;
    failed: Array<{ domain: string; error: string }>;
};

type PreflightAggregate = {
    ready: number;
    failed: number;
    skipped: number;
    failures: NameserverFailure[];
    skips: Array<{ domain: string; reason: string }>;
    readyPreview: Array<{ domainId?: string; domain: string; nameservers: string[] }>;
    perDomainNameservers: Record<string, string[]>;
};

export function BulkNameserverCutoverButton({ domainIds }: Readonly<BulkNameserverCutoverButtonProps>) {
    const [preflighting, setPreflighting] = useState(false);
    const [creatingZones, setCreatingZones] = useState(false);
    const [applyingCutover, setApplyingCutover] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [preflight, setPreflight] = useState<PreflightAggregate | null>(null);
    const [nameserverOverrides, setNameserverOverrides] = useState<Record<string, string[]>>({});
    const [missingZoneDomainIds, setMissingZoneDomainIds] = useState<string[]>([]);
    const [zoneCreateSummary, setZoneCreateSummary] = useState<{
        created: number;
        existing: number;
        failed: number;
        failedRows: Array<{ domain: string; error: string }>;
    } | null>(null);
    const [cutoverSummary, setCutoverSummary] = useState<{
        success: number;
        failed: number;
        skipped: number;
        failures: Array<{ domain: string; error: string }>;
        batchErrors: string[];
    } | null>(null);
    const router = useRouter();
    const loading = preflighting || creatingZones || applyingCutover;

    function chunkIds(ids: string[]): string[][] {
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            chunks.push(ids.slice(i, i + BATCH_SIZE));
        }
        return chunks;
    }

    function isMissingCloudflareZoneFailure(failure: NameserverFailure): boolean {
        if (failure.code === 'missing_cloudflare_zone') {
            return true;
        }

        return failure.error.includes('Unable to resolve Cloudflare nameservers');
    }

    function collectMissingZoneDomainIds(input: PreflightAggregate): string[] {
        return [...new Set(
            input.failures
                .filter((failure) => isMissingCloudflareZoneFailure(failure))
                .map((failure) => failure.domainId)
                .filter((value): value is string => typeof value === 'string' && value.length > 0),
        )];
    }

    async function runBatch(
        batch: string[],
        batchNum: number,
        totalBatches: number,
        dryRun: boolean,
        perDomainNameserverOverrides?: Record<string, string[]>,
    ): Promise<BatchResult> {
        const perDomainNameservers = perDomainNameserverOverrides
            ? Object.fromEntries(
                batch
                    .map((domainId) => [domainId, perDomainNameserverOverrides[domainId]] as const)
                    .filter((entry): entry is readonly [string, string[]] => Array.isArray(entry[1]) && entry[1].length >= 2),
            )
            : {};

        const response = await fetch('/api/domains/bulk-nameservers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domainIds: batch,
                dryRun,
                reason: `Bulk nameserver cutover batch ${batchNum}/${totalBatches} from domains dashboard`,
                ...(Object.keys(perDomainNameservers).length > 0 ? { perDomainNameservers } : {}),
            }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.error || body.message || `Batch ${batchNum}/${totalBatches} failed`);
        }

        return {
            readyCount: typeof body.readyCount === 'number' ? body.readyCount : 0,
            successCount: typeof body.successCount === 'number' ? body.successCount : 0,
            failedCount: typeof body.failedCount === 'number' ? body.failedCount : 0,
            skippedCount: typeof body.skippedCount === 'number' ? body.skippedCount : 0,
            ready: Array.isArray(body.ready) ? body.ready : [],
            failures: Array.isArray(body.failures) ? body.failures : [],
            skipped: Array.isArray(body.skipped) ? body.skipped : [],
        };
    }

    async function runZoneCreateBatch(
        batch: string[],
        batchNum: number,
        totalBatches: number,
    ): Promise<ZoneCreateBatchResult> {
        const response = await fetch('/api/domains/bulk-cloudflare-zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domainIds: batch,
                jumpStart: false,
            }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.error || body.message || `Zone creation batch ${batchNum}/${totalBatches} failed`);
        }

        return {
            createdCount: typeof body.createdCount === 'number' ? body.createdCount : 0,
            existingCount: typeof body.existingCount === 'number' ? body.existingCount : 0,
            failedCount: typeof body.failedCount === 'number' ? body.failedCount : 0,
            created: Array.isArray(body.created) ? body.created : [],
            existing: Array.isArray(body.existing) ? body.existing : [],
            failed: Array.isArray(body.failed) ? body.failed : [],
        };
    }

    async function runPreflightAcrossBatches(
        batches: string[][],
        labelPrefix: string,
        perDomainNameserverOverrides?: Record<string, string[]>,
    ): Promise<PreflightAggregate> {
        let ready = 0;
        let failed = 0;
        let skipped = 0;
        const failures: NameserverFailure[] = [];
        const skips: Array<{ domain: string; reason: string }> = [];
        const readyPreview: Array<{ domainId?: string; domain: string; nameservers: string[] }> = [];
        const resolvedPerDomainNameservers: Record<string, string[]> = {
            ...(perDomainNameserverOverrides || {}),
        };

        for (let i = 0; i < batches.length; i++) {
            setProgress(`${labelPrefix} batch ${i + 1}/${batches.length}...`);
            const result = await runBatch(
                batches[i],
                i + 1,
                batches.length,
                true,
                resolvedPerDomainNameservers,
            );
            ready += result.readyCount;
            failed += result.failedCount;
            skipped += result.skippedCount;
            failures.push(...result.failures);
            skips.push(...result.skipped);
            readyPreview.push(...result.ready.map((entry) => ({
                domainId: entry.domainId,
                domain: entry.domain,
                nameservers: entry.nameservers,
            })));
            for (const entry of result.ready) {
                if (!entry.domainId) continue;
                if (!Array.isArray(entry.nameservers) || entry.nameservers.length < 2) continue;
                resolvedPerDomainNameservers[entry.domainId] = entry.nameservers;
            }
        }

        return {
            ready,
            failed,
            skipped,
            failures,
            skips,
            readyPreview,
            perDomainNameservers: resolvedPerDomainNameservers,
        };
    }

    function clearWorkflowState() {
        setProgress('');
        setError(null);
        setPreflight(null);
        setMissingZoneDomainIds([]);
        setNameserverOverrides({});
        setZoneCreateSummary(null);
        setCutoverSummary(null);
    }

    async function runPreflight(
        labelPrefix: string,
        initialOverrides?: Record<string, string[]>,
    ): Promise<PreflightAggregate | null> {
        if (domainIds.length === 0) return null;

        const batches = chunkIds(domainIds);
        setError(null);
        setProgress('');
        try {
            const result = await runPreflightAcrossBatches(
                batches,
                labelPrefix,
                initialOverrides,
            );
            const missing = collectMissingZoneDomainIds(result);
            setPreflight(result);
            setNameserverOverrides(result.perDomainNameservers);
            setMissingZoneDomainIds(missing);
            setProgress('');

            if (result.ready > 0) {
                toast.success(`Preflight complete: ${result.ready} ready, ${result.failed} blocked, ${result.skipped} skipped.`);
            } else {
                toast.warning(`No domains are ready yet (${result.failed} blocked, ${result.skipped} skipped).`);
            }
            if (missing.length > 0) {
                toast.warning(`${missing.length} domain${missing.length === 1 ? '' : 's'} need Cloudflare zones before cutover.`);
            }
            return result;
        } catch (runError) {
            const message = runError instanceof Error ? runError.message : 'Bulk nameserver preflight failed';
            setError(message);
            setProgress('');
            toast.error(message);
            return null;
        }
    }

    async function createMissingZonesAndRecheck(
        domainIdsMissingZone: string[],
        baseOverrides: Record<string, string[]>,
    ): Promise<PreflightAggregate | null> {
        if (domainIdsMissingZone.length === 0) return null;
        setError(null);
        setProgress('');

        const zoneBatches = chunkIds(domainIdsMissingZone);
        let created = 0;
        let existing = 0;
        let failed = 0;
        const failedRows: Array<{ domain: string; error: string }> = [];
        const createdNameserverOverrides: Record<string, string[]> = {};

        try {
            for (let i = 0; i < zoneBatches.length; i++) {
                setProgress(`Creating Cloudflare zones batch ${i + 1}/${zoneBatches.length}...`);
                const result = await runZoneCreateBatch(zoneBatches[i], i + 1, zoneBatches.length);
                created += result.createdCount;
                existing += result.existingCount;
                failed += result.failedCount;
                failedRows.push(...result.failed);
                for (const row of [...result.created, ...result.existing]) {
                    if (!row.domainId || !Array.isArray(row.nameservers) || row.nameservers.length < 2) continue;
                    createdNameserverOverrides[row.domainId] = row.nameservers;
                }
            }

            const mergedOverrides = {
                ...baseOverrides,
                ...createdNameserverOverrides,
            };
            setNameserverOverrides(mergedOverrides);
            setZoneCreateSummary({
                created,
                existing,
                failed,
                failedRows,
            });
            toast.success(`Zone creation complete: ${created} created, ${existing} existing, ${failed} failed.`);
            return await runPreflight('Preflight re-check', mergedOverrides);
        } catch (zoneError) {
            const message = zoneError instanceof Error ? zoneError.message : 'Bulk zone creation failed';
            setError(message);
            toast.error(message);
            return null;
        } finally {
            setProgress('');
        }
    }

    async function applyCutoverForPreflight(
        preflightInput: PreflightAggregate,
        overrides: Record<string, string[]>,
    ) {
        const readyDomainIds = [...new Set(
            preflightInput.readyPreview
                .map((entry) => entry.domainId)
                .filter((value): value is string => typeof value === 'string' && value.length > 0),
        )];
        if (readyDomainIds.length === 0) {
            setError('No ready domains with resolved nameservers were found in preflight.');
            return;
        }

        const batches = chunkIds(readyDomainIds);
        setApplyingCutover(true);
        setError(null);
        setProgress('');
        let totalSuccess = 0;
        let totalFailed = 0;
        let totalSkipped = 0;
        const failureDetails: Array<{ domain: string; error: string }> = [];
        const batchErrors: string[] = [];

        try {
            for (let i = 0; i < batches.length; i++) {
                setProgress(`Switching nameservers batch ${i + 1}/${batches.length}...`);
                try {
                    const result = await runBatch(
                        batches[i],
                        i + 1,
                        batches.length,
                        false,
                        overrides,
                    );
                    totalSuccess += result.successCount;
                    totalFailed += result.failedCount;
                    totalSkipped += result.skippedCount;
                    failureDetails.push(...result.failures);
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown batch error';
                    batchErrors.push(`Batch ${i + 1}/${batches.length}: ${message}`);
                    totalFailed += batches[i].length;
                    failureDetails.push(...batches[i].map((domainId) => ({
                        domain: domainId,
                        error: `Batch ${i + 1}/${batches.length} failed before per-domain response was returned`,
                    })));
                }
            }

            setCutoverSummary({
                success: totalSuccess,
                failed: totalFailed,
                skipped: totalSkipped,
                failures: failureDetails,
                batchErrors,
            });
            setProgress('');
            if (totalFailed > 0) {
                toast.warning(`Cutover finished with issues: ${totalSuccess} success, ${totalFailed} failed, ${totalSkipped} skipped.`);
            } else {
                toast.success(`Cutover complete: ${totalSuccess} success, ${totalSkipped} skipped.`);
            }
            router.refresh();
        } catch (runError) {
            setProgress('');
            const message = runError instanceof Error ? runError.message : 'Bulk nameserver cutover failed';
            setError(message);
            toast.error(message);
        }
    }

    async function handleStartWorkflow() {
        clearWorkflowState();
        setPreflighting(true);

        try {
            let activePreflight = await runPreflight('Preflight');
            if (!activePreflight) return;

            const initialMissing = collectMissingZoneDomainIds(activePreflight);
            if (initialMissing.length > 0) {
                setCreatingZones(true);
                const rechecked = await createMissingZonesAndRecheck(
                    initialMissing,
                    activePreflight.perDomainNameservers,
                );
                setCreatingZones(false);
                if (rechecked) {
                    activePreflight = rechecked;
                }
            }

            if (activePreflight.ready > 0) {
                setApplyingCutover(true);
                await applyCutoverForPreflight(
                    activePreflight,
                    activePreflight.perDomainNameservers,
                );
                setApplyingCutover(false);
            }
        } finally {
            setPreflighting(false);
            setCreatingZones(false);
            setApplyingCutover(false);
        }
    }

    async function handleCreateMissingZones() {
        if (missingZoneDomainIds.length === 0) return;
        setCreatingZones(true);
        await createMissingZonesAndRecheck(missingZoneDomainIds, nameserverOverrides);
        setCreatingZones(false);
    }

    async function handleApplyCutover() {
        if (!preflight) return;
        setApplyingCutover(true);
        await applyCutoverForPreflight(preflight, nameserverOverrides);
        setApplyingCutover(false);
    }

    if (domainIds.length === 0) return null;

    return (
        <div className="space-y-2">
            <Button onClick={handleStartWorkflow} disabled={loading} variant="outline">
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {progress || 'Starting...'}
                    </>
                ) : (
                    <>
                        <Waypoints className="mr-2 h-4 w-4" />
                        Auto NS to CF ({domainIds.length})
                    </>
                )}
            </Button>

            {(error || preflight || zoneCreateSummary || cutoverSummary || progress) && (
                <div className="max-w-[34rem] rounded-md border bg-background p-3 text-xs space-y-2">
                    {progress && <p className="text-muted-foreground">{progress}</p>}
                    {error && <p className="text-red-600">{error}</p>}

                    {preflight && (
                        <div className="space-y-1">
                            <p className="font-medium">Preflight</p>
                            <p>
                                Ready: {preflight.ready} | Failed: {preflight.failed} | Skipped: {preflight.skipped}
                            </p>
                            {missingZoneDomainIds.length > 0 && (
                                <p className="text-amber-700">
                                    Missing Cloudflare zone: {missingZoneDomainIds.length}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {missingZoneDomainIds.length > 0 && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={handleCreateMissingZones}
                                        disabled={loading}
                                    >
                                        Create Missing Zones + Re-check
                                    </Button>
                                )}
                                {preflight.ready > 0 && (
                                    <Button size="sm" onClick={handleApplyCutover} disabled={loading}>
                                        Apply Cutover ({preflight.ready} ready)
                                    </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={handleStartWorkflow} disabled={loading}>
                                    Re-run Preflight
                                </Button>
                                <Button size="sm" variant="ghost" onClick={clearWorkflowState} disabled={loading}>
                                    Clear
                                </Button>
                            </div>
                            {(preflight.failures.length > 0 || preflight.skips.length > 0) && (
                                <details className="rounded border bg-muted/30 p-2">
                                    <summary className="cursor-pointer">Show blocked/skipped examples</summary>
                                    <div className="mt-2 space-y-1">
                                        {preflight.failures.slice(0, 6).map((failure, idx) => (
                                            <p key={`${failure.domain}-${idx}`} className="text-red-700">
                                                {failure.domain}: {failure.error}
                                            </p>
                                        ))}
                                        {preflight.skips.slice(0, 4).map((skip, idx) => (
                                            <p key={`${skip.domain}-${idx}`} className="text-muted-foreground">
                                                {skip.domain}: {skip.reason}
                                            </p>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    )}

                    {zoneCreateSummary && (
                        <div className="space-y-1">
                            <p className="font-medium">Zone Creation</p>
                            <p>
                                Created: {zoneCreateSummary.created} | Existing: {zoneCreateSummary.existing} | Failed: {zoneCreateSummary.failed}
                            </p>
                            {zoneCreateSummary.failedRows.length > 0 && (
                                <details className="rounded border bg-muted/30 p-2">
                                    <summary className="cursor-pointer">Show zone creation failures</summary>
                                    <div className="mt-2 space-y-1">
                                        {zoneCreateSummary.failedRows.slice(0, 6).map((row, idx) => (
                                            <p key={`${row.domain}-${idx}`} className="text-red-700">
                                                {row.domain}: {row.error}
                                            </p>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    )}

                    {cutoverSummary && (
                        <div className="space-y-1">
                            <p className="font-medium">Cutover Result</p>
                            <p>
                                Success: {cutoverSummary.success} | Failed: {cutoverSummary.failed} | Skipped: {cutoverSummary.skipped}
                            </p>
                            {(cutoverSummary.batchErrors.length > 0 || cutoverSummary.failures.length > 0) && (
                                <details className="rounded border bg-muted/30 p-2">
                                    <summary className="cursor-pointer">Show cutover errors</summary>
                                    <div className="mt-2 space-y-1">
                                        {cutoverSummary.batchErrors.slice(0, 4).map((batchError, idx) => (
                                            <p key={`batch-error-${idx}`} className="text-red-700">
                                                {batchError}
                                            </p>
                                        ))}
                                        {cutoverSummary.failures.slice(0, 6).map((failure, idx) => (
                                            <p key={`cutover-failure-${failure.domain}-${idx}`} className="text-red-700">
                                                {failure.domain}: {failure.error}
                                            </p>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
