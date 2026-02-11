import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getBackupData } from '@/lib/backup';

// GET /api/backup — Download a full database backup as JSON
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const data = await getBackupData();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        return new NextResponse(data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="domain-empire-backup-${timestamp}.json"`,
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Backup failed', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
