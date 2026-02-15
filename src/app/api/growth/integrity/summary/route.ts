import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, type SQL } from 'drizzle-orm';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, domainResearch, promotionCampaigns, promotionEvents } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import {
    evaluatePromotionIntegrityAlert,
    summarizePromotionIntegrity,
} from '@/lib/growth/integrity';

const QUERY_CAP = 5000;
const INTEGRITY_EVENT_TYPES = ['published', 'publish_blocked'] as const;
const integritySummaryLimiter = createRateLimiter('growth_integrity_summary', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, key: string): string | null {
    const raw = value[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function readNumber(value: Record<string, unknown>, key: string): number | null {
    const raw = value[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const parsed = Number.parseFloat(raw);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function readStringArray(value: Record<string, unknown>, key: string): string[] {
    const raw = value[key];
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function parseWindowHours(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 24 * 7;
    return Math.max(6, Math.min(parsed, 24 * 30));
}

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseInt(process.env[name] || '', 10);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

function parseEnvFloat(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseFloat(process.env[name] || '');
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    const rate = integritySummaryLimiter(`${user.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many integrity summary requests. Please retry shortly.' },
            {
                status: 429,
                headers: rate.headers,
            },
        );
    }

    try {
        const url = new URL(request.url);
        const windowHours = parseWindowHours(url.searchParams.get('windowHours'));
        const campaignId = url.searchParams.get('campaignId');
        const domain = url.searchParams.get('domain');
        const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

        const conditions: SQL[] = [
            gte(promotionEvents.occurredAt, windowStart),
            inArray(promotionEvents.eventType, INTEGRITY_EVENT_TYPES),
        ];
        if (campaignId) {
            conditions.push(eq(promotionEvents.campaignId, campaignId));
        }
        if (domain) {
            conditions.push(eq(domainResearch.domain, domain.trim().toLowerCase()));
        }

        const rows = await db.select({
            campaignId: promotionEvents.campaignId,
            eventType: promotionEvents.eventType,
            occurredAt: promotionEvents.occurredAt,
            attributes: promotionEvents.attributes,
            domain: domainResearch.domain,
        })
            .from(promotionEvents)
            .innerJoin(promotionCampaigns, eq(promotionEvents.campaignId, promotionCampaigns.id))
            .innerJoin(domainResearch, eq(promotionCampaigns.domainResearchId, domainResearch.id))
            .where(and(...conditions))
            .orderBy(desc(promotionEvents.occurredAt))
            .limit(QUERY_CAP + 1);

        const truncated = rows.length > QUERY_CAP;
        const boundedRows = truncated ? rows.slice(0, QUERY_CAP) : rows;

        const summary = summarizePromotionIntegrity(boundedRows.map((row) => ({
            eventType: row.eventType,
            occurredAt: row.occurredAt,
            attributes: row.attributes,
        })));

        const integrityAlert = evaluatePromotionIntegrityAlert(summary, {
            blockedDestinationThreshold: parseEnvInt('GROWTH_INTEGRITY_BLOCKED_DESTINATION_THRESHOLD', 4, 1, 100),
            highRiskPublishedThreshold: parseEnvInt('GROWTH_INTEGRITY_HIGH_RISK_PUBLISHED_THRESHOLD', 3, 1, 100),
            hostConcentrationThreshold: parseEnvFloat('GROWTH_INTEGRITY_HOST_CONCENTRATION_THRESHOLD', 0.8, 0.5, 0.99),
            hostConcentrationMinSamples: parseEnvInt('GROWTH_INTEGRITY_HOST_CONCENTRATION_MIN_SAMPLES', 8, 3, 500),
        });

        const recent = boundedRows.slice(0, 50).map((row) => {
            const attributes = asRecord(row.attributes);
            return {
                campaignId: row.campaignId,
                domain: row.domain,
                eventType: row.eventType,
                occurredAt: row.occurredAt?.toISOString() ?? null,
                channel: readString(attributes, 'channel'),
                destinationUrl: readString(attributes, 'destinationUrl'),
                destinationHost: readString(attributes, 'destinationHost'),
                destinationRiskScore: readNumber(attributes, 'destinationRiskScore'),
                blockReasons: readStringArray(attributes, 'blockReasons'),
                policyWarnings: readStringArray(attributes, 'policyWarnings'),
            };
        });

        return NextResponse.json({
            windowHours,
            campaignId,
            domain,
            summary,
            alert: integrityAlert,
            recent,
            truncated,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to load growth integrity summary:', error);
        return NextResponse.json(
            { error: 'Failed to load growth integrity summary' },
            { status: 500 },
        );
    }
}
