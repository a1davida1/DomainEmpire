import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { db, domainChannelProfiles, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';

const channelEnum = z.enum(['pinterest', 'youtube_shorts']);
const compatibilityEnum = z.enum(['supported', 'limited', 'blocked']);

const CHANNELS = channelEnum.options;

const profileUpdateSchema = z.object({
    channel: channelEnum,
    enabled: z.boolean().optional(),
    compatibility: compatibilityEnum.optional(),
    accountRef: z.string().max(255).optional().nullable(),
    dailyCap: z.number().int().min(1).max(200).optional().nullable(),
    quietHoursStart: z.number().int().min(0).max(23).optional().nullable(),
    quietHoursEnd: z.number().int().min(0).max(23).optional().nullable(),
    minJitterMinutes: z.number().int().min(0).max(24 * 60).optional(),
    maxJitterMinutes: z.number().int().min(0).max(24 * 60).optional(),
    notes: z.string().max(4000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

const putSchema = z.object({
    profiles: z.array(profileUpdateSchema).min(1).max(CHANNELS.length),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

type Channel = z.infer<typeof channelEnum>;
type Compatibility = z.infer<typeof compatibilityEnum>;

type DomainChannelProfileRow = typeof domainChannelProfiles.$inferSelect;

interface ResolvedChannelProfile {
    id: string | null;
    domainId: string;
    channel: Channel;
    enabled: boolean;
    compatibility: Compatibility;
    accountRef: string | null;
    dailyCap: number | null;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
    minJitterMinutes: number;
    maxJitterMinutes: number;
    notes: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date | null;
    updatedAt: Date | null;
}

function normalizeText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return value ?? null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function defaultProfile(domainId: string, channel: Channel): ResolvedChannelProfile {
    return {
        id: null,
        domainId,
        channel,
        enabled: true,
        compatibility: 'supported',
        accountRef: null,
        dailyCap: null,
        quietHoursStart: 23,
        quietHoursEnd: 6,
        minJitterMinutes: 15,
        maxJitterMinutes: 90,
        notes: null,
        metadata: {},
        createdAt: null,
        updatedAt: null,
    };
}

function resolveProfiles(
    domainId: string,
    rows: DomainChannelProfileRow[],
): ResolvedChannelProfile[] {
    const byChannel = new Map<Channel, DomainChannelProfileRow>();
    for (const row of rows) {
        byChannel.set(row.channel as Channel, row);
    }

    return CHANNELS.map((channel) => {
        const row = byChannel.get(channel as Channel);
        if (!row) {
            return defaultProfile(domainId, channel as Channel);
        }

        const baseline = defaultProfile(domainId, channel as Channel);
        return {
            ...baseline,
            ...row,
            channel: row.channel as Channel,
            compatibility: row.compatibility as Compatibility,
            accountRef: row.accountRef ?? null,
            dailyCap: row.dailyCap ?? null,
            quietHoursStart: row.quietHoursStart ?? null,
            quietHoursEnd: row.quietHoursEnd ?? null,
            notes: row.notes ?? null,
            metadata: (row.metadata ?? {}) as Record<string, unknown>,
            minJitterMinutes: row.minJitterMinutes ?? baseline.minJitterMinutes,
            maxJitterMinutes: row.maxJitterMinutes ?? baseline.maxJitterMinutes,
        };
    });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid domain id' }, { status: 400 });
        }

        const [domain] = await db
            .select({ id: domains.id })
            .from(domains)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!domain) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const rows = await db
            .select()
            .from(domainChannelProfiles)
            .where(and(
                eq(domainChannelProfiles.domainId, id),
                inArray(domainChannelProfiles.channel, CHANNELS),
            ));

        return NextResponse.json({
            profiles: resolveProfiles(id, rows),
        });
    } catch (error) {
        console.error('Failed to read channel compatibility profiles:', error);
        return NextResponse.json(
            { error: 'Failed to read channel compatibility profiles' },
            { status: 500 },
        );
    }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid domain id' }, { status: 400 });
        }

        const [domain] = await db
            .select({ id: domains.id })
            .from(domains)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!domain) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const parsed = putSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const deduped = new Map<Channel, z.infer<typeof profileUpdateSchema>>();
        for (const profile of parsed.data.profiles) {
            deduped.set(profile.channel, profile);
        }

        const existingRows = await db
            .select()
            .from(domainChannelProfiles)
            .where(and(
                eq(domainChannelProfiles.domainId, id),
                inArray(domainChannelProfiles.channel, [...deduped.keys()]),
            ));
        const existingByChannel = new Map<Channel, DomainChannelProfileRow>();
        for (const row of existingRows) {
            existingByChannel.set(row.channel as Channel, row);
        }

        for (const [channel, patch] of deduped.entries()) {
            const baseline = existingByChannel.get(channel) ?? defaultProfile(id, channel);
            const minJitterMinutes = patch.minJitterMinutes ?? baseline.minJitterMinutes;
            const maxJitterMinutes = patch.maxJitterMinutes ?? baseline.maxJitterMinutes;

            if (maxJitterMinutes < minJitterMinutes) {
                return NextResponse.json(
                    { error: `maxJitterMinutes must be >= minJitterMinutes for ${channel}` },
                    { status: 400 },
                );
            }

            const metadata = patch.metadata ?? (baseline.metadata as Record<string, unknown>) ?? {};

            const resolvedAccountRef = normalizeText(patch.accountRef !== undefined ? patch.accountRef : baseline.accountRef);
            const resolvedDailyCap = patch.dailyCap !== undefined ? patch.dailyCap : (baseline.dailyCap ?? null);
            const resolvedQuietStart = patch.quietHoursStart !== undefined ? patch.quietHoursStart : (baseline.quietHoursStart ?? null);
            const resolvedQuietEnd = patch.quietHoursEnd !== undefined ? patch.quietHoursEnd : (baseline.quietHoursEnd ?? null);
            const resolvedNotes = normalizeText(patch.notes !== undefined ? patch.notes : baseline.notes);
            const resolvedEnabled = patch.enabled ?? baseline.enabled;
            const resolvedCompatibility = patch.compatibility ?? baseline.compatibility;

            await db.insert(domainChannelProfiles).values({
                domainId: id,
                channel,
                enabled: resolvedEnabled,
                compatibility: resolvedCompatibility,
                accountRef: resolvedAccountRef,
                dailyCap: resolvedDailyCap,
                quietHoursStart: resolvedQuietStart,
                quietHoursEnd: resolvedQuietEnd,
                minJitterMinutes,
                maxJitterMinutes,
                notes: resolvedNotes,
                metadata,
                updatedAt: new Date(),
            }).onConflictDoUpdate({
                target: [domainChannelProfiles.domainId, domainChannelProfiles.channel],
                set: {
                    enabled: resolvedEnabled,
                    compatibility: resolvedCompatibility,
                    accountRef: resolvedAccountRef,
                    dailyCap: resolvedDailyCap,
                    quietHoursStart: resolvedQuietStart,
                    quietHoursEnd: resolvedQuietEnd,
                    minJitterMinutes,
                    maxJitterMinutes,
                    notes: resolvedNotes,
                    metadata,
                    updatedAt: new Date(),
                },
            });
        }

        const rows = await db
            .select()
            .from(domainChannelProfiles)
            .where(and(
                eq(domainChannelProfiles.domainId, id),
                inArray(domainChannelProfiles.channel, CHANNELS),
            ));

        return NextResponse.json({
            success: true,
            profiles: resolveProfiles(id, rows),
        });
    } catch (error) {
        console.error('Failed to update channel compatibility profiles:', error);
        return NextResponse.json(
            { error: 'Failed to update channel compatibility profiles' },
            { status: 500 },
        );
    }
}
