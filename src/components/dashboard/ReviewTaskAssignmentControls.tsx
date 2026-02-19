'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Props = {
    taskId: string;
    reviewerId: string | null;
    reviewerName: string | null;
    currentUserId: string;
    currentUserRole: string;
};

export function ReviewTaskAssignmentControls(props: Props) {
    const router = useRouter();
    const [busy, setBusy] = useState<'claim' | 'release' | null>(null);

    const isMine = Boolean(props.reviewerId && props.reviewerId === props.currentUserId);
    const isAssigned = Boolean(props.reviewerId);
    const isAdmin = props.currentUserRole === 'admin';

    async function assign(body: Record<string, unknown>, mode: 'claim' | 'release') {
        setBusy(mode);
        try {
            const res = await fetch(`/api/review/tasks/${props.taskId}/assignment`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to update assignment');
            }

            toast.success(mode === 'claim' ? 'Task claimed' : 'Task released');
            router.refresh();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Assignment failed');
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">Assignment</p>
                    <p className="text-xs font-medium truncate">
                        {!isAssigned ? 'Unassigned' : isMine ? 'Assigned to you' : `Assigned to ${props.reviewerName || 'another reviewer'}`}
                    </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                    {isMine ? 'Mine' : isAssigned ? 'Assigned' : 'Unassigned'}
                </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
                {!isAssigned && (
                    <Button
                        size="sm"
                        onClick={() => assign({ claim: true }, 'claim')}
                        disabled={busy !== null}
                    >
                        Claim
                    </Button>
                )}

                {isMine && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => assign({ release: true }, 'release')}
                        disabled={busy !== null}
                    >
                        Release
                    </Button>
                )}

                {isAssigned && !isMine && isAdmin && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => assign({ claim: true, reason: 'Admin takeover' }, 'claim')}
                        disabled={busy !== null}
                    >
                        Take over
                    </Button>
                )}
            </div>
        </div>
    );
}

