'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

type GlobalErrorProps = {
    error: Error & { digest?: string };
    reset: () => void;
};

export default function GlobalError({ error, reset }: Readonly<GlobalErrorProps>) {
    useEffect(() => {
        console.error('Global app error boundary caught an error:', error);
    }, [error]);

    return (
        <html lang="en">
            <body className="min-h-screen bg-background text-foreground">
                <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
                    <h1 className="text-2xl font-semibold">Something went wrong</h1>
                    <p className="text-sm text-muted-foreground">
                        The app hit an unexpected error while rendering this page.
                    </p>
                    {error?.message && (
                        <p className="max-w-xl rounded border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            {error.message}
                        </p>
                    )}
                    {error?.digest && (
                        <p className="text-xs text-muted-foreground">Error digest: {error.digest}</p>
                    )}
                    <div className="flex items-center gap-2">
                        <Button onClick={reset}>Try again</Button>
                        <Button variant="outline" onClick={() => window.location.assign('/dashboard')}>
                            Go to Dashboard
                        </Button>
                    </div>
                </main>
            </body>
        </html>
    );
}
