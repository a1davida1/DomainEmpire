import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const domainId = '05284b56-a2ef-450f-bfb2-e9139c1fea97';

    // Get all pages with their routes and block types
    const pages = await sql`SELECT id, route, title, blocks FROM page_definitions WHERE domain_id = ${domainId} ORDER BY route`;
    
    console.log(`=== ${pages.length} pages ===\n`);
    for (const page of pages) {
        let blocks: Array<Record<string, unknown>>;
        if (typeof page.blocks === 'string') {
            blocks = JSON.parse(page.blocks);
        } else {
            blocks = page.blocks as Array<Record<string, unknown>>;
        }
        
        const blockSummary = blocks.map((b: Record<string, unknown>) => {
            let info = `${b.type}(${b.variant || 'default'})`;
            if (b.type === 'Header') {
                const content = b.content as Record<string, unknown> | undefined;
                const navLinks = (content?.navLinks as Array<Record<string, unknown>>) || [];
                info += ` [${navLinks.length} nav links]`;
            }
            if (b.type === 'SidebarNav' || b.type === 'Sidebar') {
                info += ` ${JSON.stringify(b.content).substring(0, 200)}`;
            }
            return info;
        });
        
        console.log(`${page.route} — "${page.title}"`);
        console.log(`  Blocks: ${blockSummary.join(', ')}`);
    }

    // Look at homepage blocks in detail
    const home = pages.find(p => p.route === '/');
    if (home) {
        let blocks: Array<Record<string, unknown>>;
        if (typeof home.blocks === 'string') {
            blocks = JSON.parse(home.blocks);
        } else {
            blocks = home.blocks as Array<Record<string, unknown>>;
        }
        console.log('\n=== Homepage blocks detail ===');
        for (const b of blocks) {
            console.log(`\n--- ${b.type} (${b.variant || 'default'}) ---`);
            if (b.content) {
                const contentStr = JSON.stringify(b.content);
                console.log(`  Content: ${contentStr.substring(0, 300)}${contentStr.length > 300 ? '...' : ''}`);
            }
            if (b.config) {
                console.log(`  Config: ${JSON.stringify(b.config).substring(0, 200)}`);
            }
        }
    }

    // Also check the domain's niche and site_template
    const domain = await sql`SELECT domain, niche, vertical, site_template, content_config FROM domains WHERE id = ${domainId}`;
    console.log('\n=== Domain info ===');
    console.log(JSON.stringify(domain[0], null, 2));

    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
