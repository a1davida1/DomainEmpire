import * as dotenv from 'dotenv';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { db, domains } from '@/lib/db';
import { createZone, getZoneNameservers } from '@/lib/deploy/cloudflare';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type DomainRow = {
    id: string;
    domain: string;
};

type ZoneCheckResult = {
    row: DomainRow;
    hasZone: boolean;
    nameservers: string[];
};

type CreateResult = {
    row: DomainRow;
    created: boolean;
    existing: boolean;
    failed: boolean;
    error?: string;
    nameservers?: string[];
};

function parseIntegerArg(args: string[], key: string, fallback: number): number {
    const entry = args.find((arg) => arg.startsWith(`${key}=`));
    if (!entry) return fallback;
    const value = Number.parseInt(entry.slice(key.length + 1), 10);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return value;
}

function parseIdsArg(args: string[]): Set<string> | null {
    const entry = args.find((arg) => arg.startsWith('--ids='));
    if (!entry) return null;
    const values = entry
        .slice('--ids='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    return values.length > 0 ? new Set(values) : null;
}

async function mapLimit<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (items.length === 0) return [];

    const output = new Array<R>(items.length);
    let cursor = 0;

    async function runWorker() {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= items.length) return;
            output[index] = await worker(items[index], index);
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
    await Promise.all(workers);
    return output;
}

async function checkZone(row: DomainRow): Promise<ZoneCheckResult> {
    const zone = await getZoneNameservers(row.domain);
    return {
        row,
        hasZone: Boolean(zone && zone.nameservers.length >= 2),
        nameservers: zone?.nameservers ?? [],
    };
}

async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const jumpStart = args.includes('--jump-start');
    const concurrency = parseIntegerArg(args, '--concurrency', 6);
    const limit = parseIntegerArg(args, '--limit', 0);
    const idsFilter = parseIdsArg(args);

    console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
    console.log(`Concurrency: ${concurrency}`);
    if (jumpStart) console.log('Jump start: enabled');

    const rows = await db
        .select({
            id: domains.id,
            domain: domains.domain,
        })
        .from(domains)
        .where(and(
            isNull(domains.deletedAt),
            eq(domains.registrar, 'godaddy'),
        ));

    let candidates = rows;
    if (idsFilter) {
        candidates = rows.filter((row) => idsFilter.has(row.id));
    }
    if (limit > 0) {
        candidates = candidates.slice(0, limit);
    }

    console.log(`Loaded ${candidates.length} GoDaddy domains for evaluation.`);
    if (candidates.length === 0) {
        console.log('Nothing to do.');
        return;
    }

    const beforeChecks = await mapLimit(candidates, concurrency, async (row) => checkZone(row));
    const missingBefore = beforeChecks.filter((item) => !item.hasZone).map((item) => item.row);
    const readyBefore = beforeChecks.length - missingBefore.length;

    console.log(`Preflight before creation -> ready: ${readyBefore}, missing zone: ${missingBefore.length}`);

    let createResults: CreateResult[] = [];
    if (apply && missingBefore.length > 0) {
        createResults = await mapLimit(missingBefore, concurrency, async (row) => {
            const created = await createZone(row.domain, { jumpStart });
            if (!created.success) {
                return {
                    row,
                    created: false,
                    existing: false,
                    failed: true,
                    error: created.error ?? 'Unknown Cloudflare zone create error',
                };
            }

            return {
                row,
                created: !created.alreadyExists,
                existing: Boolean(created.alreadyExists),
                failed: false,
                nameservers: created.nameservers ?? [],
            };
        });

        const createdCount = createResults.filter((item) => item.created).length;
        const existingCount = createResults.filter((item) => item.existing).length;
        const failedCount = createResults.filter((item) => item.failed).length;

        console.log(`Zone creation -> created: ${createdCount}, existing: ${existingCount}, failed: ${failedCount}`);

        const failedPreview = createResults
            .filter((item) => item.failed)
            .slice(0, 10)
            .map((item) => `${item.row.domain}: ${item.error ?? 'Unknown error'}`);
        if (failedPreview.length > 0) {
            console.log('First creation failures:');
            for (const line of failedPreview) {
                console.log(`- ${line}`);
            }
        }
    }

    const afterChecks = await mapLimit(candidates, concurrency, async (row) => checkZone(row));
    const missingAfter = afterChecks.filter((item) => !item.hasZone).map((item) => item.row.domain);
    const readyAfter = afterChecks.length - missingAfter.length;

    console.log(`Preflight after creation -> ready: ${readyAfter}, missing zone: ${missingAfter.length}`);

    if (missingAfter.length > 0) {
        console.log('First remaining missing-zone domains:');
        for (const domain of missingAfter.slice(0, 20)) {
            console.log(`- ${domain}`);
        }
    }
}

main().catch((error) => {
    console.error('Bulk Cloudflare zone run failed:', error);
    process.exit(1);
});
