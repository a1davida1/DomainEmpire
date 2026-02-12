/**
 * Reset admin password script.
 * Usage: npx tsx scripts/reset-admin.ts
 *
 * Deletes all users + sessions, so seedAdminIfNeeded() re-creates admin on next login.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

async function main() {
    const client = postgres(process.env.DATABASE_URL!, { max: 1 });
    const db = drizzle(client);

    const userCount = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
    const count = (userCount[0] as { count: number }).count;
    console.log(`Found ${count} user(s) in database`);

    if (count > 0) {
        await db.execute(sql`DELETE FROM sessions`);
        console.log('Cleared all sessions');

        await db.execute(sql`DELETE FROM users`);
        console.log('Cleared all users');

        console.log('\nAdmin will be re-created on next login attempt.');
    } else {
        console.log('No users exist. Admin will be auto-seeded on first login.');
    }

    console.log(`Credentials: admin@domainempire.local / (Check ADMIN_PASSWORD in .env.local)`);
    await client.end();
}

main().catch(console.error);
