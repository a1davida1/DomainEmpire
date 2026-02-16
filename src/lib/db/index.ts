import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// ─── Pool configuration (env-driven with sensible defaults) ─────
const DB_POOL_MAX = Math.max(1, parseInt(process.env.DB_POOL_MAX || '10', 10) || 10);
const DB_IDLE_TIMEOUT = Math.max(0, parseInt(process.env.DB_IDLE_TIMEOUT || '20', 10) || 20);
const DB_CONNECT_TIMEOUT = Math.max(1, parseInt(process.env.DB_CONNECT_TIMEOUT || '10', 10) || 10);
const DB_MAX_LIFETIME = parseInt(process.env.DB_MAX_LIFETIME || '3600', 10) || 3600; // 1 hour

// ─── Pool exhaustion monitoring ─────────────────────────────────
let _poolWarningEmitted = false;
let _activeConnections = 0;

function onPoolConnect() {
    _activeConnections++;
    const utilization = _activeConnections / DB_POOL_MAX;
    if (utilization >= 0.8 && !_poolWarningEmitted) {
        _poolWarningEmitted = true;
        console.warn(`[DB Pool] WARNING: ${_activeConnections}/${DB_POOL_MAX} connections in use (${(utilization * 100).toFixed(0)}%). Consider increasing DB_POOL_MAX.`);
    }
}

function onPoolRelease() {
    _activeConnections = Math.max(0, _activeConnections - 1);
    if (_activeConnections / DB_POOL_MAX < 0.6) {
        _poolWarningEmitted = false;
    }
}

// Lazy-initialized database instance
// This prevents build-time errors when DATABASE_URL is not set
let _db: PostgresJsDatabase<typeof schema> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

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
        debug: process.env.DB_DEBUG === 'true' ? (connection, query) => {
            console.log(`[DB] conn=${connection} query=${typeof query === 'string' ? query.slice(0, 120) : 'prepared'}`);
        } : undefined,
    });

    // Wrap with pool monitoring via proxy
    _sql = new Proxy(client, {
        apply(target, thisArg, args) {
            onPoolConnect();
            const result = Reflect.apply(target, thisArg, args);
            if (result && typeof result === 'object' && 'then' in result) {
                (result as Promise<unknown>).finally(onPoolRelease);
            } else {
                onPoolRelease();
            }
            return result;
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
    return {
        max: DB_POOL_MAX,
        active: _activeConnections,
        utilization: _activeConnections / DB_POOL_MAX,
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
