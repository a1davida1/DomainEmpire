import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { INTEGRATION_PROVIDER_CATALOG } from '@/lib/integrations/catalog';

// GET /api/integrations/providers
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    return NextResponse.json({
        providers: INTEGRATION_PROVIDER_CATALOG,
    });
}
