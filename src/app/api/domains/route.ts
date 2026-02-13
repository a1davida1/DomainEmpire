import { NextRequest, NextResponse } from 'next/server';
import { db, domains, NewDomain } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, ilike, and, sql, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { checkIdempotencyKey, storeIdempotencyResult } from '@/lib/api/idempotency';

// Validation schema for creating a domain
const createDomainSchema = z.object({
    domain: z.string().min(1).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i, 'Invalid domain format'),
    registrar: z.enum(['godaddy', 'namecheap', 'cloudflare', 'other']).optional().default('godaddy'),
    purchasePrice: z.number().optional(),
    purchaseDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    renewalDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
    renewalPrice: z.number().optional(),
    status: z.enum(['parked', 'active', 'redirect', 'forsale', 'defensive']).optional().default('parked'),
    bucket: z.enum(['build', 'redirect', 'park', 'defensive']).optional().default('build'), // Strategy
    tier: z.number().min(1).max(3).optional().default(3),
    niche: z.string().optional(),
    subNiche: z.string().optional(),
    vertical: z.string().optional(), // Legal, Insurance, etc.
    monetizationTier: z.number().min(1).max(4).optional().default(3),
    siteTemplate: z.enum(['authority', 'comparison', 'calculator', 'review', 'tool', 'hub', 'decision', 'cost_guide', 'niche', 'info', 'consumer', 'brand']).optional().default('authority'),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
    cloudflareAccount: z.string().optional(),
    themeStyle: z.string().optional(),
    monetizationModel: z.string().optional(),
    estimatedRevenueAtMaturity: z.string().optional(),
});

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
        const search = searchParams.get('search');
        const rawLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
        const rawOffset = Number.parseInt(searchParams.get('offset') || '0', 10);

        if (Number.isNaN(rawOffset) || rawOffset < 0) {
            return NextResponse.json({ error: 'Invalid offset' }, { status: 400 });
        }

        const limit = (Number.isNaN(rawLimit) || rawLimit < 1) ? 50 : Math.min(rawLimit, 100);
        const offset = rawOffset;

        // Build conditions (always exclude soft-deleted)
        const conditions: ReturnType<typeof eq>[] = [isNull(domains.deletedAt)];

        if (status) {
            const validStatuses = ['parked', 'active', 'redirect', 'forsale', 'defensive'];
            if (validStatuses.includes(status)) {
                conditions.push(eq(domains.status, status as typeof domains.status.enumValues[number]));
            }
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
            conditions.push(ilike(domains.domain, `%${search}%`));
        }

        // Query with conditions
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
        const body = await request.json();
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
            purchasePrice: data.purchasePrice?.toString(),
            purchaseDate: data.purchaseDate,
            renewalDate: data.renewalDate,
            renewalPrice: data.renewalPrice?.toString(),
            status: data.status,
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
        };

        const inserted = await db.insert(domains).values(newDomain).returning();

        const response = NextResponse.json({ domain: inserted[0] }, { status: 201 });
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
