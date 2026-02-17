import { NextRequest, NextResponse } from 'next/server';
import { db, domainResearch } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

const researchSchema = z.object({
    domain: z.string().min(3).max(253),
    tld: z.string().max(20).default('com'),
});

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

    try {
        let query = db.select().from(domainResearch);

        if (status === 'available') {
            query = query.where(eq(domainResearch.isAvailable, true)) as typeof query;
        } else if (status === 'taken') {
            query = query.where(eq(domainResearch.isAvailable, false)) as typeof query;
        }

        const results = await query
            .orderBy(desc(domainResearch.estimatedRevenuePotential))
            .limit(limit);

        return NextResponse.json({ count: results.length, domains: results });
    } catch (error) {
        console.error('Get domain research failed:', error);
        return NextResponse.json({ error: 'Failed to fetch research' }, { status: 500 });
    }
}

/** Check domain availability via RDAP (the free, standards-based replacement for WHOIS). */
async function checkDomainAvailability(fullDomain: string): Promise<{
    isAvailable: boolean;
    registrationPrice: number | null;
    aftermarketPrice: number | null;
}> {
    try {
        // RDAP lookup — a registered domain will return 200, unregistered returns 404
        const rdapUrl = `https://rdap.org/domain/${fullDomain}`;
        const resp = await fetch(rdapUrl, {
            signal: AbortSignal.timeout(10000),
            headers: { 'Accept': 'application/rdap+json' },
        });

        if (resp.status === 404) {
            // Domain not registered
            return { isAvailable: true, registrationPrice: estimateRegistrationPrice(fullDomain), aftermarketPrice: null };
        }

        if (resp.ok) {
            // Domain is registered (taken)
            return { isAvailable: false, registrationPrice: null, aftermarketPrice: null };
        }

        // RDAP returned an unexpected status — fall back to conservative assumption
        return { isAvailable: false, registrationPrice: null, aftermarketPrice: null };
    } catch {
        // Network error or timeout — assume unknown
        return { isAvailable: false, registrationPrice: null, aftermarketPrice: null };
    }
}

/** Estimate registration price based on TLD. */
function estimateRegistrationPrice(domain: string): number {
    const tld = domain.split('.').pop()?.toLowerCase() || 'com';
    const prices: Record<string, number> = {
        com: 12, net: 12, org: 12, io: 40, co: 30, dev: 14, app: 14, ai: 80,
        info: 10, biz: 12, us: 10, me: 18, xyz: 10, site: 10,
    };
    return prices[tld] ?? 15;
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const { domain, tld } = researchSchema.parse(body);
        const fullDomain = `${domain}.${tld}`;

        const existing = await db.select().from(domainResearch).where(eq(domainResearch.domain, fullDomain)).limit(1);

        if (existing.length > 0) {
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            if (existing[0].createdAt && existing[0].createdAt > dayAgo) {
                return NextResponse.json({ cached: true, ...existing[0] });
            }
        }

        // Real domain availability check via RDAP
        const availability = await checkDomainAvailability(fullDomain);

        // Keyword data from the domain name itself (extract the SLD as a keyword proxy)
        const sld = domain.toLowerCase().replaceAll(/[^a-z0-9]/g, ' ').trim();

        const research = {
            domain: fullDomain,
            tld,
            isAvailable: availability.isAvailable,
            registrationPrice: availability.registrationPrice,
            aftermarketPrice: availability.aftermarketPrice,
            keywordVolume: null as number | null,
            keywordCpc: null as number | null,
            estimatedRevenuePotential: null as number | null,
        };

        const domainScore = calculateDomainScore({
            isAvailable: research.isAvailable,
            sld,
            tld,
        });

        if (existing.length > 0) {
            await db.update(domainResearch)
                .set({ ...research, domainScore, createdAt: new Date() })
                .where(eq(domainResearch.id, existing[0].id));
        } else {
            await db.insert(domainResearch).values({ ...research, domainScore });
        }

        return NextResponse.json({ cached: false, score: domainScore, ...research });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        console.error('Domain research failed:', error);
        return NextResponse.json({ error: 'Failed to research domain' }, { status: 500 });
    }
}

function calculateDomainScore(r: {
    isAvailable: boolean;
    sld: string;
    tld: string;
}): number {
    let score = 0;

    // Availability bonus
    if (r.isAvailable) score += 20;

    // Short domains are more valuable
    const wordCount = r.sld.split(' ').filter(Boolean).length;
    if (wordCount <= 1) score += 15;
    else if (wordCount === 2) score += 10;
    else score += 5;

    // Premium TLDs
    if (r.tld === 'com') score += 20;
    else if (['net', 'org', 'co'].includes(r.tld)) score += 12;
    else if (['io', 'ai', 'dev'].includes(r.tld)) score += 10;
    else score += 5;

    // Domain length bonus (shorter = better)
    const domainLength = r.sld.replaceAll(' ', '').length;
    if (domainLength <= 6) score += 15;
    else if (domainLength <= 10) score += 10;
    else if (domainLength <= 15) score += 5;

    // No numbers/hyphens bonus
    if (!/\d/.test(r.sld) && !r.sld.includes('-')) score += 10;

    return Math.min(100, score);
}
