import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export function DomainsTableSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <div className="space-y-4">
            {/* Search skeleton */}
            <div className="h-10 rounded-lg bg-muted animate-pulse" />

            {/* Table skeleton */}
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-10"><div className="h-4 w-4 rounded bg-muted animate-pulse" /></TableHead>
                        <TableHead><div className="h-4 w-20 rounded bg-muted animate-pulse" /></TableHead>
                        <TableHead><div className="h-4 w-14 rounded bg-muted animate-pulse" /></TableHead>
                        <TableHead><div className="h-4 w-12 rounded bg-muted animate-pulse" /></TableHead>
                        <TableHead><div className="h-4 w-16 rounded bg-muted animate-pulse" /></TableHead>
                        <TableHead><div className="h-4 w-16 rounded bg-muted animate-pulse" /></TableHead>
                        <TableHead><div className="h-4 w-14 rounded bg-muted animate-pulse" /></TableHead>
                        <TableHead><div className="h-4 w-14 rounded bg-muted animate-pulse" /></TableHead>
                        <TableHead className="w-10" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: rows }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><div className="h-4 w-4 rounded bg-muted animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 w-36 rounded bg-muted animate-pulse" /></TableCell>
                            <TableCell><div className="h-5 w-16 rounded-full bg-muted animate-pulse" /></TableCell>
                            <TableCell><div className="h-5 w-20 rounded-full bg-muted animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 w-20 rounded bg-muted animate-pulse" /></TableCell>
                            <TableCell><div className="h-5 w-16 rounded-full bg-muted animate-pulse" /></TableCell>
                            <TableCell><div className="h-5 w-10 rounded-full bg-muted animate-pulse" /></TableCell>
                            <TableCell><div className="h-4 w-12 rounded bg-muted animate-pulse" /></TableCell>
                            <TableCell><div className="h-6 w-6 rounded bg-muted animate-pulse" /></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {/* Grid skeleton */}
            <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={`grid-${i}`} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
                            <div className="h-5 w-5 rounded bg-muted animate-pulse" />
                        </div>
                        <div className="flex gap-1">
                            <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
                            <div className="h-5 w-10 rounded-full bg-muted animate-pulse" />
                            <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                        </div>
                        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
