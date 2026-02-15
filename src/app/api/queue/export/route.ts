import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth';
import { articles, contentQueue, db, domains } from '@/lib/db';
import { getOperationsSettings } from '@/lib/settings/operations';

const QUEUE_STATUS_VALUES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const;
type QueueStatus = (typeof QUEUE_STATUS_VALUES)[number];
const QUEUE_SLA_FILTER_VALUES = ['all', 'ok', 'breached'] as const;
type QueueSlaFilter = (typeof QUEUE_SLA_FILTER_VALUES)[number];
type QueuePreset = 'none' | 'failures' | 'stalled' | 'deploy' | 'acquisition';

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isQueueStatus(value: string | null): value is QueueStatus {
    return !!value && (QUEUE_STATUS_VALUES as readonly string[]).includes(value);
}

function isQueueSlaFilter(value: string | null): value is QueueSlaFilter {
    return !!value && (QUEUE_SLA_FILTER_VALUES as readonly string[]).includes(value);
}

function isQueuePreset(value: string | null): value is Exclude<QueuePreset, 'none'> {
    return value === 'failures' || value === 'stalled' || value === 'deploy' || value === 'acquisition';
}

function toStringValue(value: string | null): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseJobTypes(values: string[]): string[] {
    return [...new Set(
        values
            .flatMap((value) => value.split(','))
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
    )];
}

function isDefined<T>(value: T | undefined): value is T {
    return value !== undefined;
}

function parseExportLimit(rawValue: string | null): number {
    const parsed = Number.parseInt(rawValue ?? '1000', 10);
    if (!Number.isFinite(parsed)) return 1000;
    return Math.max(1, Math.min(parsed, 5000));
}

function extractPayloadDomain(payload: unknown): string | null {
    if (!isRecord(payload)) return null;
    const direct = toStringValue(typeof payload.domain === 'string' ? payload.domain : null)
        || toStringValue(typeof payload.domainName === 'string' ? payload.domainName : null);
    if (direct) return direct.toLowerCase();

    const candidate = payload.candidate;
    if (isRecord(candidate)) {
        const candidateDomain = toStringValue(typeof candidate.domain === 'string' ? candidate.domain : null);
        if (candidateDomain) return candidateDomain.toLowerCase();
    }

    return null;
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
        const value = payload[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return `${key}: ${value.trim()}`;
        }
    }

    const candidate = payload.candidate;
    if (isRecord(candidate)) {
        const listingId = candidate.listingId;
        if (typeof listingId === 'string' && listingId.trim().length > 0) {
            return `listingId: ${listingId.trim()}`;
        }
    }

    const list = payload.candidates;
    if (Array.isArray(list)) {
        return `candidates: ${list.length}`;
    }

    return null;
}

function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '""';
    const stringified = String(value);
    return `"${stringified.replace(/"/g, '""')}"`;
}

function formatDate(value: Date | null): string {
    return value ? value.toISOString() : '';
}

// GET /api/queue/export - Export filtered queue jobs as CSV
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const url = new URL(request.url);
        const search = url.searchParams;

        const presetParam = toStringValue(search.get('preset'));
        const preset: QueuePreset = isQueuePreset(presetParam) ? presetParam : 'none';
        const rawStatus = search.get('status');
        const statusFilter = isQueueStatus(rawStatus) ? rawStatus : 'all' as const;
        const rawSla = search.get('sla');
        const slaFilter: QueueSlaFilter = isQueueSlaFilter(rawSla) ? rawSla : 'all';
        const selectedJobTypes = parseJobTypes(search.getAll('jobTypes'));
        const domainIdFilter = toStringValue(search.get('domainId'));
        const queryFilter = toStringValue(search.get('q'));
        const exportLimit = parseExportLimit(search.get('exportLimit'));
        const queryPattern = queryFilter ? `%${queryFilter}%` : null;
        const operationsSettings = await getOperationsSettings();
        const pendingSlaMinutes = operationsSettings.queuePendingSlaMinutes;
        const processingSlaMinutes = operationsSettings.queueProcessingSlaMinutes;

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
        const queueRows = await db.select().from(contentQueue).where(whereClause).orderBy(desc(contentQueue.createdAt)).limit(exportLimit);

        const articleIds = [...new Set(queueRows
            .map((row) => row.articleId)
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

        const domainIds = new Set<string>();
        for (const row of queueRows) {
            if (row.domainId) domainIds.add(row.domainId);
            if (row.articleId) {
                const linkedArticle = articleMap.get(row.articleId);
                if (linkedArticle?.domainId) domainIds.add(linkedArticle.domainId);
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

        const headers = [
            'id',
            'jobType',
            'status',
            'attempts',
            'maxAttempts',
            'domain',
            'domainSource',
            'domainId',
            'articleId',
            'target',
            'errorMessage',
            'apiCost',
            'createdAt',
            'scheduledFor',
            'startedAt',
            'completedAt',
            'runtimeMs',
        ];

        const lines = [headers.map(csvCell).join(',')];
        for (const row of queueRows) {
            const linkedArticle = row.articleId ? articleMap.get(row.articleId) : undefined;
            const directDomain = row.domainId ? domainMap.get(row.domainId) : null;
            const articleDomain = linkedArticle?.domainId ? domainMap.get(linkedArticle.domainId) : null;
            const payloadDomain = extractPayloadDomain(row.payload);
            const resolvedDomain = directDomain || articleDomain || payloadDomain || '';
            const resolvedDomainId = row.domainId || linkedArticle?.domainId || '';
            const domainSource = directDomain
                ? 'domain_id'
                : articleDomain
                    ? 'article'
                    : payloadDomain
                        ? 'payload'
                        : '';
            const target = linkedArticle?.targetKeyword
                || extractPayloadTarget(row.payload)
                || linkedArticle?.title
                || '';
            const runtimeMs = row.startedAt && row.completedAt
                ? Math.max(row.completedAt.getTime() - row.startedAt.getTime(), 0)
                : '';

            const values = [
                row.id,
                row.jobType,
                row.status ?? '',
                row.attempts ?? '',
                row.maxAttempts ?? '',
                resolvedDomain,
                domainSource,
                resolvedDomainId,
                row.articleId ?? '',
                target,
                row.errorMessage ?? '',
                row.apiCost ?? '',
                formatDate(row.createdAt ?? null),
                formatDate(row.scheduledFor ?? null),
                formatDate(row.startedAt ?? null),
                formatDate(row.completedAt ?? null),
                runtimeMs,
            ];

            lines.push(values.map(csvCell).join(','));
        }

        const csv = lines.join('\n');
        const dateStamp = new Date().toISOString().slice(0, 10);
        const fileName = `queue-export-${dateStamp}.csv`;

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        console.error('Queue export failed:', error);
        return NextResponse.json(
            { error: 'Failed to export queue jobs' },
            { status: 500 },
        );
    }
}
