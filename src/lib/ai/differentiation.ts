import { createHash } from 'node:crypto';

type DifferentiationStage = 'outline' | 'draft' | 'humanize' | 'seo' | 'keyword_research';

function stableIndex(seed: string, size: number): number {
    if (size <= 0) return 0;
    const hash = createHash('sha256').update(seed).digest();
    const value = hash.readUInt32BE(0);
    return value % size;
}

function pick<T>(seed: string, values: T[]): T {
    return values[stableIndex(seed, values.length)];
}

const PERSPECTIVE_LENSES = [
    'operator-first: focus on execution constraints and tradeoffs',
    'consumer-outcome-first: optimize for clarity and decision confidence',
    'skeptical-analyst: highlight assumptions and validation steps',
    'pragmatic-builder: emphasize practical implementation details',
    'risk-manager: surface downside, edge cases, and mitigation',
];

const NARRATIVE_STYLES = [
    'problem -> constraints -> options -> recommendation',
    'myth -> evidence -> practical takeaway',
    'decision criteria -> scenario walkthrough -> action plan',
    'baseline -> optimization path -> failure mode checks',
];

const SECTION_RHYTHMS = [
    'short opener, dense middle, concise action close',
    'evidence-first paragraphs with one concrete takeaway each',
    'alternating concise bullets and explanatory paragraphs',
    'question-driven subheads with direct answers',
];

const FORBIDDEN_OPENERS = [
    'avoid generic opener: "In today\'s..."',
    'avoid generic opener: "When it comes to..."',
    'avoid generic opener: "If you\'re looking for..."',
];

const BUCKET_SHAPING: Record<string, string> = {
    build: 'growth-oriented and implementation-heavy',
    redirect: 'transition-oriented and concise',
    park: 'signal-gathering and low-maintenance',
    defensive: 'risk-minimizing and policy-conservative',
};

export function buildDomainDifferentiationInstructions(opts: {
    domainId: string;
    domainName: string;
    niche?: string | null;
    bucket?: string | null;
    keyword?: string;
    stage: DifferentiationStage;
}): string {
    const seedBase = [
        opts.domainId,
        opts.domainName,
        opts.niche || 'general',
        opts.bucket || 'build',
        opts.keyword || '',
        opts.stage,
    ].join(':');

    const perspective = pick(`${seedBase}:perspective`, PERSPECTIVE_LENSES);
    const narrative = pick(`${seedBase}:narrative`, NARRATIVE_STYLES);
    const rhythm = pick(`${seedBase}:rhythm`, SECTION_RHYTHMS);
    const forbiddenOpener = pick(`${seedBase}:opener`, FORBIDDEN_OPENERS);
    const bucketShape = BUCKET_SHAPING[opts.bucket || 'build'] || BUCKET_SHAPING.build;

    return `
DOMAIN DIFFERENTIATION GUARDRAILS:
- Domain identity: ${opts.domainName}
- Perspective lens: ${perspective}
- Narrative pattern: ${narrative}
- Section rhythm: ${rhythm}
- Bucket posture: ${bucketShape}
- ${forbiddenOpener}
- Never reference, promote, or link to other domains in the same portfolio/network.
- Keep recommendations independent and user-first (no forced affiliate framing).
`.trim();
}

export function buildIntentCoverageGuidance(
    intentCounts: Record<string, number>,
    targetCount: number,
): string {
    const orderedIntents = ['informational', 'commercial', 'transactional', 'navigational'];
    const withCounts = orderedIntents.map((intent) => ({
        intent,
        count: intentCounts[intent] ?? 0,
    })).sort((a, b) => a.count - b.count);

    const prioritize = withCounts.slice(0, 2).map((item) => item.intent);
    const currentMix = orderedIntents
        .map((intent) => `${intent}:${intentCounts[intent] ?? 0}`)
        .join(', ');

    return [
        `Current intent mix for this domain: ${currentMix}`,
        `Prioritize underrepresented intents in this batch: ${prioritize.join(', ') || 'informational, commercial'}.`,
        `Target batch size: ${targetCount}. Do not output only one intent class.`,
    ].join('\n');
}
