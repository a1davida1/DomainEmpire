/**
 * Banned Words & Phrases — shared constant for content scanning and prompt injection.
 *
 * These are words/phrases that AI models overuse. They serve as AI detection
 * fingerprints and should be caught post-generation and re-humanized away.
 */

/** Single words that are strong AI fingerprints. Case-insensitive matching. */
export const BANNED_WORDS: string[] = [
    'delve',
    'landscape',
    'leverage',
    'navigate',
    'robust',
    'streamline',
    'utilize',
    'facilitate',
    'comprehensive',
    'paradigm',
    'game-changer',
    'crucial',
    'pivotal',
    'realm',
    'tapestry',
    'multifaceted',
    'holistic',
    'synergy',
    'foster',
    'encompasses',
    'underscores',
    'intricate',
];

/** Transition phrases AI models over-rely on. Case-insensitive matching. */
export const BANNED_TRANSITIONS: string[] = [
    'Additionally,',
    'Furthermore,',
    'Moreover,',
    "It's worth noting",
    'That said,',
    'In addition,',
    'On the other hand,',
    'In terms of',
    "It's important to note",
    'At the end of the day',
    'Key takeaways',
    'Consequently,',
    'Subsequently,',
    'Notably,',
];

/** All banned patterns combined for scanning. */
export const ALL_BANNED_PATTERNS: string[] = [
    ...BANNED_WORDS,
    ...BANNED_TRANSITIONS,
];
