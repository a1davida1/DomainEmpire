import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    const resp = await fetch('https://bracescost.org/');
    const html = await resp.text();
    const hasAhrefs = html.includes('analytics.ahrefs.com');
    console.log(hasAhrefs ? '✅ Ahrefs tag is LIVE on bracescost.org' : '❌ Ahrefs tag still missing');
    await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
