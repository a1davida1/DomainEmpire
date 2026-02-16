
import { config } from 'dotenv';
config({ path: '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Starting script...');
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('DATABASE_URL is not set');
        process.exit(1);
    }
    const lastAt = dbUrl.lastIndexOf('@');
    const host = lastAt >= 0 ? dbUrl.slice(lastAt + 1) : 'unknown host';
    console.log(`Connecting to DB at ${host}...`);

    // Use SSL only if not connecting to localhost
    const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    console.log(`SSL mode: ${isLocal ? 'disabled (local)' : 'required (remote)'}`);

    const client = postgres(dbUrl, {
        max: 1,
        ssl: isLocal ? false : 'require',
        connect_timeout: 5, // 5 seconds timeout
    });
    const db = drizzle(client);

    console.log('Executing query...');
    try {
        const result = await db.execute(sql`SELECT id, domain, status, created_at FROM domains ORDER BY created_at DESC`);

        console.log(`Found ${result.length} domains:`);
        console.log('--------------------------------------------------');
        type DomainRow = {
            id: string;
            domain: string;
            status: string;
        };
        for (const row of result as unknown as DomainRow[]) {
            console.log(`${row.domain} (${row.status}) - ID: ${row.id}`);
        }
        console.log('--------------------------------------------------');
    } catch (e) {
        console.error('Query failed:', e);
        process.exitCode = 1;
        throw e;
    } finally {
        await client.end();
        console.log('Done.');
    }
}

main().catch(e => {
    console.error('Main error:', e);
    process.exit(1);
});
