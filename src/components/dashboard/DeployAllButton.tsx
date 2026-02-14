'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Rocket, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

const BATCH_SIZE = 50; // API limit per request

export function DeployAllButton({ domainIds }: Readonly<{ domainIds: string[] }>) {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const router = useRouter();

    async function deployBatch(batch: string[], batchNum: number, totalBatches: number): Promise<number> {
        const res = await fetch('/api/domains/bulk-deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domainIds: batch,
                triggerBuild: true,
            }),
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Batch ${batchNum}/${totalBatches} failed`);
        }

        const data = await res.json();
        return data.queued || 0;
    }

    async function handleDeploy() {
        const count = domainIds.length;
        if (!confirm(
            `Deploy ${count} domain${count !== 1 ? 's' : ''}?\n\n` +
            `This will:\n` +
            `• Generate static HTML files\n` +
            `• Upload directly to Cloudflare Pages\n` +
            `• Update DNS (if GoDaddy configured)\n\n` +
            `Make sure the worker is running: npm run worker`
        )) {
            return;
        }

        setLoading(true);
        let totalQueued = 0;

        try {
            // Split into batches of BATCH_SIZE
            const batches: string[][] = [];
            for (let i = 0; i < domainIds.length; i += BATCH_SIZE) {
                batches.push(domainIds.slice(i, i + BATCH_SIZE));
            }

            for (let i = 0; i < batches.length; i++) {
                setProgress(`Queuing batch ${i + 1}/${batches.length}...`);
                const queued = await deployBatch(batches[i], i + 1, batches.length);
                totalQueued += queued;
            }

            setProgress('');
            alert(`✅ ${totalQueued} deployment jobs queued!\n\nMake sure the worker is running:\nnpm run worker`);
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
