
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getAIClient } from './openrouter';
import { PROMPTS } from './prompts';

type VoiceSeed = {
    name: string;
    background: string;
    quirk: string;
    toneDial: number;
    tangents: string;
    petPhrase: string;
    formatting: string;
};

function titleCase(value: string): string {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function fallbackNameFromDomain(domainName: string): string {
    const root = domainName.split('.')[0]?.replaceAll(/[^a-zA-Z]/g, '') || 'Writer';
    return titleCase(root.slice(0, 12) || 'Writer');
}

async function getExistingVoiceTraits(excludeDomainId: string): Promise<{
    names: Set<string>;
    petPhrases: Set<string>;
    quirks: Set<string>;
}> {
    const rows = await db.select({
        id: domains.id,
        contentConfig: domains.contentConfig,
    }).from(domains);

    const names = new Set<string>();
    const petPhrases = new Set<string>();
    const quirks = new Set<string>();

    for (const row of rows) {
        if (row.id === excludeDomainId) continue;
        const voiceSeed = row.contentConfig?.voiceSeed;
        if (!voiceSeed || typeof voiceSeed !== 'object') continue;

        const name = typeof voiceSeed.name === 'string' ? voiceSeed.name.trim().toLowerCase() : '';
        const petPhrase = typeof voiceSeed.petPhrase === 'string' ? voiceSeed.petPhrase.trim().toLowerCase() : '';
        const quirk = typeof voiceSeed.quirk === 'string' ? voiceSeed.quirk.trim().toLowerCase() : '';

        if (name) names.add(name);
        if (petPhrase) petPhrases.add(petPhrase);
        if (quirk) quirks.add(quirk);
    }

    return { names, petPhrases, quirks };
}

function normalizeVoiceSeed(
    candidate: VoiceSeed,
    domainName: string,
    existing: { names: Set<string>; petPhrases: Set<string>; quirks: Set<string> },
): VoiceSeed {
    const fallbackName = fallbackNameFromDomain(domainName);
    const normalizedName = candidate.name.trim();
    const normalizedPetPhrase = candidate.petPhrase.trim();
    const normalizedQuirk = candidate.quirk.trim();

    const safeName = normalizedName.length > 0 ? normalizedName : fallbackName;
    const lowerName = safeName.toLowerCase();

    const safePetPhrase = normalizedPetPhrase.length > 0
        ? normalizedPetPhrase
        : `from ${fallbackName.toLowerCase()}`;
    const lowerPetPhrase = safePetPhrase.toLowerCase();

    const safeQuirk = normalizedQuirk.length > 0
        ? normalizedQuirk
        : 'Uses short, direct paragraphs with occasional side notes.';

    return {
        ...candidate,
        name: existing.names.has(lowerName) ? `${fallbackName} ${safeName.slice(0, 1).toUpperCase() || 'A'}` : safeName,
        petPhrase: existing.petPhrases.has(lowerPetPhrase) ? `${safePetPhrase} (${fallbackName.toLowerCase()})` : safePetPhrase,
        quirk: existing.quirks.has(safeQuirk.toLowerCase())
            ? `${safeQuirk} Includes one pragmatic checklist per article.`
            : safeQuirk,
        toneDial: Math.max(2, Math.min(9, Math.round(candidate.toneDial))),
    };
}

export async function getOrCreateVoiceSeed(domainId: string, domainName: string, niche: string) {
    const domainRecord = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    const domain = domainRecord[0];

    if (domain?.contentConfig?.voiceSeed) {
        return domain.contentConfig.voiceSeed;
    }

    // Generate new seed
    const ai = getAIClient();
    const existing = await getExistingVoiceTraits(domainId);
    const prompt = [
        PROMPTS.voiceSeed(niche || 'general topic'),
        '',
        'UNIQUENESS CONSTRAINTS:',
        `- Avoid these existing persona names: ${[...existing.names].slice(0, 20).join(', ') || 'none'}`,
        `- Avoid these existing pet phrases: ${[...existing.petPhrases].slice(0, 20).join(', ') || 'none'}`,
        `- Avoid these existing quirks: ${[...existing.quirks].slice(0, 20).join(', ') || 'none'}`,
    ].join('\n');

    try {
        const response = await ai.generateJSON<VoiceSeed>('voiceSeedGeneration', prompt);
        const normalizedSeed = normalizeVoiceSeed(response.data, domainName, existing);

        const currentConfig = domain?.contentConfig || {};
        const newConfig = {
            ...currentConfig,
            voiceSeed: normalizedSeed,
        };

        await db.update(domains)
            .set({ contentConfig: newConfig })
            .where(eq(domains.id, domainId));

        return normalizedSeed;
    } catch (error) {
        console.error('Failed to generate voice seed:', error);
        return undefined;
    }
}
