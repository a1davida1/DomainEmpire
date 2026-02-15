'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Globe, Rocket, RefreshCw, CheckCircle2, AlertCircle, Clock,
    ChevronDown, ChevronRight, Cloud
} from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";

interface DeployStep {
    step: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    detail?: string;
}

const BATCH_SIZE = 50;

type BulkDeployResponse = {
    dryRun?: boolean;
    requested?: number;
    queueable?: number;
    queued?: number;
    blocked?: number;
    blockedDomains?: Array<{
        domain: string;
        issues?: Array<{ message: string }>;
    }>;
    preflightWarnings?: Array<{
        domain: string;
        issues?: Array<{ message: string }>;
    }>;
};

interface DeployJob {
    id: string;
    domain: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    errorMessage?: string;
    attempts?: number;
    maxAttempts?: number;
    steps?: DeployStep[] | null;
    filesDeployed?: number | null;
    cfProject?: string | null;
}

interface DomainStatus {
    id: string;
    domain: string;
    status: string;
    lastDeployed?: string;
    isDeployed: boolean;
}

export default function DeployPage() {
    const [domains, setDomains] = useState<DomainStatus[]>([]);
    const [jobs, setJobs] = useState<DeployJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [deploying, setDeploying] = useState(false);
    const [expandedJob, setExpandedJob] = useState<string | null>(null);
    const { toast } = useToast();

    const runDeployBatch = useCallback(async (
        batch: string[],
        dryRun: boolean,
    ): Promise<{
        requested: number;
        queueable: number;
        queued: number;
        blocked: number;
        blockedDomains: string[];
        warningDomains: string[];
    }> => {
        const res = await fetch('/api/domains/bulk-deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domainIds: batch,
                triggerBuild: true,
                dryRun,
            }),
        });

        if (!res.ok) {
            const errorBody = await res.json().catch(() => ({}));
            throw new Error(
                typeof errorBody?.error === 'string'
                    ? errorBody.error
                    : `Bulk deploy request failed with ${res.status}`
            );
        }

        const data = await res.json() as BulkDeployResponse;
        return {
            requested: typeof data.requested === 'number' ? data.requested : batch.length,
            queueable: typeof data.queueable === 'number' ? data.queueable : 0,
            queued: typeof data.queued === 'number' ? data.queued : 0,
            blocked: typeof data.blocked === 'number' ? data.blocked : 0,
            blockedDomains: Array.isArray(data.blockedDomains)
                ? data.blockedDomains.map((entry) => entry.domain).filter(Boolean)
                : [],
            warningDomains: Array.isArray(data.preflightWarnings)
                ? data.preflightWarnings.map((entry) => entry.domain).filter(Boolean)
                : [],
        };
    }, []);

    const fetchData = useCallback(async (signal?: AbortSignal) => {
        try {
            const domainsRes = await fetch('/api/domains?status=active', { signal });

            if (!domainsRes.ok) {
                console.error('Failed to fetch domains:', domainsRes.status);
                return;
            }

            const domainsData = await domainsRes.json();
            if (Array.isArray(domainsData.domains)) {
                setDomains(domainsData.domains);
            }

            // Fetch jobs from deploy status endpoint
            const statusRes = await fetch('/api/deploy/status', { signal });
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (Array.isArray(statusData.jobs)) {
                    setJobs(statusData.jobs);
                }
            }

        } catch (error) {
            // Ignore abort errors
            if (error instanceof Error && error.name === 'AbortError') return;
            console.error('Failed to fetch data', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchData(controller.signal);
        const interval = setInterval(() => fetchData(controller.signal), 5000);
        return () => {
            controller.abort();
            clearInterval(interval);
        };
    }, [fetchData]);

    const handleDeployAll = async () => {
        if (domains.length === 0) return;

        const batches: string[][] = [];
        const domainIds = domains.map((domain) => domain.id);
        for (let index = 0; index < domainIds.length; index += BATCH_SIZE) {
            batches.push(domainIds.slice(index, index + BATCH_SIZE));
        }

        setDeploying(true);
        let preflightRequested = 0;
        let preflightQueueable = 0;
        let preflightBlocked = 0;
        const preflightBlockedDomains: string[] = [];
        const preflightWarningDomains = new Set<string>();

        try {
            for (const batch of batches) {
                const result = await runDeployBatch(batch, true);
                preflightRequested += result.requested;
                preflightQueueable += result.queueable;
                preflightBlocked += result.blocked;
                preflightBlockedDomains.push(...result.blockedDomains);
                for (const warningDomain of result.warningDomains) {
                    preflightWarningDomains.add(warningDomain);
                }
            }

            if (preflightQueueable === 0) {
                const blockedPreview = preflightBlockedDomains.slice(0, 5).join(', ');
                toast({
                    title: "Deploy Preflight Blocked",
                    description: `No deployable domains found. ${preflightBlocked} blocked.${blockedPreview ? ` Example: ${blockedPreview}${preflightBlockedDomains.length > 5 ? ', ...' : ''}` : ''}`,
                    variant: "destructive",
                });
                return;
            }

            const warningCount = preflightWarningDomains.size;
            const proceed = window.confirm(
                `Preflight summary:\n` +
                `• Requested: ${preflightRequested}\n` +
                `• Queueable: ${preflightQueueable}\n` +
                `• Blocked: ${preflightBlocked}\n` +
                `• Warnings: ${warningCount}\n\n` +
                `Queue deployment jobs now?`
            );
            if (!proceed) return;

            let queued = 0;
            let blocked = 0;
            const queueWarningDomains = new Set<string>();

            for (const batch of batches) {
                const result = await runDeployBatch(batch, false);
                queued += result.queued;
                blocked += result.blocked;
                for (const warningDomain of result.warningDomains) {
                    queueWarningDomains.add(warningDomain);
                }
            }

            toast({
                title: "Deployment Started",
                description: [
                    `Queued ${queued} sites for deployment.`,
                    blocked > 0 ? `${blocked} blocked by preflight.` : '',
                    queueWarningDomains.size > 0 ? `${queueWarningDomains.size} queued with warnings.` : '',
                ].filter(Boolean).join(' '),
            });
            fetchData();
        } catch (error) {
            console.error('Deploy failed', error);
            toast({
                title: "Error",
                description: "Failed to trigger deployments.",
                variant: "destructive",
            });
        } finally {
            setDeploying(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'failed': return <AlertCircle className="h-4 w-4 text-red-500" />;
            case 'processing': return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
            default: return <Clock className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
            completed: 'default',
            processing: 'secondary',
            failed: 'destructive',
            pending: 'outline',
        };
        return (
            <Badge variant={variants[status] || 'outline'} className="text-xs capitalize">
                {status}
            </Badge>
        );
    };

    const deployedCount = domains.filter(d => d.isDeployed).length;
    const processingCount = jobs.filter(j => j.status === 'processing').length;
    const failedCount = jobs.filter(j => j.status === 'failed').length;

    return (
        <div className="space-y-6 p-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Deployment Center</h1>
                    <p className="text-muted-foreground">Manage and monitor site deployments</p>
                </div>
                <Button onClick={handleDeployAll} disabled={deploying || domains.length === 0}>
                    {deploying ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                    Deploy All Active ({domains.length})
                </Button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold">{domains.length}</p>
                        <p className="text-sm text-muted-foreground">Active Domains</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold text-green-500">{deployedCount}</p>
                        <p className="text-sm text-muted-foreground">Deployed</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold text-blue-500">{processingCount}</p>
                        <p className="text-sm text-muted-foreground">Deploying Now</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6 text-center">
                        <p className="text-2xl font-bold text-red-500">{failedCount}</p>
                        <p className="text-sm text-muted-foreground">Failed</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Active Deployments - Enhanced with step progress */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                        <CardDescription>Real-time deployment status with step progress</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                                <p>Loading activity...</p>
                            </div>
                        ) : jobs.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No recent deployment activity.
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                                {jobs.map(job => (
                                    <div key={job.id} className="rounded-lg border bg-muted/30">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                                            className="w-full flex justify-between items-center p-3 hover:bg-muted/50 transition-colors rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                {getStatusIcon(job.status)}
                                                <div className="text-left">
                                                    <p className="font-medium text-sm">{job.domain}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {new Date(job.createdAt).toLocaleString()}
                                                        {job.attempts && job.attempts > 1 && (
                                                            <span className="ml-2 text-yellow-500">
                                                                Attempt {job.attempts}/{job.maxAttempts || 3}
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(job.status)}
                                                {expandedJob === job.id
                                                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                }
                                            </div>
                                        </button>

                                        {/* Expanded details */}
                                        {expandedJob === job.id && (
                                            <div className="px-3 pb-3 border-t border-border/50 pt-2">
                                                {/* Step progress */}
                                                {job.steps && Array.isArray(job.steps) && (
                                                    <div className="space-y-1.5 mb-3">
                                                        {job.steps.map((step, i) => (
                                                            <div key={i} className="flex items-center gap-2 text-xs">
                                                                {step.status === 'done' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                                                {step.status === 'running' && <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />}
                                                                {step.status === 'failed' && <AlertCircle className="h-3 w-3 text-red-500" />}
                                                                {step.status === 'pending' && <Clock className="h-3 w-3 text-muted-foreground" />}
                                                                <span className={step.status === 'done' ? 'text-green-400' : step.status === 'failed' ? 'text-red-400' : ''}>
                                                                    {step.step}
                                                                </span>
                                                                {step.detail && (
                                                                    <span className="text-muted-foreground truncate max-w-[200px]">
                                                                        — {step.detail}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Error message */}
                                                {job.errorMessage && (
                                                    <div className="text-xs text-red-400 bg-red-500/10 rounded p-2 mb-2">
                                                        {job.errorMessage}
                                                    </div>
                                                )}

                                                {/* Result details */}
                                                <div className="flex gap-3 text-xs text-muted-foreground">
                                                    {job.filesDeployed && (
                                                        <span>{job.filesDeployed} files</span>
                                                    )}
                                                    {job.cfProject && (
                                                        <span className="flex items-center gap-1">
                                                            <Cloud className="h-3 w-3" /> {job.cfProject}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Domain Status */}
                <Card>
                    <CardHeader>
                        <CardTitle>Domain Status</CardTitle>
                        <CardDescription>
                            {deployedCount}/{domains.length} deployed
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                            {domains.map(domain => (
                                <div key={domain.id} className="flex justify-between items-center p-2 hover:bg-muted/50 rounded transition-colors">
                                    <div className="flex items-center gap-2">
                                        <Globe className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm font-medium">{domain.domain}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {domain.isDeployed ? (
                                            <Badge variant="secondary" className="bg-green-500/10 text-green-500 hover:bg-green-500/20">Live</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-muted-foreground">Not Deployed</Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
