export interface ParentOriginRequestLike {
    nextUrl: {
        origin: string;
    };
    headers: {
        get(name: string): string | null;
    };
}

function normalizeOrigin(input: string | null | undefined): string | null {
    if (!input) return null;
    try {
        return new URL(input).origin;
    } catch {
        return null;
    }
}

export function deriveAllowedParentOrigin(
    request: ParentOriginRequestLike,
    configuredParentOrigin: string | null | undefined = process.env.ALLOWED_PARENT_ORIGIN,
): string {
    const configuredOrigin = normalizeOrigin(configuredParentOrigin?.trim());

    const allowedOrigins = new Set([request.nextUrl.origin]);
    if (configuredOrigin) {
        allowedOrigins.add(configuredOrigin);
    }

    const originHeader = request.headers.get('origin');
    const refererOrigin = normalizeOrigin(request.headers.get('referer'));

    const candidates = [originHeader, refererOrigin, request.nextUrl.origin, configuredOrigin];

    for (const candidate of candidates) {
        if (candidate && allowedOrigins.has(candidate)) {
            return candidate;
        }
    }

    return '';
}
