import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    const domainId = '759a8b1f-8dfa-4e8a-a4d9-847af1ce93d9';
    const newTheme = 'editorial';
    const newSkin = 'sand';

    // Update domain skin
    await sql`UPDATE domains SET skin = ${newSkin}, updated_at = NOW() WHERE id = ${domainId}`;
    console.log(`Updated domain skin to: ${newSkin}`);

    // Update all page definitions theme + skin
    const result = await sql`UPDATE page_definitions SET theme = ${newTheme}, skin = ${newSkin}, updated_at = NOW() WHERE domain_id = ${domainId}`;
    console.log(`Updated ${result.count} page definitions to theme=${newTheme}, skin=${newSkin}`);

    // Verify
    const pages = await sql`SELECT route, theme, skin FROM page_definitions WHERE domain_id = ${domainId} ORDER BY route LIMIT 5`;
    console.log('Verification (first 5 pages):', JSON.stringify(pages, null, 2));

    await sql.end();
    console.log('Done!');
}

main().catch((e) => { console.error(e); process.exit(1); });
