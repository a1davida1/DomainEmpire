import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getNotifications, markAllAsRead, getUnreadCount } from '@/lib/notifications';

// GET /api/notifications — Get notifications with pagination
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const page = Number.parseInt(searchParams.get('page') || '1', 10);

    if (Number.isNaN(page) || page < 1) {
        return NextResponse.json({ error: 'Invalid page parameter' }, { status: 400 });
    }

    try {
        const [data, unreadCount] = await Promise.all([
            getNotifications(page),
            getUnreadCount(),
        ]);

        return NextResponse.json({ ...data, unreadCount });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch notifications', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// POST /api/notifications — Mark all as read
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const count = await markAllAsRead();
        return NextResponse.json({ markedRead: count });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to mark notifications', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
