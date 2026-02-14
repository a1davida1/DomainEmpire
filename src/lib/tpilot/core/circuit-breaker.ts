/**
 * Generic Circuit Breaker for External Services
 * Gap #4 Fix: Prevents cascading failures when external services are unavailable
 * 
 * Based on the redis-manager.ts circuit breaker pattern for consistency.
 * Integrates with resilience monitoring for health dashboard visibility.
 */

import { logger } from './logger';

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface CircuitBreakerConfig {
    /** Number of failures before opening the circuit */
    failureThreshold: number;
    /** Time in ms before transitioning from open to half-open */
    resetTimeoutMs: number;
    /** Max attempts in half-open state before reopening */
    halfOpenMaxAttempts: number;
    /** Successes needed in half-open to close circuit */
    successThreshold: number;
}

export interface CircuitBreakerState {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    successCount: number;
    lastFailureTime: Date | null;
    lastSuccessTime: Date | null;
    openedAt: Date | null;
    halfOpenAttempts: number;
    totalRequests: number;
    totalFailures: number;
}

export interface CircuitBreakerStatus extends CircuitBreakerState {
    serviceName: string;
    config: CircuitBreakerConfig;
    isAllowingRequests: boolean;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,        // Open after 5 consecutive failures
    resetTimeoutMs: 30000,      // Try again after 30 seconds
    halfOpenMaxAttempts: 3,     // Allow 3 test requests in half-open
    successThreshold: 2,        // Need 2 successes to close from half-open
};

// =============================================================================
// Circuit Breaker Class
// =============================================================================

export class CircuitBreaker {
    private readonly serviceName: string;
    private readonly config: CircuitBreakerConfig;
    private state: CircuitBreakerState;

    constructor(serviceName: string, config: Partial<CircuitBreakerConfig> = {}) {
        this.serviceName = serviceName;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = this.createInitialState();
    }

    private createInitialState(): CircuitBreakerState {
        return {
            state: 'closed',
            failureCount: 0,
            successCount: 0,
            lastFailureTime: null,
            lastSuccessTime: null,
            openedAt: null,
            halfOpenAttempts: 0,
            totalRequests: 0,
            totalFailures: 0,
        };
    }

    /**
     * Check if the circuit allows requests
     */
    isAllowingRequests(): boolean {
        if (this.state.state === 'closed') {
            return true;
        }

        if (this.state.state === 'open') {
            const timeSinceOpen = this.state.openedAt
                ? Date.now() - this.state.openedAt.getTime()
                : 0;

            if (timeSinceOpen >= this.config.resetTimeoutMs) {
                this.transitionToHalfOpen();
                return true;
            }
            return false;
        }

        // Half-open - allow limited attempts
        return this.state.halfOpenAttempts < this.config.halfOpenMaxAttempts;
    }

    /**
     * Record a successful operation
     */
    recordSuccess(): void {
        this.state.lastSuccessTime = new Date();
        this.state.successCount++;
        this.state.totalRequests++;

        if (this.state.state === 'half-open') {
            this.state.halfOpenAttempts++;
            if (this.state.successCount >= this.config.successThreshold) {
                this.closeCircuit();
            }
        } else if (this.state.state === 'closed') {
            // Decay failure count on success
            this.state.failureCount = Math.max(0, this.state.failureCount - 1);
        }
    }

    /**
     * Record a failed operation
     */
    recordFailure(error?: Error): void {
        this.state.failureCount++;
        this.state.lastFailureTime = new Date();
        this.state.successCount = 0; // Reset success count on failure
        this.state.totalRequests++;
        this.state.totalFailures++;

        if (this.state.state === 'half-open') {
            this.state.halfOpenAttempts++;
            if (this.state.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
                this.openCircuit();
            }
        } else if (this.state.failureCount >= this.config.failureThreshold) {
            this.openCircuit();
        }

        if (error) {
            logger.warn(`[CircuitBreaker:${this.serviceName}] Operation failed`, {
                error: error.message,
                circuitState: this.state.state,
                failureCount: this.state.failureCount,
            });
        }
    }

    private openCircuit(): void {
        if (this.state.state !== 'open') {
            logger.warn(`[CircuitBreaker:${this.serviceName}] Circuit OPENED`, {
                failureCount: this.state.failureCount,
                resetTimeoutMs: this.config.resetTimeoutMs,
            });
        }
        this.state.state = 'open';
        this.state.openedAt = new Date();
        this.state.halfOpenAttempts = 0;
        this.state.successCount = 0;
    }

