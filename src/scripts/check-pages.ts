import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const domainId = '05284b56-a2ef-450f-bfb2-e9139c1fea97';
    
    const pages = await sql`SELECT id, route, is_published, status FROM page_definitions WHERE domain_id = ${domainId}`;
    console.log(`Found ${pages.length} pages:`);
    for (const p of pages) {
        console.log(`  ${p.route} — published=${p.is_published}, status=${p.status}`);
    }
    
    const articles = await sql`SELECT count(*) as cnt FROM articles WHERE domain_id = ${domainId}`;
    console.log(`\nArticles: ${articles[0].cnt}`);
    
    await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
