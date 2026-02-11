import * as dotenv from 'dotenv';
import path from 'path';

// Fix path to .env.local assuming script is in src/scripts/
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { getDb } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Testing DB connection...');
    const dbUrl = process.env.DATABASE_URL || '';
    try {
        const url = new URL(dbUrl);
        url.password = '****';
        console.log('DATABASE_URL:', url.toString());
    } catch {
        console.log('DATABASE_URL: (invalid or empty)');
    }

    try {
        const db = getDb();
        const start = Date.now();
        const res = await db.execute(sql`SELECT NOW()`);
        console.log(`Connection successful in ${Date.now() - start}ms:`, res[0]);
        process.exit(0);
    } catch (err) {
        console.error('Connection failed:', err);
        process.exit(1);
    }
}

main();
