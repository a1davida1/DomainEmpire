import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db, domains, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { assignThemeSkin } from '@/lib/deploy/theme-assigner';

export async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });

    const combo = assignThemeSkin(domain.domain, domain.cluster || 'misc', [domain.domain]);

    await db.update(domains).set({ skin: combo.skin, updatedAt: new Date() }).where(eq(domains.id, id));
    await db.update(pageDefinitions).set({
        theme: combo.theme,
        skin: combo.skin,
        updatedAt: new Date(),
    }).where(eq(pageDefinitions.domainId, id));

    return NextResponse.json(combo);
}
