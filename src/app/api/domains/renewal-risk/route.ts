import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, isNotNull, type SQL } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { db, domainRegistrarProfiles, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import {
    REGISTRAR_EXPIRATION_RISKS,
    computeRegistrarExpirationRisk,
    isRegistrarTransferStatus,
    type RegistrarExpirationRisk,
} from '@/lib/domain/registrar-operations';

const RENEWAL_WINDOWS = [
    'unknown',
    'expired',
    'within_7_days',
    'within_30_days',
    'within_60_days',
    'within_90_days',
    'beyond_90_days',
] as const;

// GET /api/domains/renewal-risk
export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    try {
        const searchParams = request.nextUrl.searchParams;
        const riskFilter = searchParams.get('risk');
        const renewalWindowFilter = searchParams.get('renewalWindow');
        const includeUnknown = searchParams.get('includeUnknown') === 'true';
        const rawLimit = Number.parseInt(searchParams.get('limit') || '200', 10);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 1000)) : 200;

        if (riskFilter && !REGISTRAR_EXPIRATION_RISKS.includes(riskFilter as RegistrarExpirationRisk)) {
            return NextResponse.json({ error: 'Invalid risk filter' }, { status: 400 });
        }
        if (renewalWindowFilter && !RENEWAL_WINDOWS.includes(renewalWindowFilter as typeof RENEWAL_WINDOWS[number])) {
            return NextResponse.json({ error: 'Invalid renewalWindow filter' }, { status: 400 });
        }

        const conditions: SQL[] = [notDeleted(domains)];
        if (!includeUnknown) {
            conditions.push(isNotNull(domains.renewalDate));
        }

        const rows = await db.select({
            domainId: domains.id,
            domain: domains.domain,
            registrar: domains.registrar,
            lifecycleState: domains.lifecycleState,
            renewalDate: domains.renewalDate,
            renewalPrice: domains.renewalPrice,
            profileId: domainRegistrarProfiles.id,
            ownershipStatus: domainRegistrarProfiles.ownershipStatus,
            transferStatus: domainRegistrarProfiles.transferStatus,
            autoRenewEnabled: domainRegistrarProfiles.autoRenewEnabled,
            lockStatus: domainRegistrarProfiles.lockStatus,
            dnssecStatus: domainRegistrarProfiles.dnssecStatus,
            storedRisk: domainRegistrarProfiles.expirationRisk,
            storedRiskScore: domainRegistrarProfiles.expirationRiskScore,
            riskUpdatedAt: domainRegistrarProfiles.expirationRiskUpdatedAt,
            lastSyncedAt: domainRegistrarProfiles.lastSyncedAt,
        })
            .from(domains)
            .leftJoin(domainRegistrarProfiles, eq(domainRegistrarProfiles.domainId, domains.id))
            .where(and(...conditions))
            .orderBy(asc(domains.renewalDate), asc(domains.domain))
            .limit(limit);

        const items = rows.map((row) => {
            const risk = computeRegistrarExpirationRisk({
                renewalDate: row.renewalDate,
                autoRenewEnabled: row.autoRenewEnabled !== false,
                transferStatus: isRegistrarTransferStatus(row.transferStatus) ? row.transferStatus : 'none',
            });

            return {
                domainId: row.domainId,
                domain: row.domain,
                registrar: row.registrar,
                lifecycleState: row.lifecycleState,
                renewalDate: row.renewalDate,
                renewalPrice: row.renewalPrice,
                profileId: row.profileId,
                ownershipStatus: row.ownershipStatus ?? 'unknown',
                transferStatus: isRegistrarTransferStatus(row.transferStatus) ? row.transferStatus : 'none',
                autoRenewEnabled: row.autoRenewEnabled !== false,
                lockStatus: row.lockStatus ?? 'unknown',
                dnssecStatus: row.dnssecStatus ?? 'unknown',
                risk,
                storedRisk: row.storedRisk ?? 'unknown',
                storedRiskScore: Number(row.storedRiskScore ?? 0),
                riskUpdatedAt: row.riskUpdatedAt,
                lastSyncedAt: row.lastSyncedAt,
            };
        }).filter((item) => {
            if (riskFilter && item.risk.risk !== riskFilter) return false;
            if (renewalWindowFilter && item.risk.renewalWindow !== renewalWindowFilter) return false;
            return true;
        });

        return NextResponse.json({
            items,
            count: items.length,
            filters: {
                risk: riskFilter,
                renewalWindow: renewalWindowFilter,
                includeUnknown,
                limit,
            },
        });
    } catch (error) {
        console.error('Failed to list renewal risk queue:', error);
        return NextResponse.json(
            { error: 'Failed to list renewal risk queue' },
            { status: 500 },
        );
    }
}
