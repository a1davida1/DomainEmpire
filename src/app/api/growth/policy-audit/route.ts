import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, domainResearch, promotionCampaigns, promotionEvents } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

type GrowthChannel = 'pinterest' | 'youtube_shorts';

const QUERY_CAP = 5001;
const POLICY_EVENT_TYPES = ['published', 'publish_blocked'] as const;

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

function readStringArray(value: Record<string, unknown>, key: string): string[] {
    const raw = value[key];
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function normalizeChannel(value: string | null): GrowthChannel | null {
    if (value === 'pinterest' || value === 'youtube_shorts') return value;
    return null;
}

function incrementCounter(counter: Record<string, number>, key: string): void {
    counter[key] = (counter[key] || 0) + 1;
}

function parseWindowHours(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 24 * 7;
    return Math.max(6, Math.min(parsed, 24 * 30));
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

    try {
        const url = new URL(request.url);
        const windowHours = parseWindowHours(url.searchParams.get('windowHours'));
        const now = new Date();
        const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

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
            .where(and(
                gte(promotionEvents.occurredAt, windowStart),
                inArray(promotionEvents.eventType, POLICY_EVENT_TYPES),
            ))
            .orderBy(desc(promotionEvents.occurredAt))
            .limit(QUERY_CAP);

        const truncated = rows.length >= QUERY_CAP;

        let publishedCount = 0;
        let blockedCount = 0;
        let warningEventCount = 0;
        let changedEventCount = 0;
        const blockReasonCounts: Record<string, number> = {};
        const warningCounts: Record<string, number> = {};
        const policyPackCounts: Record<string, number> = {};
        const byChannel: Record<GrowthChannel, {
            evaluated: number;
            published: number;
            blocked: number;
            warningEvents: number;
            changedEvents: number;
        }> = {
            pinterest: {
                evaluated: 0,
                published: 0,
                blocked: 0,
                warningEvents: 0,
                changedEvents: 0,
            },
            youtube_shorts: {
                evaluated: 0,
                published: 0,
                blocked: 0,
                warningEvents: 0,
                changedEvents: 0,
            },
        };

        const recent = rows.slice(0, 50).map((row) => {
            const attributes = asRecord(row.attributes);
            const channel = normalizeChannel(readString(attributes, 'channel'));
            const warnings = readStringArray(attributes, 'policyWarnings');
            const blockReasons = readStringArray(attributes, 'blockReasons');
            const changes = readStringArray(attributes, 'policyChanges');
            const policyPackId = readString(attributes, 'policyPackId');
            const policyPackVersion = readString(attributes, 'policyPackVersion');

            return {
                campaignId: row.campaignId,
                domain: row.domain,
                eventType: row.eventType,
                channel,
                warnings,
                blockReasons,
                changes,
                policyPackId,
                policyPackVersion,
                occurredAt: row.occurredAt?.toISOString() ?? null,
            };
        });

        for (const row of rows) {
            const attributes = asRecord(row.attributes);
            const channel = normalizeChannel(readString(attributes, 'channel'));
            const warnings = readStringArray(attributes, 'policyWarnings');
            const blockReasons = readStringArray(attributes, 'blockReasons');
            const changes = readStringArray(attributes, 'policyChanges');
            const policyPackId = readString(attributes, 'policyPackId');

            if (row.eventType === 'published') {
                publishedCount += 1;
            } else if (row.eventType === 'publish_blocked') {
                blockedCount += 1;
            }

            if (warnings.length > 0) {
                warningEventCount += 1;
            }
            if (changes.length > 0) {
                changedEventCount += 1;
            }
            for (const warning of warnings) {
                incrementCounter(warningCounts, warning);
            }
            for (const blockReason of blockReasons) {
                incrementCounter(blockReasonCounts, blockReason);
            }
            if (policyPackId) {
                incrementCounter(policyPackCounts, policyPackId);
            }

            if (channel) {
                byChannel[channel].evaluated += 1;
                if (row.eventType === 'published') {
                    byChannel[channel].published += 1;
                } else if (row.eventType === 'publish_blocked') {
                    byChannel[channel].blocked += 1;
                }
                if (warnings.length > 0) {
                    byChannel[channel].warningEvents += 1;
                }
                if (changes.length > 0) {
                    byChannel[channel].changedEvents += 1;
                }
            }
        }

        return NextResponse.json({
            windowHours,
            evaluatedCount: publishedCount + blockedCount,
            publishedCount,
            blockedCount,
            warningEventCount,
            changedEventCount,
            blockReasonCounts,
            warningCounts,
            policyPackCounts,
            byChannel,
            recent,
            truncated,
            generatedAt: now.toISOString(),
        });
    } catch (error) {
        console.error('Failed to load growth policy audit:', error);
        return NextResponse.json(
            { error: 'Failed to load growth policy audit' },
            { status: 500 },
        );
    }
}
