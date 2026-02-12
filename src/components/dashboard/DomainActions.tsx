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
import { MoreHorizontal, Settings, Rocket, Globe, Trash2 } from 'lucide-react';

interface DomainActionsProps {
    domainId: string;
    domainName: string;
    isDeployed: boolean;
}

export function DomainActions({ domainId, domainName, isDeployed }: DomainActionsProps) {
    const router = useRouter();
    const [deploying, setDeploying] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const handleDeploy = async () => {
        setDeploying(true);
        try {
            const res = await fetch(`/api/domains/${domainId}/deploy`, { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Deploy failed');
            }
            router.refresh();
        } catch (err) {
            console.error('Deploy failed:', err);
            alert(err instanceof Error ? err.message : 'Deploy failed');
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
            router.refresh();
        } catch (err) {
            console.error('Delete failed:', err);
            alert(err instanceof Error ? err.message : 'Delete failed');
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
                    className="text-destructive focus:text-destructive"
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {confirmDelete ? 'Click again to confirm' : 'Delete'}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
