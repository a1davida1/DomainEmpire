
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
    console.log(`Connecting to DB at ${dbUrl.split('@')[1] || 'unknown host'}...`); // Mask credentials

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
        result.forEach((d: any) => {
            console.log(`${d.domain} (${d.status}) - ID: ${d.id}`);
        });
        console.log('--------------------------------------------------');
    } catch (e) {
        console.error('Query failed:', e);
    } finally {
        await client.end();
        console.log('Done.');
    }
}

main().catch(e => {
    console.error('Main error:', e);
    process.exit(1);
});
