/**
 * Secure Random Utilities
 *
 * Provides cryptographically secure random value generation.
 * Uses Node.js crypto module instead of Math.random() for:
 * - Security-sensitive operations (tokens, passwords, IDs)
 * - Unpredictable values that shouldn't be guessable
 * - Values that need to be unique across distributed systems
 *
 * NEVER use Math.random() for any of these purposes.
 *
 * @module server/lib/secure-random
 */

import crypto from 'crypto';

/**
 * Character sets for random string generation
 */
const CHAR_SETS = {
  /** Alphanumeric (a-z, A-Z, 0-9) */
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  /** Lowercase alphanumeric (a-z, 0-9) */
  alphanumericLower: 'abcdefghijklmnopqrstuvwxyz0123456789',
  /** Hex characters (0-9, a-f) */
  hex: '0123456789abcdef',
  /** URL-safe base64 */
  urlSafe: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  /** Password-safe characters (excludes ambiguous: 0, O, l, 1, I) */
  passwordSafe: 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*',
} as const;

type CharSetName = keyof typeof CHAR_SETS;

/**
 * Generate a cryptographically secure UUID v4
 *
 * Uses crypto.randomUUID() which is cryptographically secure.
 *
 * Usage:
 * ```typescript
 * const userId = secureUUID();
 * // Returns: "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function secureUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a cryptographically secure random string
 *
 * @param length - Length of the string to generate
 * @param charSet - Character set to use (default: alphanumericLower)
 *
 * Uses crypto.randomBytes() which is cryptographically secure.
 * The algorithm uses rejection sampling to avoid modulo bias.
 *
 * Usage:
 * ```typescript
 * const token = secureRandomString(32);
 * // Returns: "a7b3c9d2e5f1g8h4i6j0k2l5m9n1o3p7"
 *
 * const password = secureRandomString(16, 'passwordSafe');
 * // Returns: "Hk@9mN#pQ3rS&7vW"
 * ```
 */
export function secureRandomString(
  length: number,
  charSet: CharSetName | string = 'alphanumericLower'
): string {
  if (length <= 0) {
    throw new Error('Length must be positive');
  }

  const chars = typeof charSet === 'string' && charSet in CHAR_SETS
    ? CHAR_SETS[charSet as CharSetName]
    : charSet;

  if (!chars || chars.length === 0) {
    throw new Error('Character set cannot be empty');
  }

  const charCount = chars.length;
  const maxValid = 256 - (256 % charCount);

  const result: string[] = [];
  let bytesNeeded = length;

  while (result.length < length) {
    const randomBytes = crypto.randomBytes(bytesNeeded);

    for (let i = 0; i < randomBytes.length && result.length < length; i++) {
      const byte = randomBytes[i];
      // Rejection sampling to avoid modulo bias
      if (byte < maxValid) {
        result.push(chars[byte % charCount]);
      }
    }

    // If we rejected too many, generate more bytes
    bytesNeeded = length - result.length;
  }

  return result.join('');
}

/**
 * Generate a cryptographically secure random integer
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 *
 * Uses rejection sampling to ensure uniform distribution.
 *
 * Usage:
 * ```typescript
 * const roll = secureRandomInt(1, 6);
 * // Returns: 1, 2, 3, 4, 5, or 6 with equal probability
 * ```
 */
export function secureRandomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error('min and max must be integers');
  }

  if (min > max) {
    throw new Error('min must be less than or equal to max');
  }

  if (min === max) {
    return min;
  }

  // Prefer Node's built-in crypto.randomInt which is unbiased and CodeQL-friendly.
  // Note: crypto.randomInt returns values in [min, maxExclusive). We want inclusive max.
  // Node's implementation supports ranges < 2^48; enforce that bound explicitly.
  const maxExclusive = max + 1;
  if (!Number.isSafeInteger(maxExclusive)) {
    throw new Error('max is too large for secure random integer generation');
  }

  const range = maxExclusive - min;
  const MAX_RANGE = 2 ** 48; // crypto.randomInt requirement
  if (range <= 0 || range > MAX_RANGE) {
    throw new Error('Range too large for secure random integer generation');
  }

  return crypto.randomInt(min, maxExclusive);
}

