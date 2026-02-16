/**
 * Syncs domain classification data from the portfolio master spreadsheet
 * into the database. Maps: bucket→niche, sub-niche, priority→tier,
 * tool checkmarks→siteTemplate, revenue model→monetizationModel, etc.
 *
 * Usage: npx tsx scripts/sync-spreadsheet.ts [--dry-run]
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import ExcelJS from 'exceljs';
import { db, domains } from '../src/lib/db';
import { eq } from 'drizzle-orm';

const SPREADSHEET_PATH = path.resolve(__dirname, '../docs/domain_portfolio_master(1).xlsx');

// ---------- Column → DB field mapping helpers ----------

const TOOL_CALC_COLS = ['Cost Calc', 'Payoff Calc', 'Compare Calc', 'Savings Calc', 'ROI Calc', 'Tax Calc'];
const TOOL_QUIZ_COLS = ['Decision Quiz', 'Knowledge Quiz', 'Assessment', 'Style Quiz'];
const TOOL_COMPARE_COLS = ['H2H Compare', 'vs Pages', 'Price Compare', 'Feature Matrix', 'Compare Chart'];
const TOOL_GEO_COLS = ['Geo Price', 'Interactive Map'];
const TOOL_LEAD_COLS = ['Quote Form'];
const TOOL_DASH_COLS = ['Dashboard', 'Savings Tracker'];
const TOOL_DECISION_COLS = ['Decision Tree', 'Eligibility'];

function hasTool(row: Record<string, string>, cols: string[]): boolean {
    return cols.some(c => row[c] === '✓');
}

/** Determine best siteTemplate from tool checkmark pattern */
function deriveSiteTemplate(row: Record<string, string>): string {
    const calcCount = TOOL_CALC_COLS.filter(c => row[c] === '✓').length;
    const compareCount = TOOL_COMPARE_COLS.filter(c => row[c] === '✓').length;
    const quizCount = TOOL_QUIZ_COLS.filter(c => row[c] === '✓').length;

    // Primary revenue hints
    const rev = (row['Primary Revenue'] || '').toLowerCase();
    const isRedirect = rev.includes('redirect') || rev.includes('flip');
    if (isRedirect) return 'minimal';

    if (hasTool(row, TOOL_LEAD_COLS) && rev.includes('lead')) return 'cost_guide';
    if (calcCount >= 3) return 'calculator';
    if (compareCount >= 3) return 'comparison';
    if (hasTool(row, TOOL_DECISION_COLS) && quizCount >= 2) return 'decision';
    if (hasTool(row, TOOL_GEO_COLS)) return 'hub';
    if (hasTool(row, TOOL_DASH_COLS)) return 'dashboard';
    if (calcCount >= 1 && compareCount >= 1) return 'tool';
    if (quizCount >= 1) return 'decision';
    if (calcCount >= 1) return 'calculator';
    if (compareCount >= 1) return 'comparison';

    return 'authority'; // default for content-heavy domains
}

/** Map Priority column (T1/T2/T3/FLIP) → tier integer */
function deriveTier(priority: string): number {
    if (!priority) return 3;
    const p = priority.toUpperCase().trim();
    if (p.startsWith('T1') || p === 'TIER 1') return 1;
    if (p.startsWith('T2') || p === 'TIER 2') return 2;
    if (p.startsWith('FLIP')) return 3; // flip domains are lowest active tier
    return 3;
}

/** Map Priority to domain status */
function deriveStatus(priority: string, revenue: string): 'parked' | 'active' | 'redirect' | 'forsale' | 'defensive' {
    const p = (priority || '').toUpperCase().trim();
    const rev = (revenue || '').toLowerCase();
    if (p === 'DEFENSIVE' || rev.includes('defensive')) return 'defensive';
    if (p === 'FLIP') return 'forsale';
    if (rev.includes('redirect')) return 'redirect';
    if (rev.includes('flip')) return 'forsale';
    if (!p && !rev) return 'parked';
    return 'active';
}

