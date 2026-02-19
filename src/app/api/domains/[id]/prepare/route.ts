import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { prepareDomain, type DomainStrategy } from '@/lib/deploy/prepare-domain';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });

    let strategy: DomainStrategy;
    try {
        const body = await request.json();
        strategy = body as DomainStrategy;
        if (!strategy.homeTitle || !strategy.cluster || !strategy.niche) {
            return NextResponse.json({ error: 'Missing required strategy fields: homeTitle, cluster, niche' }, { status: 400 });
        }
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    try {
        const result = await prepareDomain(domain.domain, strategy);
        return NextResponse.json(result);
    } catch (err) {
        console.error('[prepare]', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
    }
}
