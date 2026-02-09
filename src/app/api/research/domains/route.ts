import { NextRequest, NextResponse } from 'next/server';
import { db, domainResearch } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

const researchSchema = z.object({
    domain: z.string().min(3),
    tld: z.string().default('com'),
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

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { domain, tld } = researchSchema.parse(body);
        const fullDomain = `${domain}.${tld}`;

        const existing = await db.select().from(domainResearch).where(eq(domainResearch.domain, fullDomain)).limit(1);

        if (existing.length > 0) {
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            if (existing[0].createdAt && existing[0].createdAt > dayAgo) {
                return NextResponse.json({ cached: true, ...existing[0] });
            }
        }

        // Simulated research (in production, integrate with domain APIs)
        const research = {
            domain: fullDomain,
            tld,
            isAvailable: Math.random() > 0.7,
            registrationPrice: Math.round(10 + Math.random() * 50),
            aftermarketPrice: Math.random() > 0.5 ? Math.round(100 + Math.random() * 5000) : null,
            keywordVolume: Math.round(100 + Math.random() * 10000),
            keywordCpc: Math.round((0.5 + Math.random() * 5) * 100) / 100,
            estimatedRevenuePotential: Math.round((50 + Math.random() * 500) * 100) / 100,
        };

        const domainScore = calculateDomainScore(research);

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
    keywordVolume: number;
    keywordCpc: number;
}): number {
    let score = 0;
    if (r.isAvailable) score += 20;
    score += Math.min(25, Math.round((r.keywordVolume / 10000) * 25));
    score += Math.min(20, Math.round((r.keywordCpc / 5) * 20));
    return Math.min(100, score + 35); // base points for presence
}
