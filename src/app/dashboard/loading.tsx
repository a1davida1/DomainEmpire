import { MetricCardSkeleton } from '@/components/dashboard/MetricCard';

export default function DashboardLoading() {
    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                    <div className="h-7 w-36 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-52 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
                    <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
                    <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
                </div>
            </div>

            {/* Quick actions bar */}
            <div className="h-11 animate-pulse rounded-lg border bg-muted/30" />

            {/* Metrics grid */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton />
                <MetricCardSkeleton className="col-span-2 lg:col-span-4 h-auto" />
            </div>

            {/* Weekly target bar */}
            <div className="h-16 animate-pulse rounded-lg border bg-muted/30" />

            {/* Velocity cards */}
            <div className="grid gap-4 md:grid-cols-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/30" />
                ))}
            </div>

            {/* Two column */}
            <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-64 animate-pulse rounded-lg border bg-muted/30" />
                <div className="h-64 animate-pulse rounded-lg border bg-muted/30" />
            </div>
        </div>
    );
}