/**
 * Generate a cryptographically secure random floating point number in [0, 1)
 *
 * Uses 53 bits of randomness (the maximum integer precision in IEEE-754 doubles)
 * to produce a uniformly distributed float in [0, 1).
 *
 * Usage:
 * ```typescript
 * const p = secureRandomFloat(); // 0 <= p < 1
 * ```
 */
export function secureRandomFloat(): number {
  // Use 64-bit randomness, keep the top 53 bits.
  const buf = crypto.randomBytes(8);
  const value64 = buf.readBigUInt64BE(0);
  const value53 = value64 >> 11n; // 64 - 53 = 11
  return Number(value53) / 2 ** 53;
}

/**
 * Generate a cryptographically secure temporary password
 *
 * Generates a password with ~143 bits of entropy at default length 24
 * (log2(63) * 24 ≈ 143 bits). For 192 bits, use length >= 33.
 * Uses a character set that avoids ambiguous characters.
 *
 * @param length - Password length (minimum 16, default 24)
 *
 * Usage:
 * ```typescript
 * const tempPassword = secureTemporaryPassword();
 * // Returns: "Hk9mN#pQ3rS&7vWxY2zA%b"
 * ```
 */
export function secureTemporaryPassword(length: number = 24): string {
  if (length < 16) {
    throw new Error('Password length must be at least 16 characters for security');
  }

  return secureRandomString(length, 'passwordSafe');
}

/**
 * Generate a cryptographically secure hex string
 *
 * @param bytes - Number of bytes (output length will be 2x)
 *
 * Usage:
 * ```typescript
 * const token = secureHex(16);
 * // Returns: "a7b3c9d2e5f1a8b4c6d0e2f5a9b1c3d7"
 * ```
 */
