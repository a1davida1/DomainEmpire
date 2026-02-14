import { logger } from './logger';

export type FailureCategory =
  | 'rate_limit'
  | 'timeout'
  | 'auth_expired'
  | 'platform_blocked'
  | 'policy_violation'
  | 'media_error'
  | 'network_error'
  | 'domain_unavailable'
  | 'economics_failed'
  | 'unknown';

export const FAILURE_CATEGORIES: readonly FailureCategory[] = [
  'rate_limit',
  'timeout',
  'auth_expired',
  'platform_blocked',
  'policy_violation',
  'media_error',
  'network_error',
  'domain_unavailable',
  'economics_failed',
  'unknown',
] as const;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ExtractedDetails {
  violationRule?: string;
  retryAfterSeconds?: number;
  blockedUntil?: Date;
  errorCode?: string;
  statusCode?: number;
}

export interface CategorizationResult {
  category: FailureCategory;
  confidence: ConfidenceLevel;
  humanReadable: string;
  suggestedAction: string;
  retryable: boolean;
  extractedDetails?: ExtractedDetails;
}

export interface SuggestedAction {
  action: string;
  actionLink?: string;
  actionLinkText?: string;
  description: string;
  canRetry: boolean;
  retryAfterSeconds?: number;
  autoRetry?: boolean;
}

export interface FailureReport extends CategorizationResult {
  suggestedActionDetails: SuggestedAction;
}

interface FailurePattern {
  pattern: RegExp;
  category: FailureCategory;
  confidence: ConfidenceLevel;
  humanReadable: string;
  suggestedAction: string;
  retryable: boolean;
  priority: number;
}

export const FAILURE_PATTERNS: FailurePattern[] = [
  {
    pattern: /429|rate.?limit|too.?many.?requests|retry.?after/i,
    category: 'rate_limit',
    confidence: 'high',
    humanReadable: 'Rate limit exceeded',
    suggestedAction: 'Wait for the retry window or reduce per-channel throughput.',
    retryable: true,
    priority: 100,
  },
  {
    pattern: /timeout|timed out|etimedout|aborterror|deadline exceeded/i,
    category: 'timeout',
    confidence: 'high',
    humanReadable: 'Request timed out',
    suggestedAction: 'Retry automatically with backoff.',
    retryable: true,
    priority: 95,
  },
  {
    pattern: /401|unauthorized|invalid.?token|token.?expired|oauth|forbidden.*token/i,
    category: 'auth_expired',
    confidence: 'high',
    humanReadable: 'Authentication expired or invalid',
    suggestedAction: 'Reconnect the account or refresh credentials.',
    retryable: false,
    priority: 92,
  },
  {
    pattern: /banned|blocked|suspended|restricted|account.?disabled|platform.?blocked/i,
    category: 'platform_blocked',
    confidence: 'high',
    humanReadable: 'Account or target is blocked by platform policy',
    suggestedAction: 'Use a different account/target and review platform policy.',
    retryable: false,
    priority: 90,
  },
  {
    pattern: /policy|violation|rejected|moderation|unsafe|disallowed|trademark/i,
    category: 'policy_violation',
    confidence: 'medium',
    humanReadable: 'Content failed policy checks',
    suggestedAction: 'Revise content and re-run policy checks before retry.',
    retryable: false,
    priority: 86,
  },
  {
    pattern: /image|video|media|upload|mime|unsupported format|ffmpeg/i,
    category: 'media_error',
    confidence: 'medium',
    humanReadable: 'Media processing or upload failed',
    suggestedAction: 'Validate media format/size and retry.',
    retryable: false,
    priority: 82,
  },
  {
    pattern: /econnrefused|econnreset|enotfound|dns|network|socket hang up|503|502|504/i,
    category: 'network_error',
    confidence: 'high',
    humanReadable: 'Network or upstream service error',
    suggestedAction: 'Retry automatically; escalate if persistent.',
    retryable: true,
    priority: 80,
  },
  {
    pattern: /domain not available|already registered|whois unavailable|dns propagation pending/i,
    category: 'domain_unavailable',
    confidence: 'high',
    humanReadable: 'Domain is unavailable or not yet ready',
    suggestedAction: 'Switch candidate or place on watchlist until state changes.',
    retryable: false,
    priority: 78,
  },
  {
    pattern: /roi|economics|max bid|underwriting|confidence too low|negative expectancy/i,
    category: 'economics_failed',
    confidence: 'high',
    humanReadable: 'Candidate failed underwriting economics',
    suggestedAction: 'Reject or lower bid plan based on hard fail thresholds.',
    retryable: false,
    priority: 70,
  },
];

function extractErrorMessage(error: Error | string | unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }

  return 'Unknown error';
}

function extractStatusCode(error: unknown, fallback?: number): number | undefined {
  if (typeof fallback === 'number') {
    return fallback;
  }

  if (error && typeof error === 'object') {
    if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
      return (error as { status: number }).status;
    }
    if ('statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number') {
      return (error as { statusCode: number }).statusCode;
    }
  }

  return undefined;
}

