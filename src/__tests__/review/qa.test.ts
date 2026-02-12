import { describe, it, expect } from 'vitest';
import { getDefaultChecklist } from '@/lib/review/qa';

describe('getDefaultChecklist', () => {
    it('returns base items for none YMYL level', () => {
        const items = getDefaultChecklist('none');
        expect(items.length).toBeGreaterThanOrEqual(5);
        expect(items.every(i => i.id && i.category && i.label)).toBe(true);
    });

    it('returns more items for medium YMYL', () => {
        const none = getDefaultChecklist('none');
        const medium = getDefaultChecklist('medium');
        expect(medium.length).toBeGreaterThan(none.length);
    });

    it('returns more items for high YMYL than medium', () => {
        const medium = getDefaultChecklist('medium');
        const high = getDefaultChecklist('high');
        expect(high.length).toBeGreaterThan(medium.length);
    });

    it('includes citation requirement for medium YMYL', () => {
        const medium = getDefaultChecklist('medium');
        expect(medium.some(i => i.id === 'citations')).toBe(true);
    });

    it('includes disclosure requirement for medium YMYL', () => {
        const medium = getDefaultChecklist('medium');
        expect(medium.some(i => i.id === 'disclosure')).toBe(true);
    });

    it('includes expert review for high YMYL', () => {
        const high = getDefaultChecklist('high');
        expect(high.some(i => i.id === 'expert_review')).toBe(true);
    });

    it('includes not-advice disclaimer for high YMYL', () => {
        const high = getDefaultChecklist('high');
        expect(high.some(i => i.id === 'not_advice')).toBe(true);
    });

    it('all items have unique ids', () => {
        const items = getDefaultChecklist('high');
        const ids = items.map(i => i.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('required items for none level include purpose, accuracy, grammar', () => {
        const items = getDefaultChecklist('none');
        const required = items.filter(i => i.required);
        expect(required.some(i => i.id === 'purpose')).toBe(true);
        expect(required.some(i => i.id === 'accuracy')).toBe(true);
        expect(required.some(i => i.id === 'grammar')).toBe(true);
    });

    it('low YMYL gets same items as none', () => {
        const none = getDefaultChecklist('none');
        const low = getDefaultChecklist('low');
        expect(low).toEqual(none);
    });
});
