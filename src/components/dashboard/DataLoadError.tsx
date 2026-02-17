import { AlertTriangle } from 'lucide-react';

/**
 * Server-component-safe inline error alert for failed data loads.
 * Use this instead of silently returning [] from catch blocks.
 */
export function DataLoadError({ message, detail }: { message: string; detail?: string }) {
    return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-medium text-destructive">{message}</p>
                    {detail && (
                        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                        Try refreshing the page. If the problem persists, check the server logs.
                    </p>
                </div>
            </div>
        </div>
    );
}
