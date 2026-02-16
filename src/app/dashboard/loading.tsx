import { MetricCardSkeleton } from '@/components/dashboard/MetricCard';

export default function DashboardLoading() {
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <div className="h-8 w-48 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-9 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="h-64 animate-pulse rounded-lg border bg-muted" />
                <div className="h-64 animate-pulse rounded-lg border bg-muted" />
            </div>
        </div>
    );
}
