const MAX_PROMPT_BODY_CHARS = 2_000;

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6_RE = /\b(?:[a-f0-9]{1,4}:){2,7}[a-f0-9]{1,4}\b/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

function clampPromptBody(value: string): string {
    if (value.length <= MAX_PROMPT_BODY_CHARS) {
        return value;
    }

    return `${value.slice(0, MAX_PROMPT_BODY_CHARS)}\n...[truncated]`;
}

export function redactPromptBody(promptBody: string): string {
    const normalized = promptBody.replaceAll('\r\n', '\n');
    const redacted = normalized
        .replaceAll(EMAIL_RE, '[redacted-email]')
        .replaceAll(IPV4_RE, '[redacted-ip]')
        .replaceAll(IPV6_RE, '[redacted-ip]')
        .replaceAll(PHONE_RE, '[redacted-phone]');

    return clampPromptBody(redacted);
}

export { MAX_PROMPT_BODY_CHARS };
