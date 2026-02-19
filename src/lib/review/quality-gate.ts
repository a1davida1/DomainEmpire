import type { QualityAnalysis } from '@/lib/review/content-quality';
import { analyzeContentQuality, toPlainText } from '@/lib/review/content-quality';

const MIN_REVIEW_QUALITY_SCORE = 70;

export const INTERACTIVE_CONTENT_TYPES = new Set([
    'calculator',
    'wizard',
    'configurator',
    'quiz',
    'survey',
    'assessment',
    'interactive_infographic',
    'interactive_map',
]);

export type QualityGate = {
    minQualityScore: number;
    minWordCount: number;
    isInteractive: boolean;
};

export function resolveQualityGate(input: {
    contentType: string | null;
    ymylLevel: string | null;
}): QualityGate {
    const isInteractive = input.contentType ? INTERACTIVE_CONTENT_TYPES.has(input.contentType) : false;
    if (!isInteractive) {
        return { minQualityScore: MIN_REVIEW_QUALITY_SCORE, minWordCount: 900, isInteractive: false };
    }

    const raw = input.ymylLevel || 'none';
    const YMYL_WORD_COUNTS: Record<string, number> = {
        high: 350,
        medium: 250,
        low: 150,
        none: 150,
    };
    const minWordCount = YMYL_WORD_COUNTS[raw] ?? 150;
    return { minQualityScore: MIN_REVIEW_QUALITY_SCORE, minWordCount, isInteractive: true };
}

export type QualityGateEvaluation = {
    gate: QualityGate;
    quality: QualityAnalysis;
    passed: boolean;
    failures: string[];
};

export function evaluateQualityGate(input: {
    contentType: string | null;
    ymylLevel: string | null;
    contentMarkdown?: string | null;
    contentHtml?: string | null;
}): QualityGateEvaluation {
    const gate = resolveQualityGate({
        contentType: input.contentType,
        ymylLevel: input.ymylLevel,
    });

    const plainText = toPlainText(input.contentMarkdown ?? null, input.contentHtml ?? null);
    const quality = analyzeContentQuality(plainText);

    const failures: string[] = [];
    if (quality.qualityScore < gate.minQualityScore) {
        failures.push(`Quality score ${quality.qualityScore} is below required ${gate.minQualityScore}`);
    }
    if (quality.metrics.wordCount < gate.minWordCount) {
        failures.push(`Word count ${quality.metrics.wordCount} is below required ${gate.minWordCount}`);
    }

    return {
        gate,
        quality,
        passed: failures.length === 0,
        failures,
    };
}

