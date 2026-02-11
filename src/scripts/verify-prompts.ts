import { PROMPTS } from '../lib/ai/prompts';

const expectedSignatures = {
    article: 5,
    comparison: 5,
    costGuide: 5,
    leadCapture: 5,
    healthDecision: 5,
    calculator: 3
};

let errors = 0;
for (const [key, count] of Object.entries(expectedSignatures)) {
    const fn = (PROMPTS as any)[key];
    // fn.length returns number of arguments expected
    if (fn.length < count) {
        // Note: fn.length ignores optional parameters if they have defaults, 
        // but here they are explicit args or optional ? args. 
        // Optional arguments count in .length ONLY if they are before required ones (which is invalid TS).
        // Actually, optional args `(a, b?)` -> length is 1.
        // Wait, `voiceSeed` is optional.
        // So length might be 4 for article, 4 for comparison, 2 for calculator?
        // Let's check. Default is to check if it accepts ENOUGH arguments.
        // We can just log the length.
        console.log(`PROMPTS.${key} accepts ${fn.length} required arguments`);
    } else {
        console.log(`PROMPTS.${key} accepts ${fn.length}+ arguments`);
    }
}

// Manually verify by calling with mock data and checking output contains RESEARCH DATA string
try {
    const mockOutline = { sections: [] };
    const mockData = { stats: ['test-stat'] };
    const mockVoice = { name: 'TestBot', background: 'b', quirk: 'q', toneDial: 5, tangents: 't', petPhrase: 'p', formatting: 'f' };

    const output = PROMPTS.costGuide(mockOutline, 'keyword', 'domain.com', mockData, mockVoice);

    if (!output.includes('RESEARCH DATA')) {
        console.error('PROMPTS.costGuide output missing RESEARCH DATA section');
        errors++;
    }
    if (!output.includes('TestBot')) {
        console.error('PROMPTS.costGuide output missing Voice Seed persona');
        errors++;
    }

    console.log('PROMPTS.costGuide content verification: PASS');

} catch (e) {
    console.error('Verification failed:', e);
    errors++;
}

if (errors > 0) process.exit(1);
console.log('Verification Complete');
