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
    const fn = (PROMPTS as Record<string, (...args: unknown[]) => string>)[key];
    // fn.length returns number of arguments expected
    if (fn.length < count) {
        console.error(`ERROR: PROMPTS.${key} requires ${count} args, but accepts ${fn.length}`);
        errors++;
    } else {
        console.log(`PROMPTS.${key} signature OK (${fn.length} args)`);
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

    if (errors === 0) {
        console.log('PROMPTS.costGuide content verification: PASS');
    }

} catch (e) {
    console.error('Verification failed:', e);
    errors++;
}

if (errors > 0) {
    console.error(`Verification FAILED with ${errors} errors`);
    process.exit(1);
} else {
    console.log('Verification Complete: ALL OK');
    process.exit(0);
}