/** Map Priority/Revenue to lifecycle state */
function deriveLifecycleState(priority: string, revenue: string): string {
    const p = (priority || '').toUpperCase().trim();
    const rev = (revenue || '').toLowerCase();
    if (p === 'FLIP' || rev.includes('flip')) return 'sell';
    if (rev.includes('redirect')) return 'hold';
    if (p.startsWith('T1')) return 'build';
    if (p.startsWith('T2')) return 'build';
    return 'sourced';
}

/** Map bucket → DB bucket field (build/redirect/park/defensive) */
function deriveBucket(priority: string, revenue: string): 'build' | 'redirect' | 'park' | 'defensive' {
    const p = (priority || '').toUpperCase().trim();
    const rev = (revenue || '').toLowerCase();
    if (p === 'DEFENSIVE' || rev.includes('defensive')) return 'defensive';
    if (rev.includes('redirect')) return 'redirect';
    if (p === 'FLIP' || rev.includes('flip')) return 'park';
    return 'build';
}

/** Map Primary Revenue to monetizationModel */
function deriveMonetizationModel(revenue: string): string {
    if (!revenue) return 'display';
    const r = revenue.toLowerCase();
    if (r.includes('lead gen') || r.includes('lead_gen')) return 'lead_gen';
    if (r.includes('affiliate') && r.includes('ads')) return 'affiliate';
    if (r.includes('affiliate')) return 'affiliate';
    if (r.includes('ads')) return 'display';
    if (r.includes('thottopilot') || r.includes('funnel')) return 'affiliate';
    if (r.includes('flip') || r.includes('redirect')) return 'display';
    return 'display';
}

/** Map bucket name → vertical */
function deriveVertical(bucket: string): string {
    const b = (bucket || '').toLowerCase();
    if (b.includes('health') || b.includes('pharma')) return 'Health';
    if (b.includes('medical')) return 'Health';
    if (b.includes('finance')) return 'Finance';
    if (b.includes('tax') || b.includes('creator')) return 'Finance';
    if (b.includes('insurance')) return 'Insurance';
    if (b.includes('legal')) return 'Legal';
    if (b.includes('home service')) return 'Home Services';
    if (b.includes('auto')) return 'Automotive';
    if (b.includes('consumer')) return 'Consumer';
    if (b.includes('real estate')) return 'Real Estate';
    if (b.includes('collectible')) return 'Collectibles';
    if (b.includes('content') || b.includes('viral')) return 'Media';
    if (b.includes('of funnel') || b.includes('thotto')) return 'Adult';
    if (b.includes('ai') || b.includes('tech')) return 'Technology';
    if (b.includes('lifestyle') || b.includes('wedding')) return 'Lifestyle';
    if (b.includes('business') || b.includes('llc')) return 'Business';
    if (b.includes('career')) return 'Career';
    if (b.includes('travel')) return 'Travel';
    if (b.includes('e-commerce') || b.includes('dropship')) return 'E-Commerce';
    if (b) console.warn(`deriveVertical: unmapped bucket "${bucket}", defaulting to "Other"`);
    return 'Other';
}

// CF Account mapping from the spreadsheet
function deriveCloudflareAccount(bucket: string): string {
    const b = (bucket || '').toLowerCase();
    if (b.includes('health') || b.includes('pharma') || b.includes('medical')) return 'account-1-health';
    if (b.includes('home') || b.includes('auto') || b.includes('real estate')) return 'account-2-home';
    if (b.includes('finance') || b.includes('insurance') || b.includes('tax')) return 'account-3-finance';
    if (b.includes('legal') || b.includes('consumer')) return 'account-4-legal';
    if (b.includes('of funnel') || b.includes('collectible') || b.includes('content') || b.includes('viral')) return 'account-5-misc';
    return 'account-5-misc';
}

// ---------- Main sync ----------

