import type { YmylLevel } from './ymyl';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
}

export function getYmylCitationThreshold(level: YmylLevel): number {
    const mediumThreshold = parsePositiveInt(process.env.YMYL_MEDIUM_MIN_CITATIONS, 2);
    const highThreshold = parsePositiveInt(process.env.YMYL_HIGH_MIN_CITATIONS, 3);

    if (level === 'high') return highThreshold;
    if (level === 'medium') return mediumThreshold;
    return 0;
}
