'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Waypoints } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const router = useRouter();

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

    async function handleBulkCutover() {
        const count = domainIds.length;
        if (count === 0) return;

        const batches = chunkIds(domainIds);
        setLoading(true);
        let nameserverOverrides: Record<string, string[]> = {};
        let preflight: PreflightAggregate;

        try {
            preflight = await runPreflightAcrossBatches(batches, 'Preflight');
            nameserverOverrides = preflight.perDomainNameservers;
        } catch (error) {
            setProgress('');
            setLoading(false);
            alert(error instanceof Error ? error.message : 'Bulk nameserver preflight failed');
            return;
        }

        const missingZoneFailures = preflight.failures.filter((failure) =>
            isMissingCloudflareZoneFailure(failure)
            && typeof failure.domainId === 'string'
            && failure.domainId.length > 0
        );

        const missingZoneDomainIds = [...new Set(missingZoneFailures
            .map((failure) => failure.domainId)
            .filter((value): value is string => typeof value === 'string' && value.length > 0))];

        if (missingZoneDomainIds.length > 0) {
            setLoading(false);
            setProgress('');
            const createZones = confirm(
                `${missingZoneDomainIds.length} domain${missingZoneDomainIds.length !== 1 ? 's are' : ' is'} blocked because the Cloudflare zone is missing.\n\n` +
                `Create missing Cloudflare zones in bulk now and re-run preflight?\n\n` +
                `This requires Cloudflare token permission: Zone -> Zone -> Edit.`
            );

            if (createZones) {
                const zoneBatches = chunkIds(missingZoneDomainIds);
                setLoading(true);
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
                } catch (zoneError) {
                    setProgress('');
                    setLoading(false);
                    alert(zoneError instanceof Error ? zoneError.message : 'Bulk zone creation failed');
                    return;
                }

                nameserverOverrides = {
                    ...nameserverOverrides,
                    ...createdNameserverOverrides,
                };

                const failedPreview = failedRows
                    .slice(0, 5)
                    .map((row) => `${row.domain}: ${row.error}`)
                    .join('\n');
                alert(
                    `Cloudflare zone creation complete.\n\n` +
                    `Created: ${created}\nExisting: ${existing}\nFailed: ${failed}` +
                    `${failedPreview ? `\n\nFirst failures:\n${failedPreview}` : ''}`
                );

                try {
                    preflight = await runPreflightAcrossBatches(
                        batches,
                        'Preflight re-check',
                        nameserverOverrides,
                    );
                    nameserverOverrides = preflight.perDomainNameservers;
                } catch (error) {
                    setProgress('');
                    setLoading(false);
                    alert(error instanceof Error ? error.message : 'Bulk nameserver preflight failed');
                    return;
                }
            }
        }

        const preflightReady = preflight.ready;
        const preflightFailed = preflight.failed;
        const preflightSkipped = preflight.skipped;
        const preflightFailures = preflight.failures;
        const preflightSkips = preflight.skips;
        const preflightReadyPreview = preflight.readyPreview;
        setProgress('');
        setLoading(false);

        if (preflightReady === 0) {
            const failurePreview = preflightFailures
                .slice(0, 5)
                .map((failure) => `${failure.domain}: ${failure.error}`)
                .join('\n');
            alert(
                `⚠️ No domains are ready for automated nameserver cutover.\n\n` +
                `Ready: ${preflightReady}\nFailed: ${preflightFailed}\nSkipped: ${preflightSkipped}` +
                `${failurePreview ? `\n\nFirst failures:\n${failurePreview}` : ''}`
            );
            return;
        }

        const readyPreview = preflightReadyPreview
            .slice(0, 3)
            .map((entry) => `${entry.domain} -> ${entry.nameservers.join(', ')}`)
            .join('\n');
        const failurePreview = preflightFailures
            .slice(0, 3)
            .map((failure) => `${failure.domain}: ${failure.error}`)
            .join('\n');
        const skipPreview = preflightSkips
            .slice(0, 3)
            .map((skip) => `${skip.domain}: ${skip.reason}`)
            .join('\n');
        const proceed = confirm(
            `Preflight summary for ${count} domain${count !== 1 ? 's' : ''}:\n` +
            `Ready: ${preflightReady}\n` +
            `Failed: ${preflightFailed}\n` +
            `Skipped: ${preflightSkipped}\n\n` +
            `Continue and update nameservers at the registrar for ready domains?` +
            `${readyPreview ? `\n\nReady examples:\n${readyPreview}` : ''}` +
            `${failurePreview ? `\n\nBlocked examples:\n${failurePreview}` : ''}` +
            `${skipPreview ? `\n\nSkipped examples:\n${skipPreview}` : ''}`
        );
        if (!proceed) {
            return;
        }

        setLoading(true);
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
                        nameserverOverrides,
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

            setProgress('');

            if (totalFailed > 0) {
                const preview = failureDetails
                    .slice(0, 5)
                    .map((failure) => `${failure.domain}: ${failure.error}`)
                    .join('\n');
                const batchErrorPreview = batchErrors
                    .slice(0, 3)
                    .join('\n');
                alert(
                    `⚠️ Bulk nameserver cutover completed with errors.\n\n` +
                    `Success: ${totalSuccess}\nFailed: ${totalFailed}\nSkipped: ${totalSkipped}\n` +
                    `${batchErrorPreview ? `\n\nBatch errors:\n${batchErrorPreview}` : ''}` +
                    `${preview ? `\n\nFirst failures:\n${preview}` : ''}`
                );
            } else {
                alert(
                    `✅ Bulk nameserver cutover complete.\n\n` +
                    `Success: ${totalSuccess}\nSkipped: ${totalSkipped}`
                );
            }

            router.refresh();
        } catch (error) {
            setProgress('');
            alert(error instanceof Error ? error.message : 'Bulk nameserver cutover failed');
        } finally {
            setLoading(false);
        }
    }

    if (domainIds.length === 0) return null;

    return (
        <Button onClick={handleBulkCutover} disabled={loading} variant="outline">
            {loading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {progress || 'Starting...'}
                </>
            ) : (
                <>
                    <Waypoints className="mr-2 h-4 w-4" />
                    Bulk NS to CF ({domainIds.length})
                </>
            )}
        </Button>
    );
}
