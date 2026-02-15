import { NextRequest, NextResponse } from 'next/server';
import { db, domains, NewDomain } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, ilike, and, sql, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { checkIdempotencyKey, storeIdempotencyResult } from '@/lib/api/idempotency';
import { DOMAIN_LIFECYCLE_STATES } from '@/lib/domain/lifecycle';
import { classifyAndUpdateDomain } from '@/lib/ai/classify-domain';

function escapeIlikePattern(value: string): string {
    return value.replace(/[%_\\]/g, (ch) => '\\' + ch);
}

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
});

// Validation schema for creating a domain
const createDomainSchema = z.object({
    domain: z.string().min(1).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i, 'Invalid domain format'),
    registrar: z.enum(['godaddy', 'namecheap', 'cloudflare', 'other']).optional().default('godaddy'),
    purchasePrice: z.number().optional(),
    purchaseDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    renewalDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    renewalPrice: z.number().optional(),
    status: z.enum(['parked', 'active', 'redirect', 'forsale', 'defensive']).optional().default('parked'),
    lifecycleState: z.enum(DOMAIN_LIFECYCLE_STATES).optional().default('sourced'),
    bucket: z.enum(['build', 'redirect', 'park', 'defensive']).optional().default('build'), // Strategy
    tier: z.number().min(1).max(3).optional().default(3),
    niche: z.string().optional(),
    subNiche: z.string().optional(),
    vertical: z.string().optional(), // Legal, Insurance, etc.
    monetizationTier: z.number().min(1).max(4).optional().default(3),
    siteTemplate: z.enum(SITE_TEMPLATE_VALUES).optional().default('authority'),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
    cloudflareAccount: z.string().optional(),
    themeStyle: z.string().optional(),
    monetizationModel: z.string().optional(),
    estimatedRevenueAtMaturity: z.string().optional(),
    contentConfig: contentConfigSchema.optional(),
});

function isMissingLifecycleStateColumn(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const code = 'code' in error ? String(error.code) : '';
    const message = 'message' in error ? String(error.message).toLowerCase() : '';
    return code === '42703' && message.includes('lifecycle_state');
}

