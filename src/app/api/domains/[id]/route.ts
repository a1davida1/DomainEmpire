import { NextRequest, NextResponse } from 'next/server';
import { db, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { notDeleted, softDeleteDomain } from '@/lib/db/soft-delete';

const SITE_TEMPLATE_VALUES = [
    'authority', 'comparison', 'calculator', 'review', 'tool', 'hub',
    'decision', 'cost_guide', 'niche', 'info', 'consumer', 'brand',
    'magazine', 'landing', 'docs', 'storefront', 'minimal', 'dashboard',
    'newsletter', 'community',
] as const;

const contentConfigSchema = z.object({
    voiceSeed: z.object({
        name: z.string(),
        background: z.string(),
        quirk: z.string(),
        toneDial: z.number(),
        tangents: z.string(),
        petPhrase: z.string(),
        formatting: z.string(),
    }).optional(),
    schedule: z.object({
        frequency: z.enum(['daily', 'weekly', 'sporadic']),
        timeOfDay: z.enum(['morning', 'evening', 'random']),
        wordCountRange: z.tuple([z.number().int().min(200), z.number().int().max(10000)]).refine(([min, max]) => min <= max, { message: 'min must be <= max' }),
    }).optional(),
    contentTypeMix: z.record(z.string(), z.number().min(0)).optional(),
    writingWorkflow: z.object({
        outlineTemplate: z.string().optional(),
        draftTemplate: z.string().optional(),
        humanizeTemplate: z.string().optional(),
        seoTemplate: z.string().optional(),
        metaTemplate: z.string().optional(),
        reviewTemplate: z.string().optional(),
    }).optional(),
    branding: z.object({
        colorScheme: z.string().optional(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        typographyPreset: z.string().optional(),
    }).optional(),
}).strict();

type DomainContentConfig = NonNullable<typeof domains.$inferInsert['contentConfig']>;

function toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

function mergeContentConfig(currentValue: unknown, incomingValue: DomainContentConfig): DomainContentConfig {
    const current = toRecord(currentValue);
    const incoming = toRecord(incomingValue);
    const merged: Record<string, unknown> = {
        ...current,
        ...incoming,
    };

    for (const key of ['voiceSeed', 'schedule', 'contentTypeMix', 'writingWorkflow', 'branding']) {
        if (!(key in incoming)) continue;
        const currentNested = toRecord(current[key]);
        const incomingNested = incoming[key];
        if (incomingNested && typeof incomingNested === 'object' && !Array.isArray(incomingNested)) {
            merged[key] = { ...currentNested, ...(incomingNested as Record<string, unknown>) };
            continue;
        }
        merged[key] = incomingNested;
    }

    return merged as DomainContentConfig;
}

// Validation schema for updating a domain
const updateDomainSchema = z.object({
    registrar: z.enum(['godaddy', 'namecheap', 'cloudflare', 'other']).optional(),
    purchasePrice: z.number().optional(),
    purchaseDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    renewalDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    renewalPrice: z.number().optional(),
    status: z.enum(['parked', 'active', 'redirect', 'forsale', 'defensive']).optional(),
    bucket: z.enum(['build', 'redirect', 'park', 'defensive']).optional(),
    tier: z.number().min(1).max(3).optional(),
    niche: z.string().optional(),
    subNiche: z.string().optional(),
    siteTemplate: z.enum(SITE_TEMPLATE_VALUES).optional(),
    vertical: z.string().optional(),
    cloudflareAccount: z.string().optional(),
    themeStyle: z.string().optional(),
    monetizationModel: z.string().optional(),
    monetizationTier: z.number().int().min(1).max(4).optional(),
    contentConfig: contentConfigSchema.optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    redirectTargetId: z.string().uuid().optional().nullable(),
    githubRepo: z.string().optional(),
    cloudflareProject: z.string().optional(),
}).partial();

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/domains/[id] - Get a single domain
export async function GET(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;

        const result = await db
            .select()
            .from(domains)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ domain: result[0] });
    } catch (error) {
        console.error('Failed to fetch domain:', error);
        return NextResponse.json(
            { error: 'Failed to fetch domain' },
            { status: 500 }
        );
    }
}

// PATCH /api/domains/[id] - Update a domain
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;

        // Parse JSON with explicit error handling
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Invalid JSON in request body' },
                { status: 400 }
            );
        }

        const validationResult = updateDomainSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: validationResult.error.flatten() },
                { status: 400 }
            );
        }

        const data = validationResult.data;

        const existing = await db
            .select({
                id: domains.id,
                contentConfig: domains.contentConfig,
            })
            .from(domains)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            );
        }

        const updatePayload: Partial<typeof domains.$inferInsert> & { updatedAt: Date } = {
            ...data,
            updatedAt: new Date(),
        };
        if (data.contentConfig) {
            updatePayload.contentConfig = mergeContentConfig(existing[0].contentConfig, data.contentConfig);
        }

        const updated = await db
            .update(domains)
            .set(updatePayload)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .returning();

        if (updated.length === 0) {
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ domain: updated[0] });
    } catch (error) {
        console.error('Failed to update domain:', error);
        return NextResponse.json(
            { error: 'Failed to update domain' },
            { status: 500 }
        );
    }
}

// DELETE /api/domains/[id] - Soft-delete a domain (and cascade to articles)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;

        const { domain } = await softDeleteDomain(id);

        if (!domain) {
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Domain ${domain} deleted`,
            restorable: true,
        });
    } catch (error) {
        console.error('Failed to delete domain:', error);
        return NextResponse.json(
            { error: 'Failed to delete domain' },
            { status: 500 }
        );
    }
}
