import { isIP } from 'node:net';

const MAX_PROMPT_BODY_CHARS = 2_000;

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CANDIDATE_IP_RE = /(^|[^A-Za-z0-9:._-])(([A-Fa-f0-9:.]+))(?![A-Za-z0-9:._-])/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

function redactIpLiterals(input: string): string {
    return input.replaceAll(CANDIDATE_IP_RE, (match, prefix: string, candidate: string) => {
        const token = String(candidate ?? '');
        return isIP(token) > 0 ? `${prefix}[redacted-ip]` : match;
    });
}

function clampPromptBody(value: string): string {
    if (value.length <= MAX_PROMPT_BODY_CHARS) {
        return value;
    }

    return `${value.slice(0, MAX_PROMPT_BODY_CHARS)}\n...[truncated]`;
}

export function redactPromptBody(promptBody: string): string {
    const normalized = promptBody.replaceAll('\r\n', '\n');
    const redacted = redactIpLiterals(normalized)
        .replaceAll(EMAIL_RE, '[redacted-email]')
        .replaceAll(PHONE_RE, '[redacted-phone]');

    return clampPromptBody(redacted);
}

export { MAX_PROMPT_BODY_CHARS };
