import Link from 'next/link';
import { db } from '@/lib/db';
import { articles, contentQueue, domainResearch, domains } from '@/lib/db/schema';
import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { getQueueHealth, retryFailedJobs, runWorkerOnce } from '@/lib/ai/worker';
import { getContentQueueBackendHealth, requeueContentJobIds } from '@/lib/queue/content-queue';
import { revalidatePath } from 'next/cache';
import { QueueAutoProcessor } from '@/components/dashboard/QueueAutoProcessor';
import { QueueBulkSelectionTools } from '@/components/dashboard/QueueBulkSelectionTools';
import { QueueSelectAllCheckbox } from '@/components/dashboard/QueueSelectAllCheckbox';
import { getOperationsSettings } from '@/lib/settings/operations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PROCESS_NOW_DEFAULT = 25;
const QUERY_LIMIT_DEFAULT = 80;
const QUERY_LIMIT_MIN = 20;
const QUERY_LIMIT_MAX = 200;

const QUEUE_STATUS_VALUES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const;
type QueueStatus = (typeof QUEUE_STATUS_VALUES)[number];
const QUEUE_SLA_FILTER_VALUES = ['all', 'ok', 'breached'] as const;
type QueueSlaFilter = (typeof QUEUE_SLA_FILTER_VALUES)[number];

type QueueSearchParams = {
    preset?: string;
    status?: string;
    sla?: string;
    jobTypes?: string | string[];
    domainId?: string;
    q?: string;
    limit?: string;
};

const RETRYABLE_STATUSES = ['failed', 'cancelled'] as const;
const REQUEUEABLE_STATUSES = ['pending', 'failed', 'cancelled'] as const;
const JOB_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QueuePreset = 'none' | 'failures' | 'stalled' | 'deploy' | 'acquisition';

type RunbookGuidance = {
    summary: string;
    checks: string;
    remediation: string;
};

const JOB_RUNBOOK_GUIDANCE: Record<string, RunbookGuidance> = {
    deploy: {
        summary: 'Deployment pipeline to hosting provider and DNS.',
        checks: 'Check provider credentials, zone/domain ownership, and template output integrity.',
        remediation: 'Reconnect hosting integration, validate zone presence, then retry deploy jobs.',
    },
    keyword_research: {
        summary: 'Keyword and topic discovery stage.',
        checks: 'Check model/provider quota and upstream keyword source availability.',
        remediation: 'Re-run after quota reset or provider recovery.',
    },
    research: {
        summary: 'Domain/content research synthesis.',
        checks: 'Check model availability and payload completeness.',
        remediation: 'Retry after fixing malformed payload or upstream data gaps.',
    },
    generate_outline: {
        summary: 'AI outline generation for article workflow.',
        checks: 'Check model endpoint status and prompt/payload fields.',
        remediation: 'Retry failed jobs; inspect prompt construction if failures repeat.',
    },
    generate_draft: {
        summary: 'AI draft generation from approved outline.',
        checks: 'Check model endpoint health and token limits.',
        remediation: 'Retry failed jobs or lower draft complexity/word targets.',
    },
    run_integration_connection_sync: {
        summary: 'External integration sync (analytics/registrar/affiliate/etc).',
        checks: 'Check connection auth/token validity and provider rate limits.',
        remediation: 'Re-auth integration, wait for limits, then requeue sync jobs.',
    },
    ingest_listings: {
        summary: 'Acquisition listing ingestion from marketplaces.',
        checks: 'Check source integration credentials and fetch limits.',
        remediation: 'Requeue after source auth/availability is restored.',
    },
    enrich_candidate: {
        summary: 'Acquisition candidate enrichment stage.',
        checks: 'Check upstream data source health and payload integrity.',
        remediation: 'Retry once source errors are resolved.',
    },
    score_candidate: {
        summary: 'Acquisition scoring and underwriting signals.',
        checks: 'Check scoring inputs and model availability.',
        remediation: 'Retry after fixing missing signals/data.',
    },
    create_bid_plan: {
        summary: 'Acquisition bid strategy generation.',
        checks: 'Check candidate underwriting completeness and model connectivity.',
        remediation: 'Retry after upstream enrichment/scoring success.',
    },
};

function getRunbookGuidance(jobType: string): RunbookGuidance {
    if (JOB_RUNBOOK_GUIDANCE[jobType]) {
        return JOB_RUNBOOK_GUIDANCE[jobType];
    }
    if (jobType.startsWith('publish_') || jobType.startsWith('generate_') || jobType.startsWith('render_')) {
        return {
            summary: 'AI/media publishing stage.',
            checks: 'Check provider credentials, model/API availability, and payload fields.',
            remediation: 'Fix provider/config errors, then retry failed jobs.',
        };
    }
    if (jobType.startsWith('check_') || jobType.startsWith('fetch_') || jobType.startsWith('sync_')) {
        return {
            summary: 'Monitoring/sync stage with external dependencies.',
            checks: 'Check provider quota/rate limits and integration auth.',
            remediation: 'Requeue once provider limits recover.',
        };
    }
    return {
        summary: 'General queue task.',
        checks: 'Check payload validity, upstream dependency health, and integration credentials.',
        remediation: 'Retry after fixing root cause from the latest error.',
    };
}

function isQueuePreset(value: string | null): value is Exclude<QueuePreset, 'none'> {
    return value === 'failures' || value === 'stalled' || value === 'deploy' || value === 'acquisition';
}

function parseSelectedJobIds(formData: FormData): string[] {
    return [...new Set(
        formData
            .getAll('jobIds')
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => JOB_ID_REGEX.test(value)),
    )];
}

function isQueueStatus(value: string | undefined): value is QueueStatus {
    return !!value && (QUEUE_STATUS_VALUES as readonly string[]).includes(value);
}

function isQueueSlaFilter(value: string | undefined): value is QueueSlaFilter {
    return !!value && (QUEUE_SLA_FILTER_VALUES as readonly string[]).includes(value);
}

