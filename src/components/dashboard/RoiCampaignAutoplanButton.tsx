'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

type RoiCampaignAutoplanButtonProps = {
    limit: number;
    windowDays?: number;
};

type DryRunResponse = {
    dryRun: boolean;
    count: number;
    creatableCount: number;
    blockedCount: number;
    plans: Array<{
        domain: string;
        action: string;
        status: 'creatable' | 'blocked';
        blockedReason?: string | null;
    }>;
};

type ApplyResponse = {
    dryRun: boolean;
    autoLaunch?: boolean;
    attemptedCount: number;
    createdCount: number;
    skippedCount: number;
    launchQueuedCount?: number;
    launchBlockedCount?: number;
    launchReviewTasksCreatedCount?: number;
    launchReviewTasksLinkedCount?: number;
    created: Array<{
        campaignId: string;
        domain: string;
    }>;
    skipped: Array<{
        domain: string;
        reason: string;
    }>;
    launchQueued?: Array<{
        campaignId: string;
        domain: string;
        jobId: string;
    }>;
    launchBlocked?: Array<{
        campaignId: string;
        domain: string;
        reason: string;
        reviewTaskId?: string | null;
        reviewDueAt?: string | null;
        reviewEscalateAt?: string | null;
    }>;
};

export function RoiCampaignAutoplanButton({ limit, windowDays = 30 }: Readonly<RoiCampaignAutoplanButtonProps>) {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState('');
    const router = useRouter();

    async function requestAutoplan(dryRun: boolean, autoLaunch: boolean): Promise<DryRunResponse | ApplyResponse> {
        const response = await fetch('/api/growth/campaigns/auto-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dryRun,
                autoLaunch,
                autoLaunchActions: autoLaunch ? ['scale', 'optimize'] : undefined,
                launchPriority: 3,
                limit,
                windowDays,
                actions: ['scale', 'optimize', 'recover', 'incubate'],
                reason: 'ROI queue auto-plan from domains dashboard',
            }),
        });

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(body.error || body.message || 'ROI auto-plan request failed');
        }

        return body as DryRunResponse | ApplyResponse;
    }

    async function handleAutoplan() {
        setLoading(true);
        setProgress('Running ROI auto-plan preview...');

        let preview: DryRunResponse;
        try {
            preview = await requestAutoplan(true, false) as DryRunResponse;
        } catch (error) {
            setProgress('');
            setLoading(false);
            alert(error instanceof Error ? error.message : 'ROI auto-plan preview failed');
            return;
        }

        if (preview.creatableCount === 0) {
            const blockedPreview = preview.plans
                .filter((plan) => plan.status === 'blocked')
                .slice(0, 5)
                .map((plan) => `${plan.domain}: ${plan.blockedReason || 'Blocked'}`)
                .join('\n');
            setProgress('');
            setLoading(false);
            alert(
                `No campaign drafts are creatable from current ROI priorities.\n\n` +
                `Candidates: ${preview.count}\nBlocked: ${preview.blockedCount}` +
                `${blockedPreview ? `\n\nBlocked examples:\n${blockedPreview}` : ''}`
            );
            return;
        }

        const creatablePreview = preview.plans
            .filter((plan) => plan.status === 'creatable')
            .slice(0, 5)
            .map((plan) => `${plan.domain} (${plan.action})`)
            .join('\n');

        const proceed = confirm(
            `ROI auto-plan preview:\n` +
            `Candidates: ${preview.count}\n` +
            `Creatable: ${preview.creatableCount}\n` +
            `Blocked: ${preview.blockedCount}\n\n` +
            `Create draft campaigns now for creatable items?` +
            `${creatablePreview ? `\n\nExamples:\n${creatablePreview}` : ''}`
        );

        if (!proceed) {
            setProgress('');
            setLoading(false);
            return;
        }

        const autoLaunch = confirm(
            'Attempt auto-launch handoff for newly created drafts?\n\n' +
            'Only campaigns with approved launch review tasks will queue immediately.\n' +
            'If approval is required, pending campaign_launch review tasks will be created/linked instead.'
        );

        setProgress('Creating campaign drafts...');
        try {
            const applied = await requestAutoplan(false, autoLaunch) as ApplyResponse;
            const createdPreview = applied.created
                .slice(0, 5)
                .map((row) => `${row.domain} (${row.campaignId})`)
                .join('\n');
            const launchQueuedCount = typeof applied.launchQueuedCount === 'number'
                ? applied.launchQueuedCount
                : 0;
            const launchBlockedCount = typeof applied.launchBlockedCount === 'number'
                ? applied.launchBlockedCount
                : 0;
            const launchReviewTasksCreatedCount = typeof applied.launchReviewTasksCreatedCount === 'number'
                ? applied.launchReviewTasksCreatedCount
                : 0;
            const launchReviewTasksLinkedCount = typeof applied.launchReviewTasksLinkedCount === 'number'
                ? applied.launchReviewTasksLinkedCount
                : 0;
            const nowMs = Date.now();
            const launchReviewSlaBreachedCount = (applied.launchBlocked || []).filter((row) => {
                if (!row.reviewDueAt) return false;
                const dueAtMs = new Date(row.reviewDueAt).getTime();
                return Number.isFinite(dueAtMs) && dueAtMs < nowMs;
            }).length;
            const launchReviewEscalatedCount = (applied.launchBlocked || []).filter((row) => {
                if (!row.reviewEscalateAt) return false;
                const escalateAtMs = new Date(row.reviewEscalateAt).getTime();
                return Number.isFinite(escalateAtMs) && escalateAtMs < nowMs;
            }).length;
            alert(
                `ROI auto-plan complete.\n\n` +
                `Attempted: ${applied.attemptedCount}\n` +
                `Created: ${applied.createdCount}\n` +
                `Skipped: ${applied.skippedCount}` +
                `${autoLaunch
                    ? `\nLaunch queued: ${launchQueuedCount}\nLaunch blocked: ${launchBlockedCount}\nReview tasks created: ${launchReviewTasksCreatedCount}\nReview tasks linked: ${launchReviewTasksLinkedCount}\nBlocked SLA breached: ${launchReviewSlaBreachedCount}\nBlocked escalated: ${launchReviewEscalatedCount}`
                    : ''}` +
                `${createdPreview ? `\n\nCreated examples:\n${createdPreview}` : ''}`
            );
            router.refresh();
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Failed to create ROI campaign drafts');
        } finally {
            setProgress('');
            setLoading(false);
        }
    }

    return (
        <Button onClick={handleAutoplan} disabled={loading} variant="outline">
            {loading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {progress || 'Starting...'}
                </>
            ) : (
                <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Auto-Plan Campaigns
                </>
            )}
        </Button>
    );
}
