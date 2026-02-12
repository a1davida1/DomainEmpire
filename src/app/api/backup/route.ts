import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getBackupData } from '@/lib/backup';

// GET /api/backup — Download a full database backup as JSON (admin only)
export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    try {
        const data = await getBackupData();
        const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');

        return new NextResponse(data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="domain-empire-backup-${timestamp}.json"`,
            },
        });
    } catch (error) {
        console.error('Database backup failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to generate backup' },
            { status: 500 }
        );
    }
}
