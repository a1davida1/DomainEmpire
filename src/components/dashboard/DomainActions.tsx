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
import { MoreHorizontal, Settings, Rocket, Globe, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DomainActionsProps {
    domainId: string;
    domainName: string;
    isDeployed: boolean;
}

type PreflightIssue = {
    code: string;
    message: string;
    severity: 'blocking' | 'warning';
};

export function DomainActions({ domainId, domainName, isDeployed }: DomainActionsProps) {
    const router = useRouter();
    const [deploying, setDeploying] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

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