// GET /api/domains - List all domains with optional filters
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get('status');
        const niche = searchParams.get('niche');
        const tier = searchParams.get('tier');
        const vertical = searchParams.get('vertical');
        const lifecycleState = searchParams.get('lifecycleState');
        const search = searchParams.get('search');
        const rawLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
        const rawOffset = Number.parseInt(searchParams.get('offset') || '0', 10);

        if (Number.isNaN(rawOffset) || rawOffset < 0) {
            return NextResponse.json({ error: 'Invalid offset' }, { status: 400 });
        }

        const limit = (Number.isNaN(rawLimit) || rawLimit < 1) ? 50 : Math.min(rawLimit, 100);
        const offset = rawOffset;

        // Build conditions (always exclude soft-deleted)
        const conditions: SQL[] = [isNull(domains.deletedAt)];

        if (status) {
            const validStatuses = ['parked', 'active', 'redirect', 'forsale', 'defensive'];
            if (validStatuses.includes(status)) {
                conditions.push(eq(domains.status, status as typeof domains.status.enumValues[number]));
            }
        }
        if (lifecycleState && DOMAIN_LIFECYCLE_STATES.includes(lifecycleState as typeof DOMAIN_LIFECYCLE_STATES[number])) {
            conditions.push(eq(domains.lifecycleState, lifecycleState as typeof domains.lifecycleState.enumValues[number]));
        }
        if (niche) {
            conditions.push(eq(domains.niche, niche));
        }
        if (vertical) {
            conditions.push(eq(domains.vertical, vertical));
        }
        if (tier) {
            conditions.push(eq(domains.tier, Number.parseInt(tier, 10)));
        }
        if (search) {
            conditions.push(ilike(domains.domain, `%${escapeIlikePattern(search)}%`));
        }

        // Query with conditions
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        try {
            const results = await db
                .select()
                .from(domains)
                .where(whereClause)
                .orderBy(domains.createdAt)
                .limit(limit)
                .offset(offset);

            // Get total count for pagination
            const countResult = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(domains)
                .where(whereClause);

            return NextResponse.json({
                domains: results,
                pagination: {
                    total: countResult[0]?.count ?? 0,
                    limit,
                    offset,
                },
            });
        } catch (queryError) {
            if (!isMissingLifecycleStateColumn(queryError)) {
                throw queryError;
            }

            // Backward-compatible fallback for environments that have not yet added domains.lifecycle_state.
            if (lifecycleState && lifecycleState !== 'sourced') {
                return NextResponse.json({
                    domains: [],
                    pagination: {
                        total: 0,
                        limit,
                        offset,
                    },
                });
            }

            const legacyConditions: SQL[] = [isNull(domains.deletedAt)];
            if (status) {
                const validStatuses = ['parked', 'active', 'redirect', 'forsale', 'defensive'];
                if (validStatuses.includes(status)) {
                    legacyConditions.push(eq(domains.status, status as typeof domains.status.enumValues[number]));
                }
            }
            if (niche) legacyConditions.push(eq(domains.niche, niche));
            if (vertical) legacyConditions.push(eq(domains.vertical, vertical));
            if (tier) legacyConditions.push(eq(domains.tier, Number.parseInt(tier, 10)));
            if (search) legacyConditions.push(ilike(domains.domain, `%${escapeIlikePattern(search)}%`));

            const legacyWhereClause = legacyConditions.length > 0 ? and(...legacyConditions) : undefined;
            const legacyResults = await db
                .select({
                    id: domains.id,
                    domain: domains.domain,
                    tld: domains.tld,
                    registrar: domains.registrar,
                    purchaseDate: domains.purchaseDate,
                    purchasePrice: domains.purchasePrice,
                    renewalDate: domains.renewalDate,
                    renewalPrice: domains.renewalPrice,
                    status: domains.status,
                    bucket: domains.bucket,
                    tier: domains.tier,
                    niche: domains.niche,
                    subNiche: domains.subNiche,
                    redirectTargetId: domains.redirectTargetId,
                    githubRepo: domains.githubRepo,
                    cloudflareProject: domains.cloudflareProject,
                    isDeployed: domains.isDeployed,
                    lastDeployedAt: domains.lastDeployedAt,
                    siteTemplate: domains.siteTemplate,
                    vertical: domains.vertical,
                    cloudflareAccount: domains.cloudflareAccount,
                    themeStyle: domains.themeStyle,
                    monetizationModel: domains.monetizationModel,
                    monetizationTier: domains.monetizationTier,
                    estimatedRevenueAtMaturityLow: domains.estimatedRevenueAtMaturityLow,
                    estimatedRevenueAtMaturityHigh: domains.estimatedRevenueAtMaturityHigh,
                    estimatedFlipValueLow: domains.estimatedFlipValueLow,
                    estimatedFlipValueHigh: domains.estimatedFlipValueHigh,
                    estimatedMonthlyRevenueLow: domains.estimatedMonthlyRevenueLow,
                    estimatedMonthlyRevenueHigh: domains.estimatedMonthlyRevenueHigh,
                    healthScore: domains.healthScore,
                    healthUpdatedAt: domains.healthUpdatedAt,
                    notes: domains.notes,
                    tags: domains.tags,
                    contentConfig: domains.contentConfig,
                    createdAt: domains.createdAt,
                    updatedAt: domains.updatedAt,
                    deletedAt: domains.deletedAt,
                })
                .from(domains)
                .where(legacyWhereClause)
                .orderBy(domains.createdAt)
                .limit(limit)
                .offset(offset);

            const legacyCountResult = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(domains)
                .where(legacyWhereClause);

            return NextResponse.json({
                domains: legacyResults.map((domain) => ({
                    ...domain,
                    lifecycleState: 'sourced',
                })),
                pagination: {
                    total: legacyCountResult[0]?.count ?? 0,
                    limit,
                    offset,
                },
            });
        }
    } catch (error) {
        console.error('Failed to fetch domains:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to fetch domains' },
            { status: 500 }
        );
    }
}

