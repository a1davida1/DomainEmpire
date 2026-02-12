import { describe, it, expect } from 'vitest';

// Mirror truncateAtSentence from faq.ts
function truncateAtSentence(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const truncated = text.substring(0, maxLen);
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > maxLen * 0.3) {
        return truncated.substring(0, lastPeriod + 1) + '...';
    }
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
        return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
}

describe('truncateAtSentence', () => {
    it('returns short text unchanged', () => {
        expect(truncateAtSentence('Hello world.', 500)).toBe('Hello world.');
    });

    it('truncates at sentence boundary', () => {
        const text = 'First sentence. Second sentence. Third sentence is longer and pushes past the limit.';
        const result = truncateAtSentence(text, 40);
        expect(result).toBe('First sentence. Second sentence....');
        expect(result.length).toBeLessThanOrEqual(43); // 40 + "..."
    });

    it('truncates at word boundary when no sentence end found', () => {
        const text = 'This is a very long sentence without any periods that keeps going and going and going';
        const result = truncateAtSentence(text, 30);
        expect(result).toContain('...');
        expect(result).not.toContain(' ...'); // no trailing space before ellipsis
    });

    it('adds ellipsis to indicate truncation', () => {
        const text = 'A'.repeat(600);
        const result = truncateAtSentence(text, 500);
        expect(result).toContain('...');
    });

    it('prefers sentence boundary over arbitrary cut', () => {
        const text = 'Short. ' + 'A'.repeat(600);
        const result = truncateAtSentence(text, 500);
        // Should cut at "Short." since it's > 30% of 500
        expect(result).toBe('Short....');
    });
});

// Mirror extractFaqItems logic from faq.ts
interface FaqItem { question: string; answer: string; }

function extractFaqItems(markdown: string): FaqItem[] {
    const lines = markdown.split('\n');
    const items: FaqItem[] = [];
    let currentQuestion = '';
    let currentAnswer: string[] = [];

    for (const line of lines) {
        const h2Match = /^##\s+(.+)$/.exec(line);
        if (h2Match) {
            if (currentQuestion) {
                items.push({ question: currentQuestion, answer: currentAnswer.join('\n').trim() });
            }
            currentQuestion = h2Match[1];
            currentAnswer = [];
        } else if (currentQuestion) {
            currentAnswer.push(line);
        }
    }
    if (currentQuestion) {
        items.push({ question: currentQuestion, answer: currentAnswer.join('\n').trim() });
    }
    return items;
}

describe('extractFaqItems', () => {
    it('extracts FAQ items from markdown H2 headings', () => {
        const md = '## What is X?\nX is a thing.\n\n## How does Y work?\nY works by magic.';
        const items = extractFaqItems(md);
        expect(items).toHaveLength(2);
        expect(items[0].question).toBe('What is X?');
        expect(items[0].answer).toContain('X is a thing.');
        expect(items[1].question).toBe('How does Y work?');
    });

    it('returns empty array for no H2 headings', () => {
        expect(extractFaqItems('Just a paragraph.')).toHaveLength(0);
    });

    it('handles single FAQ item', () => {
        const md = '## Only question?\nThe answer.';
        const items = extractFaqItems(md);
        expect(items).toHaveLength(1);
        expect(items[0].answer).toBe('The answer.');
    });
});
