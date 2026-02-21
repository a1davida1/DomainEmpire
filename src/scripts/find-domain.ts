import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const search = process.argv[2] || 'acunitinstall';
    
    const rows = await sql`
        SELECT id, domain, status, vertical, niche, 
               theme_style, skin, cloudflare_project, cloudflare_account,
               site_template
        FROM domains 
        WHERE domain ILIKE ${'%' + search + '%'}
    `;
    
    if (rows.length === 0) {
        console.log(`No domains found matching "${search}"`);
    } else {
        for (const r of rows) {
            console.log(JSON.stringify(r, null, 2));
        }
    }
    
    // Also check if it has page_definitions
    for (const r of rows) {
        const pages = await sql`SELECT count(*) as cnt FROM page_definitions WHERE domain_id = ${r.id}`;
        console.log(`\n${r.domain}: ${pages[0].cnt} page definitions`);
    }
    
    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
