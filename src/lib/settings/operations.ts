import { cookies } from 'next/headers';

export const OPERATIONS_SETTINGS_DEFAULTS = {
    queueStaleThresholdMinutes: 20,
    queuePendingSlaMinutes: 180,
    queueProcessingSlaMinutes: 45,
} as const;

const BOUNDS = {
    queueStaleThresholdMinutes: { min: 1, max: 24 * 60 },
    queuePendingSlaMinutes: { min: 5, max: 7 * 24 * 60 },
    queueProcessingSlaMinutes: { min: 1, max: 24 * 60 },
} as const;

export const OPERATIONS_SETTINGS_COOKIES = {
    queueStaleThresholdMinutes: 'ops_queue_stale_threshold_minutes',
    queuePendingSlaMinutes: 'ops_queue_pending_sla_minutes',
    queueProcessingSlaMinutes: 'ops_queue_processing_sla_minutes',
} as const;

export type OperationsSettings = {
    queueStaleThresholdMinutes: number;
    queuePendingSlaMinutes: number;
    queueProcessingSlaMinutes: number;
};

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

export async function getOperationsSettings(): Promise<OperationsSettings> {
    const cookieStore = await cookies();
    return {
        queueStaleThresholdMinutes: clampInteger(
            cookieStore.get(OPERATIONS_SETTINGS_COOKIES.queueStaleThresholdMinutes)?.value,
            BOUNDS.queueStaleThresholdMinutes.min,
            BOUNDS.queueStaleThresholdMinutes.max,
            OPERATIONS_SETTINGS_DEFAULTS.queueStaleThresholdMinutes,
        ),
        queuePendingSlaMinutes: clampInteger(
            cookieStore.get(OPERATIONS_SETTINGS_COOKIES.queuePendingSlaMinutes)?.value,
            BOUNDS.queuePendingSlaMinutes.min,
            BOUNDS.queuePendingSlaMinutes.max,
            OPERATIONS_SETTINGS_DEFAULTS.queuePendingSlaMinutes,
        ),
        queueProcessingSlaMinutes: clampInteger(
            cookieStore.get(OPERATIONS_SETTINGS_COOKIES.queueProcessingSlaMinutes)?.value,
            BOUNDS.queueProcessingSlaMinutes.min,
            BOUNDS.queueProcessingSlaMinutes.max,
            OPERATIONS_SETTINGS_DEFAULTS.queueProcessingSlaMinutes,
        ),
    };
}

export function normalizeOperationsSettingsInput(input: {
    queueStaleThresholdMinutes?: unknown;
    queuePendingSlaMinutes?: unknown;
    queueProcessingSlaMinutes?: unknown;
}): OperationsSettings {
    return {
        queueStaleThresholdMinutes: clampInteger(
            input.queueStaleThresholdMinutes,
            BOUNDS.queueStaleThresholdMinutes.min,
            BOUNDS.queueStaleThresholdMinutes.max,
            OPERATIONS_SETTINGS_DEFAULTS.queueStaleThresholdMinutes,
        ),
        queuePendingSlaMinutes: clampInteger(
            input.queuePendingSlaMinutes,
            BOUNDS.queuePendingSlaMinutes.min,
            BOUNDS.queuePendingSlaMinutes.max,
            OPERATIONS_SETTINGS_DEFAULTS.queuePendingSlaMinutes,
        ),
        queueProcessingSlaMinutes: clampInteger(
            input.queueProcessingSlaMinutes,
            BOUNDS.queueProcessingSlaMinutes.min,
            BOUNDS.queueProcessingSlaMinutes.max,
            OPERATIONS_SETTINGS_DEFAULTS.queueProcessingSlaMinutes,
        ),
    };
}
