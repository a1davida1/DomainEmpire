
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getAIClient } from './openrouter';
import { PROMPTS } from './prompts';

export async function getOrCreateVoiceSeed(domainId: string, domainName: string, niche: string) {
    const domainRecord = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    const domain = domainRecord[0];

    if (domain?.contentConfig?.voiceSeed) {
        return domain.contentConfig.voiceSeed;
    }

    // Generate new seed
    const ai = getAIClient();
    const prompt = PROMPTS.voiceSeed(niche || 'general topic');

    try {
        const response = await ai.generateJSON<{
            name: string;
            background: string;
            quirk: string;
            toneDial: number;
            tangents: string;
            petPhrase: string;
            formatting: string;
        }>('voiceSeedGeneration', prompt);

        const currentConfig = domain?.contentConfig || {};
        const newConfig = {
            ...currentConfig,
            voiceSeed: response.data
        };

        await db.update(domains)
            .set({ contentConfig: newConfig })
            .where(eq(domains.id, domainId));

        return response.data;
    } catch (error) {
        console.error('Failed to generate voice seed:', error);
        return undefined;
    }
}
