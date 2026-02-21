import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    const domainId = '759a8b1f-8dfa-4e8a-a4d9-847af1ce93d9';

    // Get calculator page blocks
    const pages = await sql`SELECT route, blocks FROM page_definitions WHERE domain_id = ${domainId} AND route = '/calculator' LIMIT 1`;
    if (pages.length === 0) { console.log('No /calculator page found'); await sql.end(); return; }

    const blocks = pages[0].blocks as Array<Record<string, unknown>>;
    for (const b of blocks) {
        if (b.type === 'QuoteCalculator') {
            const content = b.content as Record<string, unknown>;
            console.log('=== QuoteCalculator block ===');
            console.log('Inputs:', JSON.stringify(content.inputs, null, 2));
            console.log('Outputs:', JSON.stringify(content.outputs, null, 2));
            console.log('Formula:', content.formula);
            console.log('Heading:', content.heading);
        }
    }

    // Also check homepage for header block nav alignment
    const home = await sql`SELECT blocks FROM page_definitions WHERE domain_id = ${domainId} AND route = '/' LIMIT 1`;
    if (home.length > 0) {
        const homeBlocks = home[0].blocks as Array<Record<string, unknown>>;
        const header = homeBlocks.find(b => b.type === 'Header');
        if (header) {
            console.log('\n=== Header block ===');
            console.log('Variant:', header.variant);
            console.log('Config:', JSON.stringify(header.config, null, 2));
            const content = header.content as Record<string, unknown>;
            console.log('NavLinks:', JSON.stringify(content?.navLinks, null, 2));
        }
    }

    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
