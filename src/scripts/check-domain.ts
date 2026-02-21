import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import postgres from 'postgres';

async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });

    const doms = await sql`SELECT id, domain, vertical, niche, sub_niche, theme_style, skin, status, lifecycle_state, is_deployed, cloudflare_project, cloudflare_account, site_template, registrar, cluster, last_deployed_at, created_at FROM domains WHERE domain ILIKE '%myhomevalue%' LIMIT 5`;
    console.log('Domain records:', JSON.stringify(doms, null, 2));

    if (doms.length > 0) {
        const domainId = doms[0].id;
        const arts = await sql`SELECT id, title, slug, status, content_type FROM articles WHERE domain_id = ${domainId} ORDER BY created_at DESC LIMIT 10`;
        console.log('\nArticles:', JSON.stringify(arts, null, 2));

        const pages = await sql`SELECT id, route, title, theme, skin, is_published, status FROM page_definitions WHERE domain_id = ${domainId} ORDER BY route LIMIT 20`;
        console.log('\nPage definitions:', JSON.stringify(pages, null, 2));

        const jobs = await sql`SELECT id, job_type, status, error_message, created_at, completed_at FROM content_queue WHERE domain_id = ${domainId} AND job_type = 'deploy' ORDER BY created_at DESC LIMIT 3`;
        console.log('\nRecent deploy jobs:', JSON.stringify(jobs, null, 2));
    }

    await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