// POST /api/domains - Create a new domain
export async function POST(request: NextRequest) {
    const cached = await checkIdempotencyKey(request);
    if (cached) return cached;

    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Invalid JSON in request body' },
                { status: 400 },
            );
        }
        const validationResult = createDomainSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: validationResult.error.issues },
                { status: 400 }
            );
        }

        const data: z.infer<typeof createDomainSchema> = validationResult.data;

        // Extract TLD from domain
        const domainParts = data.domain.split('.');
        const tld = domainParts[domainParts.length - 1];

        // Check if domain already exists
        const existing = await db
            .select({ id: domains.id })
            .from(domains)
            .where(eq(domains.domain, data.domain.toLowerCase()))
            .limit(1);

        if (existing.length > 0) {
            return NextResponse.json(
                { error: 'Domain already exists in portfolio' },
                { status: 409 }
            );
        }

        // Parse revenue range if provided
        let revLow = 0;
        let revHigh = 0;
        if (data.estimatedRevenueAtMaturity) {
            const clean = data.estimatedRevenueAtMaturity.replaceAll(/[$,]/g, '');
            const range = clean.split('-');
            if (range.length === 2) {
                revLow = Number.parseInt(range[0], 10) || 0;
                revHigh = Number.parseInt(range[1], 10) || 0;
            } else {
                // Handle single value or incomplete range
                const val = Number.parseInt(clean, 10) || 0;
                revLow = val;
                revHigh = val;
            }
        }

        // Create the domain
        const newDomain: NewDomain = {
            domain: data.domain.toLowerCase(),
            tld,
            registrar: data.registrar,
            purchasePrice: data.purchasePrice,
            purchaseDate: data.purchaseDate,
            renewalDate: data.renewalDate,
            renewalPrice: data.renewalPrice,
            status: data.status,
            lifecycleState: data.lifecycleState,
            bucket: data.bucket,
            tier: data.tier,
            niche: data.niche,
            subNiche: data.subNiche,
            siteTemplate: data.siteTemplate,
            notes: data.notes,
            tags: data.tags,
            // New fields
            vertical: data.vertical,
            monetizationTier: data.monetizationTier,
            cloudflareAccount: data.cloudflareAccount,
            themeStyle: data.themeStyle,
            monetizationModel: data.monetizationModel,
            estimatedRevenueAtMaturityLow: revLow,
            estimatedRevenueAtMaturityHigh: revHigh,
            contentConfig: data.contentConfig,
        };

        const inserted = await (async () => {
            try {
                return await db.insert(domains).values(newDomain).returning();
            } catch (insertError) {
                if (!isMissingLifecycleStateColumn(insertError)) {
                    throw insertError;
                }

                const { lifecycleState: _ignoredLifecycleState, ...legacyDomain } = newDomain;
                return await db.insert(domains).values(legacyDomain).returning();
            }
        })();

        const created = inserted[0];
        if (!created) {
            return NextResponse.json(
                { error: 'Internal Server Error', message: 'Domain insert returned no rows' },
                { status: 500 },
            );
        }

        // Auto-classify with AI if no niche was provided
        if (!created.niche) {
            classifyAndUpdateDomain(created.id).catch((err) => {
                console.warn('Auto-classification failed for domain', created.domain, err);
            });
        }

        const response = NextResponse.json({ domain: created }, { status: 201 });
        await storeIdempotencyResult(request, response);
        return response;
    } catch (error) {
        console.error('Failed to create domain:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to create domain' },
            { status: 500 }
        );
    }
}
