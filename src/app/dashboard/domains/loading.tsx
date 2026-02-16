import { DomainsTableSkeleton } from '@/components/dashboard/DomainsTableSkeleton';

export default function DomainsLoading() {
    return (
        <div className="space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div className="h-9 w-48 rounded bg-muted animate-pulse" />
                <div className="flex gap-2">
                    <div className="h-9 w-28 rounded bg-muted animate-pulse" />
                    <div className="h-9 w-28 rounded bg-muted animate-pulse" />
                </div>
            </div>

            {/* Status cards skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-2">
                        <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                        <div className="h-6 w-10 rounded bg-muted animate-pulse" />
                    </div>
                ))}
            </div>

            {/* Table skeleton */}
            <div className="rounded-lg border bg-card">
                <DomainsTableSkeleton />
            </div>
        </div>
    );
}
