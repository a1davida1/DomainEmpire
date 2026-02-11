import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { markAsRead } from '@/lib/notifications';

// PATCH /api/notifications/:id — Mark single notification as read
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const success = await markAsRead(id);
        if (!success) {
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(`Failed to update notification ${id}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to update notification' },
            { status: 500 }
        );
    }
}
