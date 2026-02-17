export const AI_PHRASES = [
    'in conclusion',
    'it is important to note',
    'furthermore',
    'in summary',
    'this comprehensive guide',
    'in today\'s fast-paced world',
    'dive deep into',
    'unlock the secrets',
    'game-changer',
    'leveraging',
    'cutting-edge',
    'state-of-the-art',
    'revolutionize',
    'paradigm shift',
    'synergy',
    'holistic approach',
    'seamlessly',
    'robust',
    'empower',
    'unprecedented',
] as const;

export function stripHtml(html: string): string {
    return html
        .replaceAll(/<[^>]*>/g, ' ')
        .trim();
}

export function stripMarkdown(md: string): string {
    return md
        .replaceAll(/```[\s\S]*?```/g, ' ')
        .replaceAll(/`[^`]+`/g, ' ')
        .replaceAll(/!?\[[^\]]*\]\([^)]+\)/g, ' ')
        .replaceAll(/^#{1,6}\s+/gm, '')
        .replaceAll(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
        .replaceAll(/^\s*[-*+]\s+/gm, '')
        .replaceAll(/^\d+\.\s+/gm, '')
        .replaceAll(/^>\s+/gm, '')
        .replaceAll(/---+/g, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim();
}

export function toPlainText(contentMarkdown?: string | null, contentHtml?: string | null): string {
    if (contentMarkdown) return stripMarkdown(contentMarkdown);
    if (contentHtml) return stripHtml(contentHtml);
    return '';
}

export interface QualityAnalysis {
    qualityScore: number;
    status: 'excellent' | 'good' | 'needs_work' | 'poor';
    aiPhrases: string[];
    recommendations: string[];
    metrics: {
        wordCount: number;
        aiPhraseScore: number;
        wordCountScore: number;
        readabilityScore: number;
        avgSentenceLength: number;
        sentenceCount: number;
    };
}

export function analyzeContentQuality(plainText: string): QualityAnalysis {
    const content = plainText.toLowerCase();
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

    const foundPhrases: string[] = [];
    for (const phrase of AI_PHRASES) {
        if (content.includes(phrase.toLowerCase())) {
            foundPhrases.push(phrase);
        }
    }

    const aiPhraseScore = Math.max(0, 100 - (foundPhrases.length * 10));

    let wordCountScore = 100;
    if (wordCount < 500) wordCountScore = 30;
    else if (wordCount < 1000) wordCountScore = 60;
    else if (wordCount < 1500) wordCountScore = 80;
    else if (wordCount > 5000) wordCountScore = 70;
    else if (wordCount > 3000) wordCountScore = 90;

    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : 0;
    let readabilityScore = 100;
    if (avgSentenceLength > 30) readabilityScore = 50;
    else if (avgSentenceLength > 25) readabilityScore = 70;
    else if (avgSentenceLength > 20) readabilityScore = 85;

    const qualityScore = Math.round(
        (aiPhraseScore * 0.4) + (wordCountScore * 0.3) + (readabilityScore * 0.3),
    );

    let status: 'excellent' | 'good' | 'needs_work' | 'poor';
    if (qualityScore >= 85) status = 'excellent';
    else if (qualityScore >= 70) status = 'good';
    else if (qualityScore >= 50) status = 'needs_work';
    else status = 'poor';

    const recommendations: string[] = [];
    if (foundPhrases.length > 3) {
        recommendations.push('Remove or rephrase AI-sounding phrases');
    }
    if (wordCount < 1000) {
        recommendations.push('Add more content - aim for at least 1500 words');
    }
    if (avgSentenceLength > 25) {
        recommendations.push('Break up long sentences for better readability');
    }

    return {
        qualityScore,
        status,
        aiPhrases: foundPhrases,
        recommendations,
        metrics: {
            wordCount,
            aiPhraseScore,
            wordCountScore,
            readabilityScore,
            avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
            sentenceCount: sentences.length,
        },
    };
}
