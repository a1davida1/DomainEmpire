import { NextRequest, NextResponse } from 'next/server';
import { db, articles } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// Strip HTML tags from content
function stripHtml(html: string): string {
    return html
        .replaceAll(/<[^>]*>/g, ' ')  // Remove HTML tags
        .replaceAll('&nbsp;', ' ')   // Replace &nbsp;
        .replaceAll(/&[a-z]+;/gi, ' ') // Remove other HTML entities
        .replaceAll(/\s+/g, ' ')       // Collapse multiple spaces
        .trim();
}

// Strip common Markdown syntax for accurate word counting
function stripMarkdown(md: string): string {
    return md
        .replaceAll(/```[\s\S]*?```/g, ' ')     // Code blocks
        .replaceAll(/`[^`]+`/g, ' ')             // Inline code
        .replaceAll(/!?\[[^\]]*\]\([^)]+\)/g, ' ') // Links and images
        .replaceAll(/^#{1,6}\s+/gm, '')          // Headings
        .replaceAll(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // Bold/italic
        .replaceAll(/^\s*[-*+]\s+/gm, '')      // List markers
        .replaceAll(/^\d+\.\s+/gm, '')           // Numbered lists
        .replaceAll(/^>\s+/gm, '')               // Blockquotes
        .replaceAll(/---+/g, ' ')                // Horizontal rules
        .replaceAll(/\s+/g, ' ')                 // Collapse spaces
        .trim();
}

interface PageProps {
    params: Promise<{ id: string }>;
}

// Common AI phrases to detect
const AI_PHRASES = [
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
];

// GET /api/articles/[id]/quality - Analyze article quality
export async function GET(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const articleResult = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
        if (articleResult.length === 0) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }
        const article = articleResult[0];

        // Strip markdown/HTML for accurate word counting
        let plainText: string;
        if (article.contentMarkdown) {
            plainText = stripMarkdown(article.contentMarkdown);
        } else if (article.contentHtml) {
            plainText = stripHtml(article.contentHtml);
        } else {
            plainText = '';
        }
        const content = plainText.toLowerCase();
        const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

        // Detect AI phrases
        const foundPhrases: string[] = [];
        for (const phrase of AI_PHRASES) {
            if (content.includes(phrase.toLowerCase())) {
                foundPhrases.push(phrase);
            }
        }

        // Calculate scores
        const aiPhraseScore = Math.max(0, 100 - (foundPhrases.length * 10));

        // Word count score (ideal 1500-3000)
        let wordCountScore = 100;
        if (wordCount < 500) wordCountScore = 30;
        else if (wordCount < 1000) wordCountScore = 60;
        else if (wordCount < 1500) wordCountScore = 80;
        else if (wordCount > 5000) wordCountScore = 70;
        else if (wordCount > 3000) wordCountScore = 90;

        // Readability - simple sentence length check
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : 0;
        let readabilityScore = 100;
        if (avgSentenceLength > 30) readabilityScore = 50;
        else if (avgSentenceLength > 25) readabilityScore = 70;
        else if (avgSentenceLength > 20) readabilityScore = 85;

        // Overall quality score
        const qualityScore = Math.round(
            (aiPhraseScore * 0.4) + (wordCountScore * 0.3) + (readabilityScore * 0.3)
        );

        // Status
        let status: 'excellent' | 'good' | 'needs_work' | 'poor';
        if (qualityScore >= 85) status = 'excellent';
        else if (qualityScore >= 70) status = 'good';
        else if (qualityScore >= 50) status = 'needs_work';
        else status = 'poor';

        // Recommendations
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

        // Quality score calculated on-demand; not persisted to DB

        return NextResponse.json({
            articleId: id,
            title: article.title,
            qualityScore,
            status,
            metrics: {
                wordCount,
                aiPhraseScore,
                wordCountScore,
                readabilityScore,
                avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
                sentenceCount: sentences.length,
            },
            aiPhrases: foundPhrases,
            recommendations,
        });
    } catch (error) {
        console.error('Article quality check failed:', error);
        return NextResponse.json({ error: 'Failed to analyze quality' }, { status: 500 });
    }
}
