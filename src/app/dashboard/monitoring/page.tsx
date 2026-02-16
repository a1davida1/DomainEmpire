import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { db, notifications } from '@/lib/db';
import { inArray, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const MONITORING_TYPES = ['traffic_drop', 'deploy_failed', 'backlink_lost', 'revenue_milestone', 'search_quality'] as const;

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'destructive',
    warning: 'secondary',
    info: 'outline',
};

async function getMonitoringAlerts() {
    try {
        return await db
            .select()
            .from(notifications)
            .where(inArray(notifications.type, [...MONITORING_TYPES]))
            .orderBy(desc(notifications.createdAt))
            .limit(100);
    } catch {
        return [];
    }
}

export default async function MonitoringPage() {
    const alerts = await getMonitoringAlerts();

    const criticalCount = alerts.filter(a => a.severity === 'critical' && !a.isRead).length;
    const warningCount = alerts.filter(a => a.severity === 'warning' && !a.isRead).length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Monitoring</h1>
                    <p className="text-muted-foreground">Automated health checks and alerts</p>
                </div>
            </div>

            {/* Summary */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Total Alerts</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold">{alerts.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-sm text-muted-foreground">Critical (unread)</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-red-600">{criticalCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm text-muted-foreground">Warnings (unread)</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-yellow-600">{warningCount}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Alerts list */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Monitoring Alerts</CardTitle>
                </CardHeader>
                <CardContent>
                    {alerts.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No monitoring alerts. Checks run automatically every hour.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {alerts.map(alert => (
                                <Link
                                    key={alert.id}
                                    href={alert.actionUrl || '#'}
                                    className={`flex items-start gap-3 border rounded-lg p-4 transition-colors hover:bg-accent/50 ${
                                        !alert.isRead ? 'border-l-4 border-l-primary' : ''
                                    }`}
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant={SEVERITY_COLORS[alert.severity] as 'destructive' | 'secondary' | 'outline' || 'secondary'}>
                                                {alert.severity}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {alert.type.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <p className="font-medium text-sm">{alert.title}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{alert.message}</p>
                                    </div>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        {alert.createdAt ? new Date(alert.createdAt).toLocaleString('en-US', { timeZone: 'UTC' }) : ''}
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
