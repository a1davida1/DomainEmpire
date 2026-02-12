/**
 * Fetch wrapper with exponential backoff retry for client-side usage.
 *
 * Retries on network errors and 5xx responses. Does NOT retry on 4xx
 * since those indicate client-side issues that won't resolve on retry.
 */
export async function fetchWithRetry(
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: { maxRetries?: number; baseDelayMs?: number }
): Promise<Response> {
    const maxRetries = options?.maxRetries ?? 2;
    const baseDelay = options?.baseDelayMs ?? 500;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(input, init);

            // Only retry idempotent methods or if an idempotency key is present
            const method = init?.method?.toUpperCase() || 'GET';
            const isIdempotent = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);
            const headers = new Headers(init?.headers);
            const hasIdempotencyKey = headers.has('Idempotency-Key');

            if (!isIdempotent && !hasIdempotencyKey) {
                return response;
            }

            // Don't retry client errors (4xx)
            if (response.status >= 400 && response.status < 500) {
                return response;
            }

            // Retry server errors (5xx)
            if (response.status >= 500 && attempt < maxRetries) {
                await delay(baseDelay * 2 ** attempt);
                continue;
            }

            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt < maxRetries) {
                await delay(baseDelay * 2 ** attempt);
            }
        }
    }

    throw lastError ?? new Error('Fetch failed after retries');
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
