export default function ReviewLoading() {
    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header skeleton */}
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                <div className="space-y-2">
                    <div className="h-6 w-48 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </div>
            </div>

            {/* Summary cards skeleton */}
            <div className="grid gap-4 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-xl border bg-card p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                                <div className="space-y-1.5">
                                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                                </div>
                            </div>
                            <div className="h-8 w-8 animate-pulse rounded bg-muted" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Table skeleton */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                </div>
                <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="border-b bg-muted/40 px-4 py-3">
                        <div className="flex gap-8">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="h-3 w-16 animate-pulse rounded bg-muted" />
                            ))}
                        </div>
                    </div>
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
                            <div className="flex-1 space-y-1.5">
                                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                            </div>
                            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                            <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                            <div className="h-5 w-12 animate-pulse rounded-full bg-muted" />
                            <div className="h-5 w-10 animate-pulse rounded-full bg-muted" />
                            <div className="h-3 w-10 animate-pulse rounded bg-muted" />
                            <div className="flex gap-1.5">
                                <div className="h-7 w-16 animate-pulse rounded-md bg-muted" />
                                <div className="h-7 w-14 animate-pulse rounded-md bg-muted" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
