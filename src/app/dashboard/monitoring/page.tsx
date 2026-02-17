import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, Bell, CheckCircle2, Eye } from 'lucide-react';
import Link from 'next/link';
import { db, notifications } from '@/lib/db';
import { inArray, desc } from 'drizzle-orm';
import { DataLoadError } from '@/components/dashboard/DataLoadError';

export const dynamic = 'force-dynamic';

const MONITORING_TYPES = ['traffic_drop', 'deploy_failed', 'backlink_lost', 'revenue_milestone', 'search_quality'] as const;

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'destructive',
    warning: 'secondary',
    info: 'outline',
};

type MonitoringAlert = typeof notifications.$inferSelect;

async function getMonitoringAlerts(): Promise<{ data: MonitoringAlert[]; error: string | null }> {
    try {
        const data = await db
            .select()
            .from(notifications)
            .where(inArray(notifications.type, [...MONITORING_TYPES]))
            .orderBy(desc(notifications.createdAt))
            .limit(100);
        return { data, error: null };
    } catch (err) {
        console.error('[Monitoring] Failed to load alerts:', err);
        return { data: [], error: err instanceof Error ? err.message : 'Failed to load monitoring alerts' };
    }
}

export default async function MonitoringPage() {
    const { data: alerts, error: alertsError } = await getMonitoringAlerts();

    const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.isRead).length;
    const warningCount = alerts.filter(a => a.severity === 'warning' && !a.isRead).length;

    const infoCount = alerts.filter(a => a.severity === 'info' && !a.isRead).length;

    return (
        <div className="space-y-6">
            {alertsError && <DataLoadError message="Failed to load monitoring alerts" detail={alertsError} />}
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950">
                        <Eye className="h-5 w-5 text-orange-700 dark:text-orange-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Monitoring</h1>
                        <p className="text-sm text-muted-foreground">Automated health checks and alerts</p>
                    </div>
                </div>
            </div>

            {/* Summary */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <Bell className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold tabular-nums">{alerts.length}</p>
                                <p className="text-xs text-muted-foreground">Total Alerts</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className={criticalCount > 0 ? 'border-red-200 dark:border-red-900' : ''}>
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${criticalCount > 0 ? 'bg-red-100 dark:bg-red-950' : 'bg-muted'}`}>
                                <AlertTriangle className={`h-4 w-4 ${criticalCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                                <p className={`text-2xl font-bold tabular-nums ${criticalCount > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{criticalCount}</p>
                                <p className="text-xs text-muted-foreground">Critical</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className={warningCount > 0 ? 'border-amber-200 dark:border-amber-900' : ''}>
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${warningCount > 0 ? 'bg-amber-100 dark:bg-amber-950' : 'bg-muted'}`}>
                                <AlertTriangle className={`h-4 w-4 ${warningCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`} />
                            </div>
                            <div>
                                <p className={`text-2xl font-bold tabular-nums ${warningCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{warningCount}</p>
                                <p className="text-xs text-muted-foreground">Warnings</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <Activity className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold tabular-nums">{infoCount}</p>
                                <p className="text-xs text-muted-foreground">Info</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Alerts list */}
            <Card className="overflow-hidden">
                <CardHeader className="border-b bg-muted/20 py-3">
                    <CardTitle className="text-base">Recent Alerts</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {alerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                                <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
                            </div>
                            <p className="text-base font-medium mb-1">All clear</p>
                            <p className="text-sm text-muted-foreground max-w-sm">
                                No monitoring alerts. Health checks run automatically every hour.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {alerts.map(alert => (
                                <Link
                                    key={alert.id}
                                    href={alert.actionUrl || '#'}
                                    className={`flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-accent/50 ${
                                        !alert.isRead ? 'bg-primary/[0.03] dark:bg-primary/[0.06]' : ''
                                    }`}
                                >
                                    {!alert.isRead && (
                                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <Badge variant={SEVERITY_COLORS[alert.severity] as 'destructive' | 'secondary' | 'outline' || 'secondary'}>
                                                {alert.severity}
                                            </Badge>
                                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                                {alert.type.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="font-medium text-sm">{alert.title}</p>
                                        {alert.message && (
                                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap tabular-nums mt-1">
                                        {alert.createdAt ? new Date(alert.createdAt).toLocaleString('en-US', {
                                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                        }) : ''}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
