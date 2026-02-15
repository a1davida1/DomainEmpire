import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockGetPostmortemSummary = vi.fn();
const mockListPostmortemIncidents = vi.fn();
const mockRecordPostmortemCompletion = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/growth/launch-freeze', () => ({
    getGrowthLaunchFreezePostmortemSlaSummary: mockGetPostmortemSummary,
    listGrowthLaunchFreezePostmortemIncidents: mockListPostmortemIncidents,
    recordGrowthLaunchFreezePostmortemCompletion: mockRecordPostmortemCompletion,
}));

const { GET, POST } = await import('@/app/api/growth/launch-freeze/postmortems/route');

function makeRequest(opts?: {
    url?: string;
    body?: unknown;
}): NextRequest {
    return {
        headers: new Headers(),
        url: opts?.url || 'http://localhost/api/growth/launch-freeze/postmortems',
        nextUrl: new URL(opts?.url || 'http://localhost/api/growth/launch-freeze/postmortems'),
        json: async () => opts?.body ?? {},
    } as unknown as NextRequest;
}

describe('growth launch freeze postmortems route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'Admin User' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockGetPostmortemSummary.mockResolvedValue({
            enabled: true,
            scanned: 2,
            overdue: 1,
            alertsCreated: 0,
            opsAlertsSent: 0,
            opsAlertsFailed: 0,
            postmortemsCompleted: 1,
            overdueIncidentKeys: ['incident-1'],
        });
        mockListPostmortemIncidents.mockResolvedValue([
            {
                incidentKey: 'incident-1',
                enteredAt: '2026-02-15T00:00:00.000Z',
                dueAt: '2026-02-17T00:00:00.000Z',
                postmortemUrl: null,
                completedAt: null,
                overdue: true,
            },
        ]);
        mockRecordPostmortemCompletion.mockResolvedValue({
            created: true,
            record: {
                id: 'pm-1',
                incidentKey: 'incident-1',
                completedAt: '2026-02-16T00:00:00.000Z',
                completedByUserId: 'user-1',
                postmortemUrl: 'https://example.com/postmortem/incident-1',
                notes: 'Documented root cause and mitigations.',
            },
        });
    });

    it('returns postmortem SLA summary on GET', async () => {
        const response = await GET(makeRequest());
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.summary.overdue).toBe(1);
        expect(body.incidents).toEqual([]);
    });

    it('includes incidents when requested on GET', async () => {
        const response = await GET(makeRequest({
            url: 'http://localhost/api/growth/launch-freeze/postmortems?includeIncidents=true&overdueOnly=true',
        }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.incidents).toHaveLength(1);
        expect(mockListPostmortemIncidents).toHaveBeenCalledWith({ overdueOnly: true });
    });

    it('records completion on POST', async () => {
        const response = await POST(makeRequest({
            body: {
                incidentKey: 'incident-1',
                postmortemUrl: 'https://example.com/postmortem/incident-1',
                notes: 'Documented root cause and mitigations.',
            },
        }));
        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.created).toBe(true);
        expect(body.completed.incidentKey).toBe('incident-1');
    });
});
