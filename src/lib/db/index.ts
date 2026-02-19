import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Shared type covering both the top-level db and a transaction object.
 * Use this for function params that accept either context.
 */
export type DbOrTx = PostgresJsDatabase<typeof schema> | PgTransaction<any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ─── Pool configuration (env-driven with sensible defaults) ─────
function parseEnvInt(value: string | undefined, defaultValue: number): number {
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
}

const DB_POOL_MAX = Math.max(1, parseEnvInt(process.env.DB_POOL_MAX, 10));
const DB_IDLE_TIMEOUT = Math.max(0, parseEnvInt(process.env.DB_IDLE_TIMEOUT, 20));
const DB_CONNECT_TIMEOUT = Math.max(1, parseEnvInt(process.env.DB_CONNECT_TIMEOUT, 10));
const DB_MAX_LIFETIME = Math.max(0, parseEnvInt(process.env.DB_MAX_LIFETIME, 3600)); // 1 hour

// ─── Pool exhaustion monitoring ─────────────────────────────────
let _poolWarningEmitted = false;
const _activeConnectionIds = new Set<number>();

function maybeEmitPoolWarning() {
    const utilization = _activeConnectionIds.size / DB_POOL_MAX;
    if (utilization >= 0.8 && !_poolWarningEmitted) {
        _poolWarningEmitted = true;
        console.warn(`[DB Pool] WARNING: ${_activeConnectionIds.size}/${DB_POOL_MAX} connections in use (${(utilization * 100).toFixed(0)}%). Consider increasing DB_POOL_MAX.`);
    }
}

function maybeResetPoolWarning() {
    if (_activeConnectionIds.size / DB_POOL_MAX < 0.6) {
        _poolWarningEmitted = false;
    }
}

// Lazy-initialized database instance
// This prevents build-time errors when DATABASE_URL is not set
let _db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
    if (_db) {
        return _db;
    }

    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error(
            'DATABASE_URL environment variable is not set. ' +
            'Please set it in your .env.local file or environment.'
        );
    }

    // For serverless environments, use connection pooling
    // Only set ssl explicitly if DATABASE_SSL or production mode —
    // otherwise let postgres.js use the ?ssl= param from the URL
    const forceSsl = process.env.DATABASE_SSL === 'true' || process.env.NODE_ENV === 'production';
    const client = postgres(connectionString, {
        max: DB_POOL_MAX,
        idle_timeout: DB_IDLE_TIMEOUT,
        connect_timeout: DB_CONNECT_TIMEOUT,
        max_lifetime: DB_MAX_LIFETIME,
        onnotice: () => {}, // suppress notice logs
        ...(forceSsl ? { ssl: 'require' as const } : {}),
        transform: {
            undefined: null,
        },
        connection: {
            application_name: 'domain-empire',
        },
        debug: (connection, query) => {
            if (!_activeConnectionIds.has(connection)) {
                _activeConnectionIds.add(connection);
                maybeEmitPoolWarning();
            }

            if (process.env.DB_DEBUG === 'true') {
                console.log(`[DB] conn=${connection} query=${typeof query === 'string' ? query.slice(0, 120) : 'prepared'}`);
            }
        },
        onclose: (connection) => {
            _activeConnectionIds.delete(connection);
            maybeResetPoolWarning();
        },
    });

    _db = drizzle(client, { schema });

    if (process.env.NODE_ENV !== 'production') {
        console.log(`[DB] Pool initialized: max=${DB_POOL_MAX}, idle_timeout=${DB_IDLE_TIMEOUT}s, connect_timeout=${DB_CONNECT_TIMEOUT}s, max_lifetime=${DB_MAX_LIFETIME}s`);
    }

    return _db;
}

/** Get pool stats for health checks */
export function getPoolStats() {
    const active = _activeConnectionIds.size;
    return {
        max: DB_POOL_MAX,
        active,
        utilization: active / DB_POOL_MAX,
        warningThreshold: 0.8,
        isWarning: _poolWarningEmitted,
    };
}

// Export a proxy that lazily initializes the database
// This allows importing `db` directly while still being lazy
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
    get(_target, prop) {
        const instance = getDb();
        return (instance as unknown as Record<string | symbol, unknown>)[prop];
    },
});

// Export schema for use in queries
export * from './schema';