async function main() {
    const dryRun = process.argv.includes('--dry-run');

    console.log(`Reading spreadsheet: ${SPREADSHEET_PATH}`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(SPREADSHEET_PATH);
    const ws = wb.getWorksheet('Domain Tool Map');
    if (!ws) {
        const sheetNames = wb.worksheets.map((s: { name: string }) => s.name).join(', ');
        throw new Error(`Worksheet "Domain Tool Map" not found in ${SPREADSHEET_PATH}. Available sheets: ${sheetNames}`);
    }
    // Convert worksheet to array of key-value row objects (header row = keys)
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell: { value: unknown }, colNumber: number) => {
        headers[colNumber] = String(cell.value ?? '').trim();
    });
    const rows: Record<string, string>[] = [];
    ws.eachRow((row: { eachCell: (cb: (cell: { value: unknown }, col: number) => void) => void }, rowNumber: number) => {
        if (rowNumber === 1) return; // skip header
        const obj: Record<string, string> = {};
        row.eachCell((cell: { value: unknown }, colNumber: number) => {
            const key = headers[colNumber];
            if (key) obj[key] = String(cell.value ?? '').trim();
        });
        rows.push(obj);
    });

    console.log(`Found ${rows.length} domain rows in spreadsheet`);

    // Get all domains from DB
    const dbDomains = await db.select({ id: domains.id, domain: domains.domain }).from(domains);
    const domainMap = new Map<string, string>();
    for (const d of dbDomains) {
        domainMap.set(d.domain.toLowerCase(), d.id);
    }
    console.log(`Found ${dbDomains.length} domains in database\n`);

    let updated = 0;
    let notFound = 0;
    let skipped = 0;

    for (const row of rows) {
        const domainName = (row['Domain'] || '').toLowerCase().trim();
        if (!domainName) { skipped++; continue; }

        const dbId = domainMap.get(domainName);
        if (!dbId) {
            console.log(`  NOT IN DB: ${domainName}`);
            notFound++;
            continue;
        }

        const priority = row['Priority'] || '';
        const revenue = row['Primary Revenue'] || '';
        const bucket = row['Bucket'] || '';

        const updateData = {
            niche: bucket,
            subNiche: row['Sub-Niche'] || null,
            vertical: deriveVertical(bucket),
            tier: deriveTier(priority),
            status: deriveStatus(priority, revenue) as 'parked' | 'active' | 'redirect' | 'forsale' | 'defensive',
            lifecycleState: deriveLifecycleState(priority, revenue) as 'sourced' | 'build' | 'sell' | 'hold',
            bucket: deriveBucket(priority, revenue),
            siteTemplate: deriveSiteTemplate(row) as typeof domains.$inferInsert.siteTemplate,
            monetizationModel: deriveMonetizationModel(revenue),
            cloudflareAccount: deriveCloudflareAccount(bucket),
            updatedAt: new Date(),
        };

        if (dryRun) {
            console.log(`  DRY RUN: ${domainName} → tier=${updateData.tier} niche="${updateData.niche}" sub="${updateData.subNiche}" template=${updateData.siteTemplate} status=${updateData.status} model=${updateData.monetizationModel} vertical=${updateData.vertical} cf=${updateData.cloudflareAccount}`);
        } else {
            await db.update(domains).set(updateData).where(eq(domains.id, dbId));
            console.log(`  UPDATED: ${domainName} → T${updateData.tier} | ${updateData.niche} / ${updateData.subNiche} | ${updateData.siteTemplate} | ${updateData.status}`);
        }
        updated++;
    }

    console.log(`\n=== Summary ===`);
    console.log(`Updated: ${updated}`);
    console.log(`Not in DB: ${notFound}`);
    console.log(`Skipped (empty): ${skipped}`);
    if (dryRun) console.log(`\n⚠ DRY RUN — no changes written. Run without --dry-run to apply.`);

    process.exit(0);
}

main().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
});
