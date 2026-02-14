import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSRFError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface SafeFetchInit extends RequestInit {
  maxRedirects?: number;
  timeoutMs?: number;
  allowedHosts?: ReadonlyArray<string>;
  allowedHostSuffixes?: ReadonlyArray<string>;
  allowedPorts?: ReadonlyArray<number>;
}

export interface SafeDownloadOptions extends Omit<SafeFetchInit, 'method' | 'body'> {
  maxBytes?: number;
  allowedContentTypePrefixes?: ReadonlyArray<string>;
}

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',
  '169.254.169.254',
]);

function parseIPv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let out = 0;
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (!Number.isInteger(n) || n < 0 || n > 255) {
      return null;
    }
    out = (out << 8) | n;
  }
  return out >>> 0;
}

function isInCidr(ipInt: number, networkInt: number, maskBits: number): boolean {
  if (maskBits <= 0) return true;
  const mask = (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipInt & mask) === (networkInt & mask);
}

function isForbiddenIPv4(ip: string): boolean {
  const ipInt = parseIPv4ToInt(ip);
  if (ipInt === null) return true;

  const cidrBlocks: Array<[string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ];

  return cidrBlocks.some(([network, bits]) => {
    const networkInt = parseIPv4ToInt(network);
    if (networkInt === null) return false;
    return isInCidr(ipInt, networkInt, bits);
  });
}

function isForbiddenIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === '::' || normalized === '::1') {
    return true;
  }

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const mappedMatch = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedMatch) {
    return isForbiddenIPv4(mappedMatch[1]);
  }

  const firstHextet = normalized.split(':').find((segment) => segment.length > 0) ?? '0';
  const firstValue = Number.parseInt(firstHextet, 16);
  if (!Number.isFinite(firstValue)) {
    return true;
  }

  // fc00::/7 unique local, fe80::/10 link local, ff00::/8 multicast
  if ((firstValue & 0xfe00) === 0xfc00) return true;
  if ((firstValue & 0xffc0) === 0xfe80) return true;
  if ((firstValue & 0xff00) === 0xff00) return true;

  // Documentation range 2001:db8::/32
  if (normalized.startsWith('2001:db8:')) return true;

  // 6to4 tunneling 2002::/16
  if (firstValue === 0x2002) return true;

  // Teredo tunneling 2001:0000::/32
  if (firstValue === 0x2001) {
    const segments = normalized.split(':');
    const secondHextet = segments.length > 1 ? segments[1] : '';
    if (secondHextet === '' || secondHextet === '0' || secondHextet === '0000') return true;
  }

  return false;
}

function validateIp(ip: string): void {
  const kind = isIP(ip);
  if (kind === 4) {
    if (isForbiddenIPv4(ip)) {
      throw new SSRFError(`IP address ${ip} is forbidden.`);
    }
    return;
  }

  if (kind === 6) {
    if (isForbiddenIPv6(ip)) {
      throw new SSRFError(`IP address ${ip} is forbidden.`);
    }
    return;
  }

  throw new SSRFError('Invalid IP address format.');
}

function hostnameMatchesSuffix(hostname: string, suffix: string): boolean {
  const host = hostname.toLowerCase();
  const allowed = suffix.toLowerCase();
  return host === allowed || host.endsWith(`.${allowed}`);
}

function isPortAllowed(url: URL, allowedPorts: ReadonlyArray<number>): boolean {
  if (url.port && url.port.trim().length > 0) {
    const n = Number.parseInt(url.port, 10);
    return Number.isFinite(n) && allowedPorts.includes(n);
  }

  if (url.protocol === 'http:') return allowedPorts.includes(80);
  if (url.protocol === 'https:') return allowedPorts.includes(443);
  return false;
}

export async function validateUrl(urlString: string): Promise<string[]> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new SSRFError('Invalid URL format.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new SSRFError('Invalid protocol. Only HTTP and HTTPS are allowed.');
  }

  if (url.username || url.password) {
    throw new SSRFError('Credentials in URL are not allowed.');
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname.trim().length === 0) {
    throw new SSRFError('Invalid hostname.');
  }

  if (BLOCKED_HOSTS.has(hostname)) {
    throw new SSRFError('Access to this host is forbidden.');
  }

  if (isIP(hostname)) {
    validateIp(hostname);
    return [hostname];
  }

  let ipv4s: string[] = [];
  let ipv6s: string[] = [];

  try {
    ipv4s = await dns.resolve4(hostname);
  } catch {
    ipv4s = [];
  }

  try {
    ipv6s = await dns.resolve6(hostname);
  } catch {
    ipv6s = [];
  }

  const allIps = [...ipv4s, ...ipv6s];
  if (allIps.length === 0) {
    throw new SSRFError('Hostname could not be resolved.');
  }

  for (const ip of allIps) {
    validateIp(ip);
  }

  return allIps;
}

