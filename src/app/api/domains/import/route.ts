import { NextRequest, NextResponse } from 'next/server';
import { db, domains, NewDomain } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { classifyAndUpdateDomain } from '@/lib/ai/classify-domain';

interface CSVRow {
    domain: string;
    registrar?: string;
    purchasePrice?: string;
    purchaseDate?: string;
    renewalDate?: string;
    renewalPrice?: string;
    status?: string;
    bucket?: string;
    tier?: string;
    niche?: string;
    subNiche?: string;
    siteTemplate?: string;
    notes?: string;
    tags?: string;
    [key: string]: string | undefined; // Index signature for dynamic access
}

interface ImportResult {
    success: number;
    failed: number;
    errors: Array<{ domain: string; error: string }>;
    created: Array<{ id: string; domain: string }>;
}

type DomainStatus = 'parked' | 'active' | 'redirect' | 'forsale' | 'defensive';
type DomainBucket = 'build' | 'redirect' | 'park' | 'defensive';
type SiteTemplate =
    | 'authority' | 'comparison' | 'calculator' | 'review' | 'tool' | 'hub'
    | 'decision' | 'cost_guide' | 'niche' | 'info' | 'consumer' | 'brand'
    | 'magazine' | 'landing' | 'docs' | 'storefront' | 'minimal' | 'dashboard'
    | 'newsletter' | 'community';
type Registrar = 'godaddy' | 'namecheap' | 'cloudflare' | 'other';

const VALID_STATUSES: DomainStatus[] = ['parked', 'active', 'redirect', 'forsale', 'defensive'];
const VALID_BUCKETS: DomainBucket[] = ['build', 'redirect', 'park', 'defensive'];
const VALID_TEMPLATES: SiteTemplate[] = [
    'authority', 'comparison', 'calculator', 'review', 'tool', 'hub',
    'decision', 'cost_guide', 'niche', 'info', 'consumer', 'brand',
    'magazine', 'landing', 'docs', 'storefront', 'minimal', 'dashboard',
    'newsletter', 'community',
];
const VALID_REGISTRARS: Registrar[] = ['godaddy', 'namecheap', 'cloudflare', 'other'];

const DOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,})+$/i;

function validateDomainFormat(domain: string): boolean {
    return DOMAIN_REGEX.test(domain);
}

function parseStatus(value: string | undefined): DomainStatus {
    const normalized = value?.toLowerCase();
    return VALID_STATUSES.includes(normalized as DomainStatus)
        ? (normalized as DomainStatus)
        : 'parked';
}

function parseBucket(value: string | undefined): DomainBucket {
    const normalized = value?.toLowerCase();
    return VALID_BUCKETS.includes(normalized as DomainBucket)
        ? (normalized as DomainBucket)
        : 'build';
}

function parseTemplate(value: string | undefined): SiteTemplate {
    const normalized = value?.toLowerCase();
    return VALID_TEMPLATES.includes(normalized as SiteTemplate)
        ? (normalized as SiteTemplate)
        : 'authority';
}

function parseRegistrar(value: string | undefined): Registrar {
    const normalized = value?.toLowerCase();
    return VALID_REGISTRARS.includes(normalized as Registrar)
        ? (normalized as Registrar)
        : 'godaddy';
}

