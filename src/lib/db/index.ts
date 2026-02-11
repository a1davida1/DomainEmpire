import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

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
    const client = postgres(connectionString, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        ssl: process.env.DATABASE_SSL === 'true' || process.env.NODE_ENV === 'production' ? 'require' : undefined,
    });

    _db = drizzle(client, { schema });
    return _db;
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
