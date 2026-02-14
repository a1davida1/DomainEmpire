/**
 * Shared Retry Utility with Configurable Exponential Backoff
 *
 * Consolidates 14+ retry implementations across the codebase into one
 * well-tested, configurable utility.
 *
 * ## Usage:
 *
 *   import { withRetry, withHttpRetry, withDbRetry, calculateBackoff } from '../lib/retry.js';
 *
 *   // Simple retry with defaults (3 retries, 1s base, 30s max, jitter enabled)
 *   const result = await withRetry(() => fetchFromReddit(url));
 *
 *   // Custom configuration
 *   const result = await withRetry(() => callOpenRouter(prompt), {
 *     maxRetries: 5,
 *     baseDelayMs: 2000,
 *     maxDelayMs: 60000,
 *     jitter: true,
 *     retryOn: (error) => error.statusCode === 429 || error.statusCode >= 500,
 *     onRetry: (error, attempt) => logger.warn('Retrying', { error, attempt }),
 *   });
 *
 *   // Calculate delay only (for queue scheduling etc.)
 *   const delayMs = calculateBackoff(attempt, { baseDelayMs: 1000, maxDelayMs: 30000 });
 *
 * @module server/lib/retry
 */

import crypto from 'node:crypto';
import { logger } from './logger';

// ==========================================
// TYPES
// ==========================================

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs?: number;

  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelayMs?: number;

  /** Whether to add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;

  /** Backoff multiplier (default: 2 for exponential) */
  multiplier?: number;

  /**
   * Predicate to determine if the error is retryable.
   * Return true to retry, false to fail immediately.
   * Default: retries on all errors.
   */
  retryOn?: (error: unknown) => boolean;

  /**
   * Callback invoked before each retry attempt.
   * Useful for logging or metrics.
   */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;

  /** AbortSignal to cancel retries externally */
  signal?: AbortSignal;

  /** Label for log messages (e.g., 'openrouter', 'reddit-api') */
  label?: string;
}

export interface BackoffOptions {
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;

  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelayMs?: number;

  /** Backoff multiplier (default: 2) */
  multiplier?: number;

  /** Whether to add random jitter (default: true) */
  jitter?: boolean;
}

// ==========================================
// CORE FUNCTIONS
// ==========================================

/**
 * Calculate exponential backoff delay for a given attempt.
 *
 * Formula: min(baseDelay * multiplier^attempt + jitter, maxDelay)
 *
 * Uses crypto.randomInt for jitter instead of Math.random() (platform policy).
 *
 * @param attempt - Zero-based attempt index (0 = first retry)
 * @param options - Backoff configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number, options: BackoffOptions = {}): number {
  const {
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    multiplier = 2,
    jitter = true,
  } = options;

  const exponentialDelay = baseDelayMs * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  if (!jitter) {
    return cappedDelay;
  }

  // Full jitter: random value in [0, cappedDelay)
  // Prevents thundering herd when multiple instances retry simultaneously
  const jitterAmount = crypto.randomInt(0, Math.max(1, Math.floor(cappedDelay)));
  return Math.min(jitterAmount, maxDelayMs);
}

/**
 * Execute an async function with automatic retry and exponential backoff.
 *
 * @param fn - The async function to execute and potentially retry
 * @param options - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const data = await withRetry(
 *   () => fetch('https://api.reddit.com/...').then(r => r.json()),
 *   {
 *     maxRetries: 3,
 *     baseDelayMs: 1000,
 *     retryOn: (err) => err instanceof Error && err.message.includes('429'),
 *     label: 'reddit-api',
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    multiplier = 2,
    jitter = true,
    retryOn,
    onRetry,
    signal,
    label,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check abort signal before each attempt
    if (signal?.aborted) {
      throw new Error(`Retry aborted${label ? ` [${label}]` : ''}: ${signal.reason || 'AbortSignal triggered'}`);
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If this was the last attempt, don't retry
      if (attempt >= maxRetries) {
        break;
      }

      // Check if the error is retryable
      if (retryOn && !retryOn(error)) {
        break;
      }

      // Calculate delay
      const delayMs = calculateBackoff(attempt, { baseDelayMs, maxDelayMs, multiplier, jitter });

      // Notify caller of retry
      if (onRetry) {
        onRetry(error, attempt + 1, delayMs);
      } else if (label) {
        logger.warn(`Retrying ${label}`, {
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Wait before retrying
      await sleep(delayMs, signal);
    }
  }

  throw lastError;
}

// ==========================================
// CONVENIENCE WRAPPERS
// ==========================================

/**
 * Retry with typical settings for external HTTP APIs (Reddit, OpenRouter, Imgur).
 *
 * - 3 retries
 * - 2s base delay
 * - 30s max delay
 * - Retries on 429, 500, 502, 503, 504
 * - Full jitter
 */
export function withHttpRetry<T>(
  fn: () => Promise<T>,
  label: string,
  overrides: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    jitter: true,
    retryOn: (error) => {
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;
        return status === 429 || status >= 500;
      }
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const status = (error as { statusCode: number }).statusCode;
        return status === 429 || status >= 500;
      }
      // Retry on network errors
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes('econnrefused') || msg.includes('econnreset') ||
               msg.includes('etimedout') || msg.includes('fetch failed') ||
               msg.includes('network') || msg.includes('socket hang up');
      }
      return false;
    },
    label,
    ...overrides,
  });
}

/**
 * Retry with typical settings for database operations.
 *
 * - 2 retries
 * - 500ms base delay
 * - 5s max delay
 * - Retries on connection/timeout errors only
 */
export function withDbRetry<T>(
  fn: () => Promise<T>,
  label: string,
  overrides: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(fn, {
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    jitter: true,
    retryOn: (error) => {
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes('connection') || msg.includes('timeout') ||
               msg.includes('econnrefused') || msg.includes('too many clients');
      }
      return false;
    },
    label,
    ...overrides,
  });
}

// ==========================================
// INTERNAL HELPERS
// ==========================================

/**
 * Sleep for a given number of milliseconds.
 * Respects AbortSignal for cancellation.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new Error('Sleep aborted'));
    }

    if (!signal) {
      setTimeout(resolve, ms);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Sleep aborted'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