async function processCSVRow(row: CSVRow, result: ImportResult): Promise<void> {
    if (!row.domain || !validateDomainFormat(row.domain)) {
        result.failed++;
        result.errors.push({ domain: row.domain || 'unknown', error: 'Invalid domain format' });
        return;
    }

    const domainName = row.domain.toLowerCase();

    // Check for duplicates
    const existing = await db
        .select({ id: domains.id })
        .from(domains)
        .where(eq(domains.domain, domainName))
        .limit(1);

    if (existing.length > 0) {
        result.failed++;
        result.errors.push({ domain: domainName, error: 'Domain already exists' });
        return;
    }

    // Parse TLD
    const domainParts = domainName.split('.');
    const tld = domainParts.at(-1) ?? '';
    const purchasePriceParsed = row.purchasePrice ? Number.parseFloat(row.purchasePrice) : Number.NaN;
    const renewalPriceParsed = row.renewalPrice ? Number.parseFloat(row.renewalPrice) : Number.NaN;

    const parsedPurchaseDate = row.purchaseDate ? new Date(row.purchaseDate) : undefined;
    const parsedRenewalDate = row.renewalDate ? new Date(row.renewalDate) : undefined;
    const tierNum = row.tier ? Number.parseInt(row.tier, 10) : NaN;
    const validTier = Number.isFinite(tierNum) ? Math.min(3, Math.max(1, tierNum)) : 3;

    const newDomain: NewDomain = {
        domain: domainName,
        tld,
        registrar: parseRegistrar(row.registrar),
        purchasePrice: Number.isFinite(purchasePriceParsed) ? purchasePriceParsed : undefined,
        purchaseDate: parsedPurchaseDate && Number.isFinite(parsedPurchaseDate.getTime()) ? parsedPurchaseDate : undefined,
        renewalDate: parsedRenewalDate && Number.isFinite(parsedRenewalDate.getTime()) ? parsedRenewalDate : undefined,
        renewalPrice: Number.isFinite(renewalPriceParsed) ? renewalPriceParsed : undefined,
        status: parseStatus(row.status),
        bucket: parseBucket(row.bucket),
        tier: validTier,
        niche: row.niche || undefined,
        subNiche: row.subNiche || undefined,
        siteTemplate: parseTemplate(row.siteTemplate),
        notes: row.notes || undefined,
        tags: row.tags ? row.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [],
    };

    const inserted = await db.insert(domains).values(newDomain).returning();
    if (inserted.length === 0) {
        throw new Error('Domain insert returned no rows');
    }
    result.success++;
    result.created.push({ id: inserted[0].id, domain: domainName });
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        if (!file.name.endsWith('.csv')) {
            return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 });
        }

        const text = await file.text();
        const rows = parseCSV(text);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'CSV file is empty or invalid' }, { status: 400 });
        }

        const result: ImportResult = {
            success: 0,
            failed: 0,
            errors: [],
            created: [],
        };

        for (const row of rows) {
            try {
                await processCSVRow(row, result);
            } catch (err) {
                result.failed++;
                result.errors.push({
                    domain: row.domain || 'unknown',
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            }
        }

        // Auto-classify imported domains that have no niche (sequential to avoid rate limits)
        const unclassified = result.created.filter(
            (c) => {
                const niche = rows.find((r) => r.domain?.toLowerCase() === c.domain)?.niche;
                return !niche;
            }
        );
        const classifyErrors: Array<{ domain: string; error: string }> = [];
        for (const item of unclassified) {
            try {
                await classifyAndUpdateDomain(item.id);
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Classification failed';
                classifyErrors.push({ domain: item.domain, error: msg });
                console.warn('Auto-classification failed for imported domain', item.domain, err);
            }
        }
        if (classifyErrors.length > 0) {
            (result as ImportResult & { classifyErrors?: typeof classifyErrors }).classifyErrors = classifyErrors;
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('CSV import failed:', error);
        return NextResponse.json({ error: 'Failed to process CSV file' }, { status: 500 });
    }
}

function parseCSV(text: string): CSVRow[] {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

    if (lines.length < 2) {
        return [];
    }

    // Parse header
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
    const domainIndex = headers.findIndex(h => h === 'domain' || h === 'domainname' || h === 'domain_name');

    if (domainIndex === -1) {
        throw new Error('CSV must have a "domain" column');
    }

    // Map headers to expected field names
    const headerMap: Record<string, keyof CSVRow> = {
        domain: 'domain',
        domainname: 'domain',
        domain_name: 'domain',
        registrar: 'registrar',
        purchaseprice: 'purchasePrice',
        purchase_price: 'purchasePrice',
        price: 'purchasePrice',
        purchasedate: 'purchaseDate',
        purchase_date: 'purchaseDate',
        renewaldate: 'renewalDate',
        renewal_date: 'renewalDate',
        renewalprice: 'renewalPrice',
        renewal_price: 'renewalPrice',
        status: 'status',
        bucket: 'bucket',
        tier: 'tier',
        niche: 'niche',
        subniche: 'subNiche',
        sub_niche: 'subNiche',
        sitetemplate: 'siteTemplate',
        site_template: 'siteTemplate',
        template: 'siteTemplate',
        notes: 'notes',
        tags: 'tags',
    };

    // Parse rows
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row: CSVRow = { domain: '' };

        headers.forEach((header, index) => {
            const field = headerMap[header];
            if (field && values[index]) {
                row[field] = values[index].trim();
            }
        });

        if (row.domain) {
            rows.push(row);
        }
    }

    return rows;
}

function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);

    return values.map(v => v.replaceAll(/^"|"$/g, ''));
}
