'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function QuickAddDomainFab() {
    const [open, setOpen] = useState(false);
    const [domain, setDomain] = useState('');
    const [saving, setSaving] = useState(false);
    const router = useRouter();

    async function handleAdd() {
        const trimmed = domain.trim();
        if (!trimmed) return;
        setSaving(true);
        try {
            const res = await fetch('/api/domains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: trimmed }),
            });
            if (res.ok) {
                toast.success(`Added ${trimmed}`);
                setDomain('');
                setOpen(false);
                router.refresh();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || 'Failed to add domain');
            }
        } catch {
            toast.error('Failed to add domain');
        } finally {
            setSaving(false);
        }
    }

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
                aria-label="Quick add domain"
            >
                <Plus className="h-6 w-6" />
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-40 w-72 rounded-lg border bg-card p-4 shadow-xl animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">Quick Add Domain</span>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
                    <X className="h-4 w-4" />
                </button>
            </div>
            <input
                type="text"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="example.com"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring mb-3"
                autoFocus
            />
            <Button onClick={handleAdd} disabled={saving || !domain.trim()} className="w-full" size="sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Domain
            </Button>
        </div>
    );
}