async function retryFailedAction() {
    'use server';
    await retryFailedJobs(25);
    revalidatePath('/dashboard/queue');
}

async function recoverStaleLocksAction() {
    'use server';

    const settings = await getOperationsSettings();
    const staleCutoff = new Date(Date.now() - settings.queueStaleThresholdMinutes * 60 * 1000).toISOString();

    const now = new Date();
    const recoveredRows = await db
        .update(contentQueue)
        .set({
            status: 'pending',
            lockedUntil: null,
            startedAt: null,
            completedAt: null,
            scheduledFor: now,
            errorMessage: 'Recovered stale processing lock via queue operator control.',
        })
        .where(and(
            eq(contentQueue.status, 'processing'),
            sql`coalesce(${contentQueue.startedAt}, ${contentQueue.createdAt}) <= ${staleCutoff}`,
        ))
        .returning({ id: contentQueue.id });

    const recoveredIds = recoveredRows.map((row) => row.id);
    if (recoveredIds.length > 0) {
        try {
            await requeueContentJobIds(recoveredIds);
        } catch (error) {
            console.error('Recovered stale locks but failed to publish requeue event', {
                recoveredCount: recoveredIds.length,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    revalidatePath('/dashboard/queue');
}

async function processNowAction(formData: FormData) {
    'use server';
    const rawMaxJobs = formData.get('maxJobs');
    const parsed = Number.parseInt(String(rawMaxJobs ?? PROCESS_NOW_DEFAULT), 10);
    const maxJobs = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 200)) : PROCESS_NOW_DEFAULT;
    await runWorkerOnce({ maxJobs });
    revalidatePath('/dashboard/queue');
}

async function cancelJobAction(formData: FormData) {
    'use server';
    const jobId = typeof formData.get('jobId') === 'string' ? String(formData.get('jobId')).trim() : '';
    if (!JOB_ID_REGEX.test(jobId)) return;
    await db.update(contentQueue)
        .set({ status: 'cancelled' })
        .where(and(
            eq(contentQueue.id, jobId),
            inArray(contentQueue.status, ['pending', 'processing', 'failed']),
        ));
    revalidatePath('/dashboard/queue');
}

async function bulkJobAction(formData: FormData) {
    'use server';
    const bulkAction = typeof formData.get('bulkAction') === 'string'
        ? String(formData.get('bulkAction'))
        : '';
    const selectedIds = parseSelectedJobIds(formData);
    if (selectedIds.length === 0) return;

    const now = new Date();
    let updatedIds: string[] = [];

    if (bulkAction === 'retry') {
        const updated = await db
            .update(contentQueue)
            .set({
                status: 'pending',
                attempts: 0,
                errorMessage: null,
                scheduledFor: now,
                lockedUntil: null,
                startedAt: null,
                completedAt: null,
            })
            .where(and(
                inArray(contentQueue.id, selectedIds),
                inArray(contentQueue.status, RETRYABLE_STATUSES),
            ))
            .returning({ id: contentQueue.id });
        updatedIds = updated.map((row) => row.id);
    } else if (bulkAction === 'requeue') {
        const updated = await db
            .update(contentQueue)
            .set({
                status: 'pending',
                attempts: 0,
                errorMessage: null,
                scheduledFor: now,
                lockedUntil: null,
                startedAt: null,
                completedAt: null,
            })
            .where(and(
                inArray(contentQueue.id, selectedIds),
                inArray(contentQueue.status, REQUEUEABLE_STATUSES),
            ))
            .returning({ id: contentQueue.id });
        updatedIds = updated.map((row) => row.id);
    } else {
        return;
    }

    if (updatedIds.length > 0) {
        try {
            await requeueContentJobIds(updatedIds);
        } catch (error) {
            console.error('Bulk queue action updated jobs but failed to publish Redis requeue event', {
                bulkAction,
                updatedIds: updatedIds.length,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    revalidatePath('/dashboard/queue');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toStringValue(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function toStringArrayValues(value: string | string[] | undefined): string[] {
    if (!value) return [];
    const rawValues = Array.isArray(value) ? value : [value];
    return [...new Set(
        rawValues
            .flatMap((item) => item.split(','))
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
    )];
}

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

function parseLimit(value: string | undefined): number {
    const parsed = Number.parseInt(value ?? String(QUERY_LIMIT_DEFAULT), 10);
    if (!Number.isFinite(parsed)) return QUERY_LIMIT_DEFAULT;
    return Math.max(QUERY_LIMIT_MIN, Math.min(parsed, QUERY_LIMIT_MAX));
}

function buildQueueExportHref(input: {
    preset: QueuePreset;
    statusFilter: QueueStatus | 'all';
    slaFilter: QueueSlaFilter;
    selectedJobTypes: string[];
    domainIdFilter: string | null;
    queryFilter: string | null;
}): string {
    const params = new URLSearchParams();

    if (input.preset !== 'none') {
        params.set('preset', input.preset);
    }
    if (input.statusFilter !== 'all') {
        params.set('status', input.statusFilter);
    }
    if (input.slaFilter !== 'all') {
        params.set('sla', input.slaFilter);
    }
    for (const jobType of input.selectedJobTypes) {
        params.append('jobTypes', jobType);
    }
    if (input.domainIdFilter) {
        params.set('domainId', input.domainIdFilter);
    }
    if (input.queryFilter) {
        params.set('q', input.queryFilter);
    }
    params.set('exportLimit', '2000');

    const encoded = params.toString();
    return encoded.length > 0 ? `/api/queue/export?${encoded}` : '/api/queue/export';
}

function formatAge(ms: number | null): string {
    if (!ms || ms <= 0) return '—';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
    return `${(ms / 86_400_000).toFixed(1)}d`;
}

function formatDate(value: Date | null): string {
    if (!value) return '—';
    return new Date(value).toLocaleString();
}

function coerceDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
    return null;
}

function formatJsonPreview(value: unknown, maxLength = 3200): string {
    if (value === null || value === undefined) return '—';
    let rendered = '—';
    try {
        rendered = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    } catch {
        rendered = String(value);
    }
    if (rendered.length <= maxLength) return rendered;
    return `${rendered.slice(0, maxLength)}\n…truncated`;
}

function extractPayloadDomain(payload: unknown): string | null {
    if (!isRecord(payload)) return null;
    const direct = toStringValue(payload.domain) || toStringValue(payload.domainName);
    if (direct) return direct.toLowerCase();

    const candidate = payload.candidate;
    if (isRecord(candidate)) {
        const candidateDomain = toStringValue(candidate.domain);
        if (candidateDomain) return candidateDomain.toLowerCase();
    }

    return null;
}

function extractPayloadDomainId(payload: unknown): string | null {
    if (!isRecord(payload)) return null;
    return toStringValue(payload.domainId) || toStringValue(payload.domain_id);
}

function extractPayloadTarget(payload: unknown): string | null {
    if (!isRecord(payload)) return null;
    const scalarFields = [
        'targetKeyword',
        'keyword',
        'niche',
        'campaignId',
        'connectionId',
        'domainResearchId',
        'listingId',
        'templateId',
    ] as const;

    for (const key of scalarFields) {
        const value = toStringValue(payload[key]);
        if (value) return `${key}: ${value}`;
    }

    const candidate = payload.candidate;
    if (isRecord(candidate)) {
        const listingId = toStringValue(candidate.listingId);
        if (listingId) return `listingId: ${listingId}`;
    }

    const list = payload.candidates;
    if (Array.isArray(list)) {
        return `candidates: ${list.length}`;
    }

    return null;
}

function extractPayloadDomainResearchId(payload: unknown): string | null {
    if (!isRecord(payload)) return null;
    const researchId = toStringValue(payload.domainResearchId);
    return researchId;
}

export default async function QueuePage({
    searchParams,
}: {
    searchParams?: Promise<QueueSearchParams>;
}) {
    const params = (await searchParams) ?? {};
    const operationsSettings = await getOperationsSettings();
    const staleThresholdMinutes = operationsSettings.queueStaleThresholdMinutes;
    const pendingSlaMinutes = operationsSettings.queuePendingSlaMinutes;
    const processingSlaMinutes = operationsSettings.queueProcessingSlaMinutes;
    const staleCutoff = new Date(Date.now() - staleThresholdMinutes * 60 * 1000).toISOString();

    const presetParam = toStringValue(params.preset);
    const preset: QueuePreset = isQueuePreset(presetParam) ? presetParam : 'none';
    const statusFilter = isQueueStatus(params.status) ? params.status : 'all';
    const slaFilter: QueueSlaFilter = isQueueSlaFilter(params.sla) ? params.sla : 'all';
    const selectedJobTypes = toStringArrayValues(params.jobTypes);
    const selectedJobTypeSet = new Set(selectedJobTypes);
    const domainIdFilter = toStringValue(params.domainId);
    const queryFilter = toStringValue(params.q);
    const listLimit = parseLimit(params.limit);
    const exportHref = buildQueueExportHref({
        preset,
        statusFilter,
        slaFilter,
        selectedJobTypes,
        domainIdFilter,
        queryFilter,
    });
    const queryPattern = queryFilter ? `%${queryFilter}%` : null;
    const presetFilter = (() => {
        if (preset === 'failures') {
            return eq(contentQueue.status, 'failed');
        }
        if (preset === 'stalled') {
            return sql`${contentQueue.status} = 'pending' AND (${contentQueue.scheduledFor} IS NULL OR ${contentQueue.scheduledFor} <= now()) AND ${contentQueue.createdAt} <= now() - interval '20 minutes'`;
        }
        if (preset === 'deploy') {
            return eq(contentQueue.jobType, 'deploy');
        }
        if (preset === 'acquisition') {
            return inArray(contentQueue.jobType, ['ingest_listings', 'enrich_candidate', 'score_candidate', 'create_bid_plan']);
        }
        return undefined;
    })();
    const slaFilterClause = (() => {
        if (slaFilter === 'all') {
            return undefined;
        }
        if (slaFilter === 'breached') {
            return sql`(
                (${contentQueue.status} = 'pending' AND ${contentQueue.createdAt} <= now() - (${pendingSlaMinutes} * interval '1 minute'))
                OR
                (${contentQueue.status} = 'processing' AND coalesce(${contentQueue.startedAt}, ${contentQueue.createdAt}) <= now() - (${processingSlaMinutes} * interval '1 minute'))
            )`;
        }
        return sql`(
            (${contentQueue.status} = 'pending' AND ${contentQueue.createdAt} > now() - (${pendingSlaMinutes} * interval '1 minute'))
            OR
            (${contentQueue.status} = 'processing' AND coalesce(${contentQueue.startedAt}, ${contentQueue.createdAt}) > now() - (${processingSlaMinutes} * interval '1 minute'))
        )`;
    })();

    const whereFilters = [
        presetFilter,
        statusFilter !== 'all' ? eq(contentQueue.status, statusFilter) : undefined,
        slaFilterClause,
        selectedJobTypes.length > 0
            ? sql`${contentQueue.jobType} IN (${sql.join(selectedJobTypes.map((jobType) => sql`${jobType}`), sql`, `)})`
            : undefined,
        domainIdFilter
            ? sql`(${contentQueue.domainId} = ${domainIdFilter} OR ${contentQueue.articleId} IN (
                SELECT ${articles.id} FROM ${articles} WHERE ${articles.domainId} = ${domainIdFilter}
            ))`
            : undefined,
        queryPattern
            ? or(
                sql`${contentQueue.id}::text ILIKE ${queryPattern}`,
                sql`COALESCE(${contentQueue.errorMessage}, '') ILIKE ${queryPattern}`,
                sql`COALESCE(${contentQueue.jobType}, '') ILIKE ${queryPattern}`,
                sql`COALESCE(${contentQueue.payload}::text, '') ILIKE ${queryPattern}`,
            )
            : undefined,
    ].filter(isDefined);

    const whereClause = whereFilters.length > 0 ? and(...whereFilters) : sql`true`;

    const [health, backend, recentJobs, totalMatchingRows, jobTypeOptionsRows, domainOptionRows, activityRows, failedDomainAggregateRows, staleProcessingRows] = await Promise.all([
        getQueueHealth(),
        getContentQueueBackendHealth(),
        db.select()
            .from(contentQueue)
            .where(whereClause)
            .orderBy(desc(contentQueue.createdAt))
            .limit(listLimit),
        db.select({
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .where(whereClause),
        db.select({
            jobType: contentQueue.jobType,
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .groupBy(contentQueue.jobType)
            .orderBy(sql`count(*) desc`, contentQueue.jobType),
        db.select({
            domainId: contentQueue.domainId,
            domain: domains.domain,
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .innerJoin(domains, eq(contentQueue.domainId, domains.id))
            .where(isNotNull(contentQueue.domainId))
            .groupBy(contentQueue.domainId, domains.domain)
            .orderBy(sql`count(*) desc`, domains.domain),
        db.select({
            lastStartedAt: sql<Date | null>`max(${contentQueue.startedAt})`,
            lastCompletedAt: sql<Date | null>`max(${contentQueue.completedAt})`,
            lastQueuedAt: sql<Date | null>`max(${contentQueue.createdAt})`,
        }).from(contentQueue),
        db.select({
            domainId: sql<string | null>`coalesce(${contentQueue.domainId}, ${articles.domainId})`,
            failedCount: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .leftJoin(articles, eq(contentQueue.articleId, articles.id))
            .where(and(
                eq(contentQueue.status, 'failed'),
                sql`coalesce(${contentQueue.domainId}, ${articles.domainId}) is not null`,
                sql`${contentQueue.createdAt} >= now() - interval '7 days'`,
            ))
            .groupBy(sql`coalesce(${contentQueue.domainId}, ${articles.domainId})`)
            .orderBy(sql`count(*) desc`)
            .limit(12),
        db.select({
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.status, 'processing'),
                sql`coalesce(${contentQueue.startedAt}, ${contentQueue.createdAt}) <= ${staleCutoff}`,
            )),
    ]);

    const jobsByType = jobTypeOptionsRows
        .filter((row) => row.jobType)
        .slice(0, 12);
    const failedDomainIds = failedDomainAggregateRows
        .map((row) => row.domainId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
    const failedDomainRows = failedDomainIds.length > 0
        ? await db.select({
            id: domains.id,
            domain: domains.domain,
        })
            .from(domains)
            .where(inArray(domains.id, failedDomainIds))
        : [];
    const failedDomainMap = new Map(failedDomainRows.map((row) => [row.id, row.domain]));
    const topFailingDomains = failedDomainAggregateRows
        .filter((row): row is { domainId: string; failedCount: number } => typeof row.domainId === 'string' && row.domainId.length > 0)
        .map((row) => ({
            domainId: row.domainId,
            domain: failedDomainMap.get(row.domainId) ?? row.domainId,
            failedCount: row.failedCount,
        }));
    const staleProcessingCount = staleProcessingRows[0]?.count ?? 0;

    const articleIds = [...new Set(recentJobs
        .map((job) => job.articleId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0))];
    const articleRows = articleIds.length > 0
        ? await db.select({
            id: articles.id,
            domainId: articles.domainId,
            title: articles.title,
            targetKeyword: articles.targetKeyword,
        })
            .from(articles)
            .where(inArray(articles.id, articleIds))
        : [];
    const articleMap = new Map(articleRows.map((row) => [row.id, row]));

    const payloadResearchIds = [...new Set(recentJobs
        .map((job) => extractPayloadDomainResearchId(job.payload))
        .filter((value): value is string => typeof value === 'string' && value.length > 0))];
    const payloadResearchRows = payloadResearchIds.length > 0
        ? await db.select({
            id: domainResearch.id,
            domainId: domainResearch.domainId,
            domain: domainResearch.domain,
        })
            .from(domainResearch)
            .where(inArray(domainResearch.id, payloadResearchIds))
        : [];
    const payloadResearchMap = new Map(payloadResearchRows.map((row) => [row.id, row]));

    const domainIds = new Set<string>();
    for (const job of recentJobs) {
        if (job.domainId) domainIds.add(job.domainId);
        if (job.articleId) {
            const linkedArticle = articleMap.get(job.articleId);
            if (linkedArticle?.domainId) domainIds.add(linkedArticle.domainId);
        }
        const payloadDomainId = extractPayloadDomainId(job.payload);
        if (payloadDomainId) {
            domainIds.add(payloadDomainId);
        }
        const payloadResearchId = extractPayloadDomainResearchId(job.payload);
        if (payloadResearchId) {
            const research = payloadResearchMap.get(payloadResearchId);
            if (research?.domainId) {
                domainIds.add(research.domainId);
            }
        }
    }

    const domainRows = domainIds.size > 0
        ? await db.select({
            id: domains.id,
            domain: domains.domain,
        })
            .from(domains)
            .where(inArray(domains.id, [...domainIds]))
        : [];
    const domainMap = new Map(domainRows.map((row) => [row.id, row.domain]));

    const totalMatching = totalMatchingRows[0]?.count ?? 0;
    const activeFilterCount = [
        preset !== 'none',
        statusFilter !== 'all',
        slaFilter !== 'all',
        selectedJobTypes.length > 0,
        !!domainIdFilter,
        !!queryFilter,
    ].filter(Boolean).length;

    const latestStartedAt = coerceDate(activityRows[0]?.lastStartedAt);
    const latestCompletedAt = coerceDate(activityRows[0]?.lastCompletedAt);
    const latestQueuedAt = coerceDate(activityRows[0]?.lastQueuedAt);
    const latestWorkerActivity = [latestStartedAt, latestCompletedAt]
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const latestWorkerActivityAge = latestWorkerActivity
        ? Date.now() - latestWorkerActivity.getTime()
        : null;

    const workerHeartbeat = (() => {
        if (health.processing > 0) {
            return {
                label: 'Running',
                className: 'bg-emerald-100 text-emerald-800',
                detail: `${health.processing} job${health.processing === 1 ? '' : 's'} processing now.`,
            };
        }
        if ((latestWorkerActivityAge ?? Number.MAX_SAFE_INTEGER) < 5 * 60 * 1000) {
            return {
                label: 'Recently Active',
                className: 'bg-blue-100 text-blue-800',
                detail: `Last worker activity ${formatAge(latestWorkerActivityAge)} ago.`,
            };
        }
        if (health.pending > 0) {
            return {
                label: 'Stalled',
                className: 'bg-amber-100 text-amber-900',
                detail: `${health.pending} pending job${health.pending === 1 ? '' : 's'} with no recent worker activity.`,
            };
        }
        return {
            label: 'Idle',
            className: 'bg-slate-100 text-slate-800',
            detail: 'No pending work and no active processing.',
        };
    })();

    const queueLikelyStalled = health.pending > 0
        && health.processing === 0
        && health.throughputPerHour === 0
        && (health.oldestPendingAge ?? 0) > 10 * 60 * 1000;
    const workerNeedsPersistentProcess = health.pending > 0
        && health.processing === 0
        && (latestWorkerActivityAge ?? Number.MAX_SAFE_INTEGER) > 5 * 60 * 1000;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Job Queue</h1>
                    <p className="text-sm text-muted-foreground">
                        Showing {recentJobs.length} of {totalMatching} job{totalMatching === 1 ? '' : 's'}
                        {activeFilterCount > 0 ? ` (${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active)` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <form action={processNowAction} className="flex items-center gap-2">
                        <input
                            type="number"
                            name="maxJobs"
                            min={1}
                            max={200}
                            defaultValue={String(PROCESS_NOW_DEFAULT)}
                            className="w-20 rounded border px-2 py-2 text-sm"
                        />
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                            Process Now
                        </button>
                    </form>
                    {health.failed > 0 && (
                        <form action={retryFailedAction}>
                            <button type="submit" className="px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700">
                                Retry Failed Jobs
                            </button>
                        </form>
                    )}
                    {staleProcessingCount > 0 && (
                        <form action={recoverStaleLocksAction}>
                            <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                                Recover Stale Locks ({staleProcessingCount})
                            </button>
                        </form>
                    )}
                    <Link href={exportHref} className="px-4 py-2 rounded-lg text-sm border hover:bg-muted">
                        Export CSV
                    </Link>
                    <Link href="/dashboard/workflow" className="px-4 py-2 rounded-lg text-sm border hover:bg-muted">
                        Workflow
                    </Link>
                </div>
            </div>

            <QueueAutoProcessor defaultMaxJobs={10} />

            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Presets</h2>
                <div className="flex flex-wrap gap-2">
                    {[
                        { label: 'All', href: '/dashboard/queue', key: 'none' },
                        { label: 'Failures', href: '/dashboard/queue?preset=failures', key: 'failures' },
                        { label: 'Stalled', href: '/dashboard/queue?preset=stalled', key: 'stalled' },
                        { label: 'Deploy Only', href: '/dashboard/queue?preset=deploy', key: 'deploy' },
                        { label: 'Acquisition Pipeline', href: '/dashboard/queue?preset=acquisition', key: 'acquisition' },
                    ].map((item) => (
                        <Link
                            key={item.key}
                            href={item.href}
                            className={`rounded-full border px-3 py-1 text-sm ${preset === item.key ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>
            </div>

            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Filters</h2>
                <form method="get" className="grid gap-3 md:grid-cols-6">
                    <select name="preset" defaultValue={preset === 'none' ? '' : preset} className="rounded border px-3 py-2 text-sm">
                        <option value="">No preset</option>
                        <option value="failures">Failures</option>
                        <option value="stalled">Stalled</option>
                        <option value="deploy">Deploy Only</option>
                        <option value="acquisition">Acquisition Pipeline</option>
                    </select>
                    <input
                        name="q"
                        defaultValue={queryFilter ?? ''}
                        placeholder="Search id, error, payload..."
                        className="rounded border px-3 py-2 text-sm"
                    />
                    <select name="status" defaultValue={statusFilter} className="rounded border px-3 py-2 text-sm">
                        <option value="all">All statuses</option>
                        {QUEUE_STATUS_VALUES.map((status) => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                    <select name="sla" defaultValue={slaFilter} className="rounded border px-3 py-2 text-sm">
                        <option value="all">All SLA states</option>
                        <option value="breached">SLA Breached</option>
                        <option value="ok">SLA OK</option>
                    </select>
                    <select name="domainId" defaultValue={domainIdFilter ?? ''} className="rounded border px-3 py-2 text-sm">
                        <option value="">All domains</option>
                        {domainOptionRows.map((row) => (
                            <option key={row.domainId} value={row.domainId ?? ''}>
                                {row.domain} ({row.count})
                            </option>
                        ))}
                    </select>
                    <select name="limit" defaultValue={String(listLimit)} className="rounded border px-3 py-2 text-sm">
                        {[40, 80, 120, 200].map((value) => (
                            <option key={value} value={String(value)}>Limit {value}</option>
                        ))}
                    </select>
                    <div className="md:col-span-5 rounded border p-3">
                        <p className="text-xs font-medium text-muted-foreground">Job Types (multi-select)</p>
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                            {jobTypeOptionsRows
                                .filter((row) => row.jobType)
                                .map((row) => {
                                    const jobTypeValue = row.jobType ?? '';
                                    return (
                                        <label key={jobTypeValue} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
                                            <span className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    name="jobTypes"
                                                    value={jobTypeValue}
                                                    defaultChecked={selectedJobTypeSet.has(jobTypeValue)}
                                                    className="h-4 w-4 accent-blue-600"
                                                />
                                                <span className="font-mono">{jobTypeValue}</span>
                                            </span>
                                            <span className="text-muted-foreground">{row.count}</span>
                                        </label>
                                    );
                                })}
                        </div>
                    </div>
                    <div className="md:col-span-5 flex flex-wrap items-center gap-2">
                        <button type="submit" className="px-4 py-2 bg-foreground text-background rounded-lg text-sm hover:opacity-90">
                            Apply Filters
                        </button>
                        <Link href="/dashboard/queue" className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">
                            Reset
                        </Link>
                    </div>
                </form>
            </div>

            {/* Health metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Pending" value={health.pending} color="yellow" />
                <StatCard label="Processing" value={health.processing} color="blue" />
                <StatCard label="Completed" value={health.completed} color="green" />
                <StatCard label="Failed" value={health.failed} color="red" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Throughput</p>
                    <p className="text-2xl font-bold">{health.throughputPerHour}/hr</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Error Rate (24h)</p>
                    <p className="text-2xl font-bold">{health.errorRate24h}%</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Avg Processing</p>
                    <p className="text-2xl font-bold">
                        {health.avgProcessingTimeMs ? `${Math.round(health.avgProcessingTimeMs / 1000)}s` : 'N/A'}
                    </p>
                </div>
            </div>

            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Worker Diagnostics</h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm">
                    <div className="rounded border p-3">
                        <div className="text-muted-foreground">Heartbeat</div>
                        <div className={`inline-flex rounded-full px-2 py-1 text-xs font-medium mt-1 ${workerHeartbeat.className}`}>
                            {workerHeartbeat.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">{workerHeartbeat.detail}</div>
                    </div>
                    <div className="rounded border p-3">
                        <div className="text-muted-foreground">Backend Mode</div>
                        <div className="font-medium">{backend.mode}</div>
                        <div className="text-xs text-muted-foreground">
                            selected: {backend.selectedBackend} • active: {backend.activeBackend}
                        </div>
                    </div>
                    <div className="rounded border p-3">
                        <div className="text-muted-foreground">Redis Status</div>
                        <div className="font-medium">{backend.redisStatus}</div>
                        <div className="text-xs text-muted-foreground">
                            pending depth: {backend.redisPendingDepth ?? 'n/a'}
                        </div>
                    </div>
                    <div className="rounded border p-3">
                        <div className="text-muted-foreground">Oldest Pending</div>
                        <div className="font-medium">{formatAge(health.oldestPendingAge)}</div>
                        <div className="text-xs text-muted-foreground">
                            throughput: {health.throughputPerHour}/hr
                        </div>
                    </div>
                    <div className="rounded border p-3">
                        <div className="text-muted-foreground">Recent Activity</div>
                        <div className="font-medium">
                            {latestWorkerActivity ? formatDate(latestWorkerActivity) : '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            last queued: {latestQueuedAt ? formatDate(latestQueuedAt) : '—'}
                        </div>
                    </div>
                </div>
                {queueLikelyStalled && (
                    <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        Queue appears stalled: pending jobs exist, nothing is processing, and throughput is zero.
                        Run a persistent worker with <code className="mx-1">npm run worker</code> or use the
                        &quot;Process Now&quot; button for manual batches.
                    </p>
                )}
                {backend.fallbackReason && (
                    <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                        Backend fallback: {backend.fallbackReason}
                    </p>
                )}
                {staleProcessingCount > 0 && (
                    <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                        {staleProcessingCount} job{staleProcessingCount === 1 ? '' : 's'} exceeded the stale processing threshold
                        ({staleThresholdMinutes}m). Use “Recover Stale Locks” to requeue them safely.
                        {' '}
                        <Link href="/dashboard/settings/operations" className="underline">
                            Adjust threshold
                        </Link>
                        .
                    </p>
                )}
            </div>

            <div className={`rounded-lg border p-4 ${workerNeedsPersistentProcess ? 'border-amber-300 bg-amber-50/70' : 'bg-card'}`}>
                <h2 className="text-lg font-semibold mb-2">Worker Run Guide</h2>
                {workerNeedsPersistentProcess ? (
                    <p className="text-sm text-amber-900">
                        Queue has pending work but no active worker heartbeat. Start a persistent worker process.
                    </p>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Keep one persistent worker running during active pipeline hours for predictable queue latency.
                    </p>
                )}
                <div className="mt-3 grid gap-3 md:grid-cols-3 text-xs">
                    <div className="rounded border bg-background p-3">
                        <div className="text-muted-foreground">Terminal Command</div>
                        <code className="mt-1 block">npm run worker</code>
                    </div>
                    <div className="rounded border bg-background p-3">
                        <div className="text-muted-foreground">Manual Fallback</div>
                        <div className="mt-1">Use &quot;Process Now&quot; for short bursts.</div>
                    </div>
                    <div className="rounded border bg-background p-3">
                        <div className="text-muted-foreground">In-App Auto-Run</div>
                        <div className="mt-1">Toggle &quot;Auto-Run On&quot; (saved in browser).</div>
                    </div>
                </div>
            </div>

            {/* Pending by type */}
            {jobsByType.length > 0 && (
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-3">Jobs by Type</h2>
                    <div className="flex flex-wrap gap-2">
                        {jobsByType.map(j => (
                            <span key={j.jobType} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                                {j.jobType}: {j.count}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {topFailingDomains.length > 0 && (
                <div className="bg-card rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-lg font-semibold">Top Failing Domains (7d)</h2>
                        <Link href="/dashboard/queue?preset=failures" className="text-xs text-blue-600 hover:underline">
                            Open all failures
                        </Link>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                        One-click drilldown into domains with the highest failed-job volume.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {topFailingDomains.map((row) => (
                            <Link
                                key={row.domainId}
                                href={`/dashboard/queue?preset=failures&domainId=${row.domainId}`}
                                className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-800 hover:bg-red-100"
                            >
                                {row.domain}: {row.failedCount}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent jobs table */}
            <div className="bg-card rounded-lg border overflow-hidden">
                <h2 className="text-lg font-semibold p-4 border-b">Recent Jobs</h2>
                <form id="queue-bulk-form" action={bulkJobAction} className="flex flex-wrap items-center gap-2 border-b bg-muted/20 p-3 text-sm">
                    <button
                        type="submit"
                        name="bulkAction"
                        value="retry"
                        className="rounded border border-yellow-400 bg-yellow-100 px-3 py-1.5 text-yellow-900 hover:bg-yellow-200"
                    >
                        Retry Selected
                    </button>
                    <button
                        type="submit"
                        name="bulkAction"
                        value="requeue"
                        className="rounded border border-blue-400 bg-blue-100 px-3 py-1.5 text-blue-900 hover:bg-blue-200"
                    >
                        Requeue Selected
                    </button>
                    <QueueBulkSelectionTools formId="queue-bulk-form" />
                    <span className="text-xs text-muted-foreground">
                        Retry applies to failed/cancelled. Requeue applies to pending/failed/cancelled.
                    </span>
                </form>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">
                                    <QueueSelectAllCheckbox formId="queue-bulk-form" />
                                </th>
                                <th className="text-left p-3">Job</th>
                                <th className="text-left p-3">Type</th>
                                <th className="text-left p-3">Domain</th>
                                <th className="text-left p-3">Target</th>
                                <th className="text-left p-3">Status</th>
                                <th className="text-left p-3">Attempts</th>
                                <th className="text-left p-3">Schedule</th>
                                <th className="text-left p-3">Cost</th>
                                <th className="text-left p-3">Created</th>
                                <th className="text-left p-3">Error</th>
                                <th className="text-left p-3">Details</th>
                                <th className="text-left p-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentJobs.length === 0 && (
                                <tr>
                                    <td className="p-4 text-sm text-muted-foreground" colSpan={13}>
                                        No jobs found for this filter.
                                    </td>
                                </tr>
                            )}
                            {recentJobs.map((job) => {
                                const linkedArticle = job.articleId ? articleMap.get(job.articleId) : undefined;
                                const payloadDomainId = extractPayloadDomainId(job.payload);
                                const payloadResearchId = extractPayloadDomainResearchId(job.payload);
                                const payloadResearch = payloadResearchId
                                    ? payloadResearchMap.get(payloadResearchId)
                                    : undefined;
                                const directDomain = job.domainId ? domainMap.get(job.domainId) : null;
                                const articleDomain = linkedArticle?.domainId ? domainMap.get(linkedArticle.domainId) : null;
                                const payloadDomainFromId = payloadDomainId ? domainMap.get(payloadDomainId) : null;
                                const researchDomain = payloadResearch?.domainId ? domainMap.get(payloadResearch.domainId) : null;
                                const payloadDomain = extractPayloadDomain(job.payload);
                                const resolvedDomain = directDomain
                                    || articleDomain
                                    || payloadDomainFromId
                                    || researchDomain
                                    || payloadResearch?.domain
                                    || payloadDomain
                                    || '—';
                                const resolvedDomainId = job.domainId
                                    || linkedArticle?.domainId
                                    || payloadDomainId
                                    || payloadResearch?.domainId
                                    || null;
                                const domainResolutionSource = directDomain
                                    ? 'domain_id'
                                    : articleDomain
                                        ? 'article'
                                        : payloadDomainFromId
                                            ? 'payload_domain_id'
                                        : payloadResearch
                                            ? 'domain_research'
                                        : payloadDomain
                                            ? 'payload'
                                            : 'none';
                                const payloadTarget = extractPayloadTarget(job.payload);
                                const targetSummary = linkedArticle?.targetKeyword
                                    || (payloadResearch ? `domainResearch: ${payloadResearch.domain}` : null)
                                    || payloadTarget
                                    || linkedArticle?.title
                                    || '—';
                                const runbook = getRunbookGuidance(job.jobType);
                                const status = job.status || 'pending';
                                const bulkSelectable = REQUEUEABLE_STATUSES.includes(status as (typeof REQUEUEABLE_STATUSES)[number]);
                                const runtimeMs = job.startedAt && job.completedAt
                                    ? Math.max(job.completedAt.getTime() - job.startedAt.getTime(), 0)
                                    : null;
                                const statusAgeMs = (() => {
                                    if (status === 'pending') {
                                        return job.createdAt ? Math.max(Date.now() - job.createdAt.getTime(), 0) : null;
                                    }
                                    if (status === 'processing') {
                                        const base = job.startedAt ?? job.createdAt;
                                        return base ? Math.max(Date.now() - base.getTime(), 0) : null;
                                    }
                                    return null;
                                })();
                                const statusSlaMinutes = status === 'pending'
                                    ? pendingSlaMinutes
                                    : status === 'processing'
                                        ? processingSlaMinutes
                                        : null;
                                const statusSlaBreached = statusAgeMs !== null
                                    && statusSlaMinutes !== null
                                    && statusAgeMs > statusSlaMinutes * 60 * 1000;

                                const scheduleSummary = job.scheduledFor
                                    ? formatDate(job.scheduledFor)
                                    : 'immediate';

                                return (
                                    <tr key={job.id} className="border-t align-top">
                                        <td className="p-3">
                                            <input
                                                type="checkbox"
                                                name="jobIds"
                                                value={job.id}
                                                form="queue-bulk-form"
                                                disabled={!bulkSelectable}
                                                className="h-4 w-4 accent-blue-600 disabled:opacity-40"
                                                aria-label={`Select job ${job.id}`}
                                            />
                                        </td>
                                        <td className="p-3 font-mono text-xs">{job.id.slice(0, 8)}</td>
                                        <td className="p-3 font-mono text-xs">{job.jobType}</td>
                                        <td className="p-3 text-xs">
                                            {resolvedDomainId ? (
                                                <Link href={`/dashboard/domains/${resolvedDomainId}`} className="hover:underline">
                                                    {resolvedDomain}
                                                </Link>
                                            ) : resolvedDomain}
                                        </td>
                                        <td className="p-3 text-xs max-w-xs">
                                            <div className="line-clamp-2">{targetSummary}</div>
                                            {linkedArticle?.title && (
                                                <div className="text-[11px] text-muted-foreground line-clamp-1">
                                                    article: {linkedArticle.title}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3">
                                            <StatusBadge status={status} />
                                            {job.lockedUntil && (
                                                <div className="text-[11px] text-muted-foreground mt-1">
                                                    lock until {formatDate(job.lockedUntil)}
                                                </div>
                                            )}
                                            {statusSlaMinutes !== null && statusAgeMs !== null && (
                                                <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] ${statusSlaBreached ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                    SLA {statusSlaBreached ? 'breached' : 'ok'} ({formatAge(statusAgeMs)} / {statusSlaMinutes}m)
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3">{job.attempts}/{job.maxAttempts}</td>
                                        <td className="p-3 text-xs text-muted-foreground">{scheduleSummary}</td>
                                        <td className="p-3">{job.apiCost ? `$${Number(job.apiCost).toFixed(4)}` : '—'}</td>
                                        <td className="p-3 text-muted-foreground text-xs">
                                            {formatDate(job.createdAt)}
                                        </td>
                                        <td className="p-3 text-red-500 text-xs max-w-xs truncate">
                                            {job.errorMessage || '—'}
                                        </td>
                                        <td className="p-3 text-xs min-w-[360px]">
                                            <details>
                                                <summary className="cursor-pointer text-blue-600 hover:underline">
                                                    View
                                                </summary>
                                                <div className="mt-2 rounded border bg-muted/30 p-2 space-y-2">
                                                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                        <div><span className="text-muted-foreground">job id:</span> {job.id}</div>
                                                        <div><span className="text-muted-foreground">resolution:</span> {domainResolutionSource}</div>
                                                        <div><span className="text-muted-foreground">created:</span> {formatDate(job.createdAt)}</div>
                                                        <div><span className="text-muted-foreground">scheduled:</span> {scheduleSummary}</div>
                                                        <div><span className="text-muted-foreground">started:</span> {formatDate(job.startedAt)}</div>
                                                        <div><span className="text-muted-foreground">completed:</span> {formatDate(job.completedAt)}</div>
                                                        <div><span className="text-muted-foreground">runtime:</span> {runtimeMs ? formatAge(runtimeMs) : '—'}</div>
                                                        <div><span className="text-muted-foreground">attempts:</span> {job.attempts}/{job.maxAttempts}</div>
                                                    </div>
                                                    {job.articleId && (
                                                        <div className="text-[11px]">
                                                            <span className="text-muted-foreground">article:</span>{' '}
                                                            <Link href={`/dashboard/content/articles/${job.articleId}`} className="text-blue-600 hover:underline">
                                                                {job.articleId}
                                                            </Link>
                                                        </div>
                                                    )}
                                                    {payloadResearch && (
                                                        <div className="text-[11px]">
                                                            <span className="text-muted-foreground">domain research:</span>{' '}
                                                            <Link href={`/dashboard/acquisition?q=${encodeURIComponent(payloadResearch.domain)}`} className="text-blue-600 hover:underline">
                                                                {payloadResearch.id}
                                                            </Link>
                                                        </div>
                                                    )}
                                                    {job.errorMessage && (
                                                        <div>
                                                            <p className="text-[11px] font-medium text-red-700">Error</p>
                                                            <pre className="max-h-20 overflow-auto whitespace-pre-wrap text-[11px] text-red-700">{job.errorMessage}</pre>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-[11px] font-medium">Runbook</p>
                                                        <p className="text-[11px] text-muted-foreground">{runbook.summary}</p>
                                                        <p className="text-[11px] text-muted-foreground">Checks: {runbook.checks}</p>
                                                        <p className="text-[11px] text-muted-foreground">Fix: {runbook.remediation}</p>
                                                        <Link
                                                            href={`/dashboard/queue?preset=failures&jobTypes=${encodeURIComponent(job.jobType)}`}
                                                            className="text-[11px] text-blue-600 hover:underline"
                                                        >
                                                            Open all failed {job.jobType} jobs
                                                        </Link>
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-medium">Payload</p>
                                                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px]">{formatJsonPreview(job.payload)}</pre>
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-medium">Result</p>
                                                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[11px]">{formatJsonPreview(job.result)}</pre>
                                                    </div>
                                                </div>
                                            </details>
                                        </td>
                                        <td className="p-3">
                                            {(status === 'pending' || status === 'processing') && (
                                                <form action={cancelJobAction}>
                                                    <input type="hidden" name="jobId" value={job.id} />
                                                    <button type="submit" className="text-xs text-red-600 hover:underline">
                                                        Cancel
                                                    </button>
                                                </form>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    const colorMap: Record<string, string> = {
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        green: 'bg-green-50 text-green-700 border-green-200',
        red: 'bg-red-50 text-red-700 border-red-200',
    };
    return (
        <div className={`rounded-lg border p-4 ${colorMap[color] || ''}`}>
            <p className="text-sm opacity-70">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        pending: 'bg-yellow-100 text-yellow-800',
        processing: 'bg-blue-100 text-blue-800',
        completed: 'bg-green-100 text-green-800',
        failed: 'bg-red-100 text-red-800',
        cancelled: 'bg-gray-100 text-gray-800',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
            {status}
        </span>
    );
}
