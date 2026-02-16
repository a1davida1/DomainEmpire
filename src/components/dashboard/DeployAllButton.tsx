'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Rocket, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const BATCH_SIZE = 50; // API limit per request

type BulkDeployResponse = {
    dryRun?: boolean;
    requested?: number;
    queueable?: number;
    queued?: number;
    blocked?: number;
    blockedDomains?: Array<{
        domain: string;
        issues?: Array<{ message: string }>;
    }>;
    preflightWarnings?: Array<{
        domain: string;
        issues?: Array<{ message: string }>;
    }>;
};

export function DeployAllButton({ domainIds }: Readonly<{ domainIds: string[] }>) {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const router = useRouter();

    async function deployBatch(
        batch: string[],
        batchNum: number,
        totalBatches: number,
        dryRun: boolean
    ): Promise<{
        requested: number;
        queueable: number;
        queued: number;
        blocked: number;
        blockedDomains: string[];
        warningDomains: string[];
    }> {
        const res = await fetch('/api/domains/bulk-deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domainIds: batch,
                triggerBuild: true,
                dryRun,
            }),
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Batch ${batchNum}/${totalBatches} failed`);
        }

        const data = await res.json() as BulkDeployResponse;
        const blockedDomains = Array.isArray(data.blockedDomains)
            ? data.blockedDomains.map((entry) => entry.domain).filter(Boolean)
            : [];
        const warningDomains = Array.isArray(data.preflightWarnings)
            ? data.preflightWarnings.map((entry) => entry.domain).filter(Boolean)
            : [];
        return {
            requested: typeof data.requested === 'number' ? data.requested : batch.length,
            queueable: typeof data.queueable === 'number' ? data.queueable : 0,
            queued: data.queued || 0,
            blocked: data.blocked || 0,
            blockedDomains,
            warningDomains,
        };
    }

    async function handleDeploy() {
        const count = domainIds.length;
        if (count === 0) return;

        // Split into batches of BATCH_SIZE
        const batches: string[][] = [];
        for (let i = 0; i < domainIds.length; i += BATCH_SIZE) {
            batches.push(domainIds.slice(i, i + BATCH_SIZE));
        }

        setLoading(true);
        let preflightRequested = 0;
        let preflightQueueable = 0;
        let preflightBlocked = 0;
        const preflightBlockedDomainNames: string[] = [];
        const preflightWarningDomains = new Set<string>();

        try {
            for (let i = 0; i < batches.length; i++) {
                setProgress(`Running preflight ${i + 1}/${batches.length}...`);
                const result = await deployBatch(batches[i], i + 1, batches.length, true);
                preflightRequested += result.requested;
                preflightQueueable += result.queueable;
                preflightBlocked += result.blocked;
                preflightBlockedDomainNames.push(...result.blockedDomains);
                for (const domainName of result.warningDomains) {
                    preflightWarningDomains.add(domainName);
                }
            }
        } catch (error) {
            setProgress('');
            const message = error instanceof Error ? error.message : 'Unknown error';
            alert(`❌ Deploy preflight failed: ${message}`);
            setLoading(false);
            return;
        }

        setLoading(false);
        setProgress('');

        if (preflightQueueable === 0) {
            const blockedPreview = preflightBlockedDomainNames.slice(0, 5).join('\n');
            alert(
                `⚠️ Deploy preflight blocked all ${preflightRequested} domain${preflightRequested !== 1 ? 's' : ''}.` +
                `${blockedPreview ? `\n\nBlocked domains:\n${blockedPreview}${preflightBlockedDomainNames.length > 5 ? '\n...' : ''}` : ''}`
            );
            return;
        }

        const warningCount = preflightWarningDomains.size;
        const proceed = confirm(
            `Preflight summary:\n` +
            `• Requested: ${preflightRequested}\n` +
            `• Queueable: ${preflightQueueable}\n` +
            `• Blocked: ${preflightBlocked}\n` +
            `• Warnings: ${warningCount}\n\n` +
            `Queue deploy jobs for ${preflightQueueable} domain${preflightQueueable !== 1 ? 's' : ''} now?\n\n` +
            `Queue processing will continue automatically when the server worker is enabled.`
        );

        if (!proceed) {
            return;
        }

        setLoading(true);
        let totalQueued = 0;
        let totalBlocked = 0;
        const blockedDomainNames: string[] = [];
        const warningDomainNames = new Set<string>();

        try {
            for (let i = 0; i < batches.length; i++) {
                setProgress(`Queuing batch ${i + 1}/${batches.length}...`);
                const result = await deployBatch(batches[i], i + 1, batches.length, false);
                totalQueued += result.queued;
                totalBlocked += result.blocked;
                blockedDomainNames.push(...result.blockedDomains);
                for (const domainName of result.warningDomains) {
                    warningDomainNames.add(domainName);
                }
            }

            setProgress('');
            const blockedPreview = blockedDomainNames.slice(0, 5).join('\n');
            const queuedWarningCount = warningDomainNames.size;
            alert(
                `✅ ${totalQueued} deployment jobs queued.` +
                `${totalBlocked > 0 ? `\n⚠️ ${totalBlocked} blocked by preflight.` : ''}` +
                `${queuedWarningCount > 0 ? `\n⚠️ ${queuedWarningCount} domains queued with warnings.` : ''}` +
                `${blockedPreview ? `\n\nBlocked domains:\n${blockedPreview}${blockedDomainNames.length > 5 ? '\n...' : ''}` : ''}`
            );
            router.refresh();
        } catch (error) {
            setProgress('');
            const message = error instanceof Error ? error.message : 'Unknown error';
            alert(`❌ Deployment failed: ${message}\n\n${totalQueued} jobs were queued before the error.`);
        } finally {
            setLoading(false);
        }
    }

    if (domainIds.length === 0) return null;

    return (
        <Button onClick={handleDeploy} disabled={loading} variant="default">
            {loading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {progress || 'Starting...'}
                </>
            ) : (
                <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Deploy All ({domainIds.length})
                </>
            )}
        </Button>
    );
}
