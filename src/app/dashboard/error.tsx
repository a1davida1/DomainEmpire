'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

type DashboardErrorProps = {
    error: Error & { digest?: string };
    reset: () => void;
};

export default function DashboardError({ error, reset }: Readonly<DashboardErrorProps>) {
    useEffect(() => {
        console.error('[Dashboard] Page error:', error);
    }, [error]);

    return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-lg w-full">
                <CardContent className="pt-6 text-center space-y-4">
                    <div className="flex justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <AlertTriangle className="h-6 w-6 text-destructive" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Something went wrong</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            This page encountered an error while loading data.
                        </p>
                    </div>
                    {error?.message && (
                        <p className="rounded border bg-muted/40 px-3 py-2 text-xs text-muted-foreground text-left font-mono">
                            {error.message}
                        </p>
                    )}
                    {error?.digest && (
                        <p className="text-[10px] text-muted-foreground">Digest: {error.digest}</p>
                    )}
                    <div className="flex items-center justify-center gap-2">
                        <Button onClick={reset}>Try Again</Button>
                        <Button variant="outline" onClick={() => window.location.reload()}>
                            Reload Page
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