function extractRetryAfterSeconds(message: string): number | undefined {
  const direct = message.match(/retry.?after\s*[:=]?\s*(\d+)/i);
  if (direct) {
    return Number.parseInt(direct[1], 10);
  }

  const minutes = message.match(/(\d+)\s*minute/);
  if (minutes) {
    return Number.parseInt(minutes[1], 10) * 60;
  }

  const seconds = message.match(/(\d+)\s*second/);
  if (seconds) {
    return Number.parseInt(seconds[1], 10);
  }

  return undefined;
}

export class FailureCategorizer {
  static categorize(error: Error | string | unknown, statusCode?: number): CategorizationResult {
    const message = extractErrorMessage(error);
    const normalized = message.toLowerCase();
    const resolvedStatusCode = extractStatusCode(error, statusCode);

    for (const pattern of [...FAILURE_PATTERNS].sort((a, b) => b.priority - a.priority)) {
      if (pattern.pattern.test(normalized)) {
        const extracted: ExtractedDetails = {
          statusCode: resolvedStatusCode,
          retryAfterSeconds: extractRetryAfterSeconds(message),
        };

        logger.debug('[FailureCategorizer] Pattern matched', {
          category: pattern.category,
          confidence: pattern.confidence,
        });

        return {
          category: pattern.category,
          confidence: pattern.confidence,
          humanReadable: pattern.humanReadable,
          suggestedAction: pattern.suggestedAction,
          retryable: pattern.retryable,
          extractedDetails: extracted,
        };
      }
    }

    logger.debug('[FailureCategorizer] No pattern matched, returning unknown');

    return {
      category: 'unknown',
      confidence: 'low',
      humanReadable: 'Unknown failure',
      suggestedAction: 'Inspect logs and classify this failure pattern.',
      retryable: false,
      extractedDetails: {
        statusCode: resolvedStatusCode,
      },
    };
  }

  static parsePlatformError(errorBody: unknown): { rule?: string; reason?: string } {
    if (!errorBody || typeof errorBody !== 'object') {
      return {};
    }

    const record = errorBody as Record<string, unknown>;
    const reason = typeof record.reason === 'string' ? record.reason : undefined;
    const rule = typeof record.rule === 'string' ? record.rule : undefined;
    return { rule, reason };
  }

  static parseRedditError(errorBody: unknown): { rule?: string; reason?: string } {
    // Compatibility alias for borrowed TPilot callers.
    return this.parsePlatformError(errorBody);
  }

  static isTransientError(category: FailureCategory): boolean {
    return category === 'rate_limit' || category === 'timeout' || category === 'network_error';
  }

  static isPermanentError(category: FailureCategory): boolean {
    return !this.isTransientError(category);
  }

  static isValidCategory(category: string): category is FailureCategory {
    return FAILURE_CATEGORIES.includes(category as FailureCategory);
  }

  static getSuggestedAction(category: FailureCategory, details?: ExtractedDetails): SuggestedAction {
    switch (category) {
      case 'rate_limit':
        return {
          action: 'Wait and retry',
          description: 'Request rate exceeded. Back off and retry automatically.',
          canRetry: true,
          autoRetry: true,
          retryAfterSeconds: details?.retryAfterSeconds,
        };
      case 'timeout':
      case 'network_error':
        return {
          action: 'Retry operation',
          description: 'Transient external error; retry with exponential backoff.',
          canRetry: true,
          autoRetry: true,
        };
      case 'auth_expired':
        return {
          action: 'Reconnect account',
          description: 'Credentials expired or invalid. Refresh the integration auth.',
          canRetry: false,
        };
      case 'platform_blocked':
        return {
          action: 'Change target/account',
          description: 'Platform-level restriction detected.',
          canRetry: false,
        };
      case 'policy_violation':
        return {
          action: 'Revise content',
          description: 'Adjust content to pass policy and moderation checks.',
          canRetry: false,
        };
      case 'media_error':
        return {
          action: 'Fix media asset',
          description: 'Validate format, dimensions, and upload constraints.',
          canRetry: false,
        };
      case 'domain_unavailable':
        return {
          action: 'Watchlist or replace domain',
          description: 'Domain cannot proceed in current state.',
          canRetry: false,
        };
      case 'economics_failed':
        return {
          action: 'Reject candidate',
          description: 'Underwriting thresholds not met.',
          canRetry: false,
        };
      default:
        return {
          action: 'Inspect logs',
          description: 'No known failure signature matched.',
          canRetry: false,
        };
    }
  }

  static getFailureReport(error: Error | string | unknown, statusCode?: number): FailureReport {
    const categorization = this.categorize(error, statusCode);
    return {
      ...categorization,
      suggestedActionDetails: this.getSuggestedAction(categorization.category, categorization.extractedDetails),
    };
  }
}
