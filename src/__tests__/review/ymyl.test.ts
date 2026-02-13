import { describe, it, expect } from 'vitest';
import { classifyYmylLevel } from '@/lib/review/ymyl';

describe('classifyYmylLevel', () => {
    describe('niche-based classification', () => {
        it('classifies finance niche as high', () => {
            expect(classifyYmylLevel({ niche: 'finance' })).toBe('high');
        });

        it('classifies health niche as high', () => {
            expect(classifyYmylLevel({ niche: 'health' })).toBe('high');
        });

        it('classifies legal niche as high', () => {
            expect(classifyYmylLevel({ niche: 'legal' })).toBe('high');
        });

        it('classifies insurance niche as high', () => {
            expect(classifyYmylLevel({ niche: 'insurance' })).toBe('high');
        });

        it('classifies medical niche as high', () => {
            expect(classifyYmylLevel({ niche: 'medical' })).toBe('high');
        });

        it('classifies tax niche as high', () => {
            expect(classifyYmylLevel({ niche: 'tax' })).toBe('high');
        });

        it('classifies real_estate niche as medium', () => {
            expect(classifyYmylLevel({ niche: 'real_estate' })).toBe('medium');
        });

        it('classifies education niche as medium', () => {
            expect(classifyYmylLevel({ niche: 'education' })).toBe('medium');
        });

        it('classifies technology niche as low', () => {
            expect(classifyYmylLevel({ niche: 'technology' })).toBe('low');
        });

        it('classifies business niche as low', () => {
            expect(classifyYmylLevel({ niche: 'business' })).toBe('low');
        });

        it('classifies entertainment niche as none', () => {
            expect(classifyYmylLevel({ niche: 'entertainment' })).toBe('none');
        });

        it('classifies cooking niche as none', () => {
            expect(classifyYmylLevel({ niche: 'cooking' })).toBe('none');
        });
    });

    describe('keyword-based classification', () => {
        it('classifies calculator keyword as high', () => {
            expect(classifyYmylLevel({ niche: 'general', keyword: 'mortgage calculator' })).toBe('high');
        });

        it('classifies treatment keyword as high', () => {
            expect(classifyYmylLevel({ niche: 'general', keyword: 'back pain treatment' })).toBe('high');
        });

        it('classifies investment keyword as medium', () => {
            expect(classifyYmylLevel({ niche: 'general', keyword: 'how to invest in stocks' })).toBe('medium');
        });

        it('classifies cost keyword as medium', () => {
            expect(classifyYmylLevel({ niche: 'general', keyword: 'roof replacement cost' })).toBe('medium');
        });
    });

    describe('content-based classification', () => {
        it('detects high YMYL keywords in content', () => {
            expect(classifyYmylLevel({
                niche: 'general',
                contentMarkdown: 'This article discusses mortgage rates and loan options.',
            })).toBe('high');
        });

        it('detects medium YMYL keywords in content', () => {
            expect(classifyYmylLevel({
                niche: 'general',
                contentMarkdown: 'Guide to retirement savings and investment strategies.',
            })).toBe('medium');
        });
    });

    describe('edge cases', () => {
        it('handles null/undefined niche', () => {
            expect(classifyYmylLevel({ niche: null })).toBe('none');
            expect(classifyYmylLevel({ niche: undefined as unknown as string })).toBe('none');
        });

        it('handles empty inputs', () => {
            expect(classifyYmylLevel({})).toBe('none');
        });

        it('is case-insensitive', () => {
            expect(classifyYmylLevel({ niche: 'FINANCE' })).toBe('high');
            expect(classifyYmylLevel({ niche: 'Health' })).toBe('high');
        });

        it('niche takes priority over keyword', () => {
            // Finance niche = high, even if keyword is non-YMYL
            expect(classifyYmylLevel({ niche: 'finance', keyword: 'best recipes' })).toBe('high');
        });

        it('truncates very long content to avoid performance issues', () => {
            const longContent = 'x'.repeat(10000) + 'mortgage rates';
            // The mortgage keyword is beyond the 3000 char slice, so it should be 'none'
            expect(classifyYmylLevel({ niche: 'general', contentMarkdown: longContent })).toBe('none');
        });
    });
});
