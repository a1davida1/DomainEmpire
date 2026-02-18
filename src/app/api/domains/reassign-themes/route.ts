import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { assignAllThemes } from '@/lib/deploy/theme-assigner';

export async function POST() {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    try {
        const result = await assignAllThemes();
        return NextResponse.json(result);
    } catch (err) {
        console.error('[reassign-themes] Error:', err instanceof Error ? err.message : err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
