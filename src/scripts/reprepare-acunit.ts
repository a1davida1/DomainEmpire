import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { prepareDomain } from '@/lib/deploy/prepare-domain';

async function main() {
    const domainId = '05284b56-a2ef-450f-bfb2-e9139c1fea97';

    console.log('Re-preparing acunitinstall.com with niche="AC Unit Installation"...');
    console.log('This will regenerate all pages with AC-specific content.\n');

    const result = await prepareDomain(domainId, {
        niche: 'AC Unit Installation',
        subNiche: 'HVAC Installation',
        vertical: 'Home Services',
        siteTemplate: 'cost_guide',
    });

    console.log('\n=== Prepare Result ===');
    console.log(`Domain: ${result.domain}`);
    console.log(`Human name: ${result.humanName}`);
    console.log(`Theme: ${result.theme}, Skin: ${result.skin}`);
    console.log(`Pages: ${result.pageCount} (seeded: ${result.pagesSeeded})`);
    console.log(`Programmatic fixes:`, result.programmaticFixes);
    console.log(`Enrichment:`, result.enrichment);
    console.log(`Content scan:`, result.contentScan);
    console.log(`Ready: ${result.ready}`);
    console.log(`Validation issues: ${result.validation.errorCount} errors, ${result.validation.warningCount} warnings`);
    if (result.validation.issues.length > 0) {
        for (const issue of result.validation.issues.slice(0, 10)) {
            console.log(`  [${issue.severity}] ${issue.detail}`);
        }
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
