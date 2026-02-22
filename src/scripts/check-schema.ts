import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    await sql`ALTER TABLE domains ADD COLUMN IF NOT EXISTS site_settings jsonb DEFAULT '{}'::jsonb`;
    console.log('Migration applied: site_settings column added');
    await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