export function secureHex(bytes: number): string {
  if (bytes <= 0) {
    throw new Error('Bytes must be positive');
  }

  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a cryptographically secure base64 string
 *
 * @param bytes - Number of bytes (output length will be ~4/3x)
 * @param urlSafe - Use URL-safe base64 (default: true)
 *
 * Usage:
 * ```typescript
 * const token = secureBase64(24);
 * // Returns: "YTdiM2M5ZDJlNWYxYThiNGM2ZDBlMmY1"
 * ```
 */
export function secureBase64(bytes: number, urlSafe: boolean = true): string {
  if (bytes <= 0) {
    throw new Error('Bytes must be positive');
  }

  const buffer = crypto.randomBytes(bytes);

  if (urlSafe) {
    return buffer.toString('base64url');
  }

  return buffer.toString('base64');
}

/**
 * Generate a secure worker ID for distributed systems
 *
 * Combines:
 * - Prefix for identification
 * - Process ID for local uniqueness
 * - Timestamp for temporal ordering
 * - Random suffix for collision avoidance
 *
 * @param prefix - Worker type prefix (e.g., 'post-worker', 'scheduler')
 *                 Must be alphanumeric with optional hyphens, max 32 chars
 *
 * Usage:
 * ```typescript
 * const workerId = secureWorkerId('scheduler');
 * // Returns: "scheduler-12345-1701234567890-a7b3c9d2"
 * ```
 */
export function secureWorkerId(prefix: string): string {
  // Validate prefix to prevent injection attacks and ensure consistent format
  if (!prefix || typeof prefix !== 'string') {
    throw new Error('Worker ID prefix is required');
  }

  if (prefix.length > 32) {
    throw new Error('Worker ID prefix must be 32 characters or less');
  }

  // Only allow alphanumeric characters and hyphens (no special chars, no spaces)
  if (!/^[a-zA-Z0-9-]+$/.test(prefix)) {
    throw new Error('Worker ID prefix must contain only alphanumeric characters and hyphens');
  }

  // Prefix cannot start or end with hyphen
  if (prefix.startsWith('-') || prefix.endsWith('-')) {
    throw new Error('Worker ID prefix cannot start or end with a hyphen');
  }

  const pid = process.pid;
  const timestamp = Date.now();
  const randomSuffix = secureRandomString(8, 'alphanumericLower');

  return `${prefix}-${pid}-${timestamp}-${randomSuffix}`;
}

/**
 * Generate a secure short ID (URL-friendly)
 *
 * Good for user-facing IDs where UUIDs are too long.
 * ~80 bits of entropy with 14 characters.
 *
 * Usage:
 * ```typescript
 * const shortId = secureShortId();
 * // Returns: "a7B3c9D2e5F1g8"
 * ```
 */
export function secureShortId(): string {
  return secureRandomString(14, 'alphanumeric');
}

/**
 * Generate a secure lead ID
 *
 * Designed for database storage with constraints.
 * Format: L + timestamp(base36) + random(base36)
 * Max length: 25 characters
 *
 * Usage:
 * ```typescript
 * const leadId = secureLeadId();
 * // Returns: "L1a2b3c4d5e6f7g8h9i0"
 * ```
 */
export function secureLeadId(): string {
  const timestamp = Date.now().toString(36);
  const random = secureRandomString(8, 'alphanumericLower');
  return `L${timestamp}${random}`.slice(0, 25);
}

/**
 * Generate a secure session ID
 *
 * 256 bits of entropy for session security.
 *
 * Usage:
 * ```typescript
 * const sessionId = secureSessionId();
 * // Returns a 64-character hex string
 * ```
 */
export function secureSessionId(): string {
  return secureHex(32);
}

/**
 * Generate a secure CSRF token
 *
 * 128 bits of entropy, URL-safe.
 *
 * Usage:
 * ```typescript
 * const csrfToken = secureCsrfToken();
 * // Returns a URL-safe base64 string
 * ```
 */
export function secureCsrfToken(): string {
  return secureBase64(16, true);
}

/**
 * Generate a secure API key
 *
 * Format: prefix_randomhex
 * Example: tpilot_a7b3c9d2e5f1a8b4c6d0e2f5a9b1c3d7
 *
 * @param prefix - API key prefix (default: 'tpilot')
 * @param bytes - Number of random bytes (default: 24 = 192 bits)
 */
export function secureApiKey(prefix: string = 'tpilot', bytes: number = 24): string {
  return `${prefix}_${secureHex(bytes)}`;
}

/**
 * Securely compare two strings in constant time
 *
 * Prevents timing attacks when comparing secrets.
 *
 * @param a - First string
 * @param b - Second string
 *
 * Usage:
 * ```typescript
 * if (secureCompare(providedToken, storedToken)) {
 *   // Tokens match
 * }
 * ```
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  // Pad both buffers to the same length to prevent timing leaks on length difference.
  // Using the max length ensures the comparison always takes the same time regardless
  // of whether inputs have the same length.
  const maxLen = Math.max(bufferA.length, bufferB.length);
  if (maxLen === 0) return true;

  const paddedA = Buffer.alloc(maxLen, 0);
  const paddedB = Buffer.alloc(maxLen, 0);
  bufferA.copy(paddedA);
  bufferB.copy(paddedB);

  // timingSafeEqual requires same-length buffers (guaranteed by padding above)
  const equal = crypto.timingSafeEqual(paddedA, paddedB);

  // Even if padded bytes match, actual lengths must also match
  return equal && bufferA.length === bufferB.length;
}

/**
 * Generate deterministic rate limit key member
 *
 * For Redis sorted sets, we need unique members per request.
 * This uses timestamp + counter + hash instead of Math.random().
 *
 * @param timestamp - Request timestamp
 * @param requestId - Unique request identifier (can be counter or UUID)
 */
export function deterministicRateLimitKey(timestamp: number, requestId: string): string {
  // Use first 8 chars of hash for uniqueness without random
  const hash = crypto.createHash('sha256')
    .update(`${timestamp}-${requestId}`)
    .digest('hex')
    .slice(0, 8);

  return `${timestamp}-${hash}`;
}

/**
 * Generate a unique request ID for rate limiting
 *
 * Counter-based for determinism, with process isolation and secure random
 * for collision avoidance across distributed instances.
 *
 * Format: {pid}-{counter}-{random}
 * - pid: Process ID for process isolation (prevents collisions across processes)
 * - counter: Monotonic counter for ordering within process
 * - random: 4-char secure random for additional collision avoidance
 */
let rateLimitCounter = 0;
const rateLimitPid = process.pid;

export function rateLimitRequestId(): string {
  rateLimitCounter = (rateLimitCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${rateLimitPid}-${rateLimitCounter}-${secureRandomString(4, 'alphanumericLower')}`;
}
