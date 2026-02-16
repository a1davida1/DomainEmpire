import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    getOperationsSettings,
    normalizeOperationsSettingsInput,
    OPERATIONS_SETTINGS_COOKIES,
} from '@/lib/settings/operations';

async function saveOperationsSettingsAction(formData: FormData) {
    'use server';

    const normalized = normalizeOperationsSettingsInput({
        queueStaleThresholdMinutes: formData.get('queueStaleThresholdMinutes'),
        queuePendingSlaMinutes: formData.get('queuePendingSlaMinutes'),
        queueProcessingSlaMinutes: formData.get('queueProcessingSlaMinutes'),
    });

    const cookieStore = await cookies();
    const cookieOptions = {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
    };

    cookieStore.set(
        OPERATIONS_SETTINGS_COOKIES.queueStaleThresholdMinutes,
        String(normalized.queueStaleThresholdMinutes),
        cookieOptions,
    );
    cookieStore.set(
        OPERATIONS_SETTINGS_COOKIES.queuePendingSlaMinutes,
        String(normalized.queuePendingSlaMinutes),
        cookieOptions,
    );
    cookieStore.set(
        OPERATIONS_SETTINGS_COOKIES.queueProcessingSlaMinutes,
        String(normalized.queueProcessingSlaMinutes),
        cookieOptions,
    );

    revalidatePath('/dashboard/queue');
    revalidatePath('/dashboard/domains');
    revalidatePath('/dashboard/workflow');
    revalidatePath('/dashboard/settings/operations');
}

export default async function OperationsSettingsPage() {
    const settings = await getOperationsSettings();

    return (
        <div className="space-y-6 max-w-3xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Operations Settings</h1>
                    <p className="text-muted-foreground">
                        Queue safety thresholds and SLA targets used by dashboard controls.
                    </p>
                </div>
                <Link href="/dashboard/settings">
                    <Button variant="outline">Back To Settings</Button>
                </Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Queue Controls</CardTitle>
                    <CardDescription>
                        These values control stale-lock recovery and SLA badges in Queue and Domain pages.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={saveOperationsSettingsAction} className="space-y-4">
                        <div className="space-y-1">
                            <label htmlFor="queueStaleThresholdMinutes" className="text-sm font-medium">
                                Stale processing threshold (minutes)
                            </label>
                            <input
                                id="queueStaleThresholdMinutes"
                                name="queueStaleThresholdMinutes"
                                type="number"
                                min={1}
                                max={1440}
                                defaultValue={String(settings.queueStaleThresholdMinutes)}
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Used by “Recover Stale Locks” in `/dashboard/queue`.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label htmlFor="queuePendingSlaMinutes" className="text-sm font-medium">
                                Pending queue SLA target (minutes)
                            </label>
                            <input
                                id="queuePendingSlaMinutes"
                                name="queuePendingSlaMinutes"
                                type="number"
                                min={5}
                                max={10080}
                                defaultValue={String(settings.queuePendingSlaMinutes)}
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="space-y-1">
                            <label htmlFor="queueProcessingSlaMinutes" className="text-sm font-medium">
                                Processing queue SLA target (minutes)
                            </label>
                            <input
                                id="queueProcessingSlaMinutes"
                                name="queueProcessingSlaMinutes"
                                type="number"
                                min={1}
                                max={1440}
                                defaultValue={String(settings.queueProcessingSlaMinutes)}
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                            <Button type="submit">Save Settings</Button>
                            <span className="text-xs text-muted-foreground">
                                Saved per signed-in browser session using secure cookies.
                            </span>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