    private transitionToHalfOpen(): void {
        if (this.state.state !== 'half-open') {
            logger.info(`[CircuitBreaker:${this.serviceName}] Circuit transitioning to HALF-OPEN`);
        }
        this.state.state = 'half-open';
        this.state.halfOpenAttempts = 0;
        this.state.successCount = 0;
    }

    private closeCircuit(): void {
        if (this.state.state !== 'closed') {
            logger.info(`[CircuitBreaker:${this.serviceName}] Circuit CLOSED (recovered)`);
        }
        this.state.state = 'closed';
        this.state.failureCount = 0;
        this.state.successCount = 0;
        this.state.openedAt = null;
        this.state.halfOpenAttempts = 0;
    }

    /**
     * Get current circuit breaker status for monitoring.
     * Computed from state without triggering transitions.
     */
    getStatus(): CircuitBreakerStatus {
        let allowing: boolean;
        if (this.state.state === 'closed') {
            allowing = true;
        } else if (this.state.state === 'open') {
            const timeSinceOpen = this.state.openedAt
                ? Date.now() - this.state.openedAt.getTime()
                : 0;
            allowing = timeSinceOpen >= this.config.resetTimeoutMs;
        } else {
            allowing = this.state.halfOpenAttempts < this.config.halfOpenMaxAttempts;
        }

        return {
            serviceName: this.serviceName,
            ...this.state,
            config: this.config,
            isAllowingRequests: allowing,
        };
    }

    /**
     * Force the circuit to a specific state (for testing/admin)
     */
    forceState(newState: 'closed' | 'open' | 'half-open'): void {
        logger.warn(`[CircuitBreaker:${this.serviceName}] Force state change`, {
            from: this.state.state,
            to: newState,
        });

        if (newState === 'closed') {
            this.closeCircuit();
        } else if (newState === 'open') {
            this.openCircuit();
        } else {
            this.transitionToHalfOpen();
        }
    }
}

// =============================================================================
// Circuit Breaker Registry (for monitoring integration)
// =============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a service
 */
export function getCircuitBreaker(
    serviceName: string,
    config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
    let breaker = circuitBreakers.get(serviceName);
    if (!breaker) {
        breaker = new CircuitBreaker(serviceName, config);
        circuitBreakers.set(serviceName, breaker);
        logger.debug(`[CircuitBreaker] Created circuit breaker for service: ${serviceName}`);
    }
    return breaker;
}

/**
 * Get all circuit breaker statuses (for health dashboard)
 */
export function getAllCircuitBreakerStatuses(): CircuitBreakerStatus[] {
    return Array.from(circuitBreakers.values()).map(cb => cb.getStatus());
}

// =============================================================================
// Utility Function for Wrapping Operations
// =============================================================================

export interface WithCircuitBreakerOptions<T> {
    /** Fallback value or function when circuit is open */
    fallback?: T | (() => T | Promise<T>);
    /** Custom error to throw when circuit is open and no fallback provided */
    openCircuitError?: Error;
}

/**
 * Execute an operation with circuit breaker protection
 * 
 * @param serviceName - Name of the service for circuit breaker tracking
 * @param operation - The async operation to execute
 * @param options - Fallback and configuration options
 * @returns The operation result or fallback value
 * 
 * @example
 * ```ts
 * const result = await withCircuitBreaker(
 *   'openrouter',
 *   () => generateCaption(image),
 *   { fallback: { caption: '', available: false } }
 * );
 * ```
 */
export async function withCircuitBreaker<T>(
    serviceName: string,
    operation: () => Promise<T>,
    options: WithCircuitBreakerOptions<T> = {}
): Promise<T> {
    const breaker = getCircuitBreaker(serviceName);

    // Check if circuit allows requests
    if (!breaker.isAllowingRequests()) {
        logger.debug(`[CircuitBreaker:${serviceName}] Circuit is OPEN, skipping operation`);

        if (options.fallback !== undefined) {
            return typeof options.fallback === 'function'
                ? await (options.fallback as () => T | Promise<T>)()
                : options.fallback;
        }

        throw options.openCircuitError ?? new CircuitBreakerOpenError(serviceName);
    }

    try {
        const result = await operation();
        breaker.recordSuccess();
        return result;
    } catch (error) {
        breaker.recordFailure(error instanceof Error ? error : undefined);
        throw error;
    }
}

/**
 * Error thrown when circuit breaker is open and no fallback provided
 */
export class CircuitBreakerOpenError extends Error {
    readonly serviceName: string;
    readonly isTransient = true;

    constructor(serviceName: string) {
        super(`Circuit breaker is open for service: ${serviceName}. Service temporarily unavailable.`);
        this.name = 'CircuitBreakerOpenError';
        this.serviceName = serviceName;
    }
}