async function validateUrlWithPolicy(
  urlString: string,
  policy?: Pick<SafeFetchInit, 'allowedHosts' | 'allowedHostSuffixes' | 'allowedPorts'>,
): Promise<{ url: URL; resolvedIp: string }> {
  const resolvedIps = await validateUrl(urlString);
  const url = new URL(urlString);

  const allowedPorts = policy?.allowedPorts ?? [80, 443];
  if (!isPortAllowed(url, allowedPorts)) {
    throw new SSRFError('Destination port is not allowed.');
  }

  if (policy?.allowedHosts && policy.allowedHosts.length > 0) {
    const ok = policy.allowedHosts.some((host) => host.toLowerCase() === url.hostname.toLowerCase());
    if (!ok) {
      throw new SSRFError('Destination host is not allowed.');
    }
  }

  if (policy?.allowedHostSuffixes && policy.allowedHostSuffixes.length > 0) {
    const ok = policy.allowedHostSuffixes.some((suffix) => hostnameMatchesSuffix(url.hostname, suffix));
    if (!ok) {
      throw new SSRFError('Destination host is not allowed.');
    }
  }

  return { url, resolvedIp: resolvedIps[0] };
}

function mergeAbortSignals(primary: AbortSignal | undefined, secondary: AbortSignal): AbortSignal {
  if (!primary) {
    return secondary;
  }

  const controller = new AbortController();

  if (primary.aborted || secondary.aborted) {
    controller.abort();
    return controller.signal;
  }

  const primaryHandler = () => {
    secondary.removeEventListener('abort', secondaryHandler);
    controller.abort();
  };
  const secondaryHandler = () => {
    primary.removeEventListener('abort', primaryHandler);
    controller.abort();
  };

  primary.addEventListener('abort', primaryHandler, { once: true });
  secondary.addEventListener('abort', secondaryHandler, { once: true });
  return controller.signal;
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRate = refillRatePerSecond / 1000;
    this.lastRefill = Date.now();
  }

  consume(cost: number = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const newTokens = elapsed * this.refillRate;

    if (newTokens > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
}

const GLOBAL_SSRF_LIMITER = new TokenBucket(50, 10);

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
}

export async function safeFetch(url: string, init?: SafeFetchInit): Promise<Response>;
export async function safeFetch(url: string, init: SafeFetchInit | undefined, returnMeta: true): Promise<SafeFetchResult>;
export async function safeFetch(url: string, init?: SafeFetchInit, returnMeta?: boolean): Promise<Response | SafeFetchResult> {
  if (!GLOBAL_SSRF_LIMITER.consume()) {
    throw new RateLimitError('Outbound request rate limit exceeded.');
  }

  const maxRedirects = init?.maxRedirects ?? 3;
  const timeoutMs = init?.timeoutMs ?? 10_000;
  const { url: currentUrl, resolvedIp } = await validateUrlWithPolicy(url, init);

  // Build fetch URL using validated IP to prevent DNS rebinding
  const fetchUrl = new URL(currentUrl.toString());
  const originalHostname = fetchUrl.hostname;
  fetchUrl.hostname = isIP(resolvedIp) === 6 ? `[${resolvedIp}]` : resolvedIp;

  const abort = new AbortController();
  const timeoutId = setTimeout(() => abort.abort(), timeoutMs);
  const signal = mergeAbortSignals(init?.signal ?? undefined, abort.signal);

  const requestInit: RequestInit = {
    ...init,
    signal,
    redirect: 'manual',
    headers: {
      ...Object.fromEntries(new Headers(init?.headers).entries()),
      Host: originalHostname,
    },
  };

  delete (requestInit as unknown as Record<string, unknown>).maxRedirects;
  delete (requestInit as unknown as Record<string, unknown>).timeoutMs;
  delete (requestInit as unknown as Record<string, unknown>).allowedHosts;
  delete (requestInit as unknown as Record<string, unknown>).allowedHostSuffixes;
  delete (requestInit as unknown as Record<string, unknown>).allowedPorts;

  try {
    const response = await fetch(fetchUrl.toString(), requestInit);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return returnMeta ? { response, finalUrl: currentUrl.toString() } : response;
      }
      if (maxRedirects <= 0) {
        throw new SSRFError('Too many redirects.');
      }

      const nextUrl = new URL(location, currentUrl);
      if (currentUrl.protocol === 'https:' && nextUrl.protocol === 'http:') {
        throw new SSRFError('Redirect downgrade to HTTP is not allowed.');
      }

      return safeFetch(nextUrl.toString(), {
        ...init,
        maxRedirects: maxRedirects - 1,
        signal,
      }, returnMeta as true);
    }

    return returnMeta ? { response, finalUrl: currentUrl.toString() } : response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function safeDownloadToBuffer(
  url: string,
  options?: SafeDownloadOptions,
): Promise<{ buffer: Buffer; contentType: string; finalUrl: string }> {
  const maxBytes = options?.maxBytes ?? 15 * 1024 * 1024;
  const allowedPrefixes = options?.allowedContentTypePrefixes ?? ['image/'];

  const { response, finalUrl } = await safeFetch(url, {
    ...options,
    method: 'GET',
    headers: options?.headers,
  }, true);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const typeAllowed = allowedPrefixes.some((prefix) => contentType.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!typeAllowed) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
      throw new Error(`Response too large (> ${maxBytes} bytes)`);
    }
  }

  if (!response.body) {
    throw new Error('No response body.');
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > maxBytes) {
        throw new Error(`Response too large (> ${maxBytes} bytes)`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return {
    buffer: Buffer.concat(chunks, total),
    contentType,
    finalUrl,
  };
}
