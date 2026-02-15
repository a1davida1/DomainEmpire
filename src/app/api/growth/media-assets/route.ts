import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, mediaAssets } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

const assetTypeEnum = z.enum(['image', 'video', 'script', 'voiceover']);
const sortEnum = z.enum(['newest', 'oldest', 'most_used', 'least_used']);
const moderationStatusEnum = z.enum(['pending', 'approved', 'rejected', 'needs_changes']);
const provenanceSourceEnum = z.enum(['manual_upload', 'external_url', 'ai_generated', 'worker', 'imported', 'migrated']);

const createAssetSchema = z.object({
    type: assetTypeEnum,
    url: z.string().url().max(4096),
    folder: z.string().trim().min(1).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    dedupeByUrl: z.boolean().optional(),
    provenanceSource: provenanceSourceEnum.optional(),
    provenanceRef: z.string().trim().min(1).max(500).optional(),
    moderationStatus: moderationStatusEnum.optional(),
    moderationReason: z.string().trim().min(1).max(500).optional(),
});

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return { ...value };
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
        const pageParam = Number.parseInt(url.searchParams.get('page') || '1', 10);
        const limitParam = Number.parseInt(url.searchParams.get('limit') || '50', 10);
        const page = Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1;
        const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 200)) : 50;
        const offset = (page - 1) * limit;

        const typeRaw = url.searchParams.get('type');
        const folderRaw = url.searchParams.get('folder');
        const searchRaw = url.searchParams.get('search');
        const moderationStatusRaw = url.searchParams.get('moderationStatus');
        const provenanceSourceRaw = url.searchParams.get('provenanceSource');
        const sortRaw = url.searchParams.get('sort');
        const sort = sortEnum.safeParse(sortRaw).success ? sortEnum.parse(sortRaw) : 'newest';

        const conditions: SQL[] = [eq(mediaAssets.userId, user.id)];
        if (typeRaw) {
            const parsedType = assetTypeEnum.safeParse(typeRaw);
            if (!parsedType.success) {
                return NextResponse.json({ error: 'Invalid type filter' }, { status: 400 });
            }
            conditions.push(eq(mediaAssets.type, parsedType.data));
        }
        if (folderRaw && folderRaw.trim().length > 0) {
            conditions.push(eq(mediaAssets.folder, folderRaw.trim()));
        }
        if (moderationStatusRaw) {
            const parsedModerationStatus = moderationStatusEnum.safeParse(moderationStatusRaw);
            if (!parsedModerationStatus.success) {
                return NextResponse.json({ error: 'Invalid moderationStatus filter' }, { status: 400 });
            }
            conditions.push(sql`${mediaAssets.metadata} ->> 'moderationStatus' = ${parsedModerationStatus.data}`);
        }
        if (provenanceSourceRaw) {
            const parsedProvenanceSource = provenanceSourceEnum.safeParse(provenanceSourceRaw);
            if (!parsedProvenanceSource.success) {
                return NextResponse.json({ error: 'Invalid provenanceSource filter' }, { status: 400 });
            }
            conditions.push(sql`${mediaAssets.metadata} ->> 'provenanceSource' = ${parsedProvenanceSource.data}`);
        }
        if (searchRaw && searchRaw.trim().length > 0) {
            const pattern = `%${searchRaw.trim()}%`;
            conditions.push(sql`${mediaAssets.url} ILIKE ${pattern}`);
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const orderByClause = (() => {
            if (sort === 'oldest') return [asc(mediaAssets.createdAt)] as const;
            if (sort === 'most_used') return [desc(mediaAssets.usageCount), desc(mediaAssets.createdAt)] as const;
            if (sort === 'least_used') return [asc(mediaAssets.usageCount), desc(mediaAssets.createdAt)] as const;
            return [desc(mediaAssets.createdAt)] as const;
        })();

        const listQuery = whereClause
            ? db.select().from(mediaAssets).where(whereClause)
            : db.select().from(mediaAssets);
        const rows = await listQuery
            .orderBy(...orderByClause)
            .limit(limit)
            .offset(offset);

        const totalRows = whereClause
            ? await db.select({ value: count() }).from(mediaAssets).where(whereClause)
            : await db.select({ value: count() }).from(mediaAssets);
        const total = Number(totalRows[0]?.value ?? 0);

        return NextResponse.json({
            page,
            limit,
            total,
            assets: rows,
        });
    } catch (error) {
        console.error('Failed to list media assets:', error);
        return NextResponse.json(
            { error: 'Failed to list media assets' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
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
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const parsed = createAssetSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const dedupeByUrl = payload.dedupeByUrl ?? true;
        const nowIso = new Date().toISOString();
        const metadata = asMetadata(payload.metadata);

        const insertValues = {
            userId: user.id,
            type: payload.type,
            url: payload.url,
            folder: payload.folder ?? 'inbox',
            tags: payload.tags ?? [],
            metadata: {
                ...metadata,
                createdBy: user.id,
                createdAt: nowIso,
                provenanceSource: payload.provenanceSource ?? 'manual_upload',
                provenanceRef: payload.provenanceRef ?? null,
                moderationStatus: payload.moderationStatus ?? 'pending',
                moderationReason: payload.moderationReason ?? null,
                moderationUpdatedAt: nowIso,
                moderationUpdatedBy: user.id,
            },
        };

        if (dedupeByUrl) {
            const result = await db.transaction(async (tx) => {
                const [inserted] = await tx.insert(mediaAssets)
                    .values(insertValues)
                    .onConflictDoNothing({ target: mediaAssets.url })
                    .returning();

                if (inserted) {
                    return { created: true, asset: inserted };
                }

                // URL unique constraint is global (not per-user), so lookup must match
                const [existing] = await tx.select()
                    .from(mediaAssets)
                    .where(eq(mediaAssets.url, payload.url))
                    .limit(1);
                return { created: false, asset: existing ?? null };
            });

            if (result.created) {
                return NextResponse.json({
                    created: true,
                    asset: result.asset,
                }, { status: 201 });
            }

            return NextResponse.json({
                created: false,
                asset: result.asset,
            });
        }

        const [asset] = await db.insert(mediaAssets)
            .values(insertValues)
            .returning();

        return NextResponse.json({
            created: true,
            asset,
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to create media asset:', error);
        return NextResponse.json(
            { error: 'Failed to create media asset' },
            { status: 500 },
        );
    }
}
