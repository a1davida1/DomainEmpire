import * as dotenv from 'dotenv';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { db, domains } from '@/lib/db';
import { createZone } from '@/lib/deploy/cloudflare';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

type DomainRow = {
    id: string;
    domain: string;
};

type CreateResult = {
    row: DomainRow;
    created: boolean;
    existing: boolean;
    failed: boolean;
    skipped?: boolean;
    error?: string;
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

function normalizeDomain(value: string): string {
    return value.trim().toLowerCase();
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function resolveCloudflareConfigFromEnv() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
    if (!apiToken) {
        throw new Error('CLOUDFLARE_API_TOKEN is required');
    }

    return {
        apiToken,
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || null,
        accountName: process.env.CLOUDFLARE_ACCOUNT_NAME?.trim().toLowerCase() || null,
    };
}

async function resolveAccountId(apiToken: string, explicitId: string | null, preferredName: string | null): Promise<string> {
    if (explicitId) {
        return explicitId;
    }

    const response = await fetch('https://api.cloudflare.com/client/v4/accounts?page=1&per_page=50', {
        headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
        },
    });

    const body = await response.json() as {
        success?: boolean;
        result?: Array<{ id?: string; name?: string }>;
        errors?: Array<{ message?: string }>;
    };

    if (!response.ok || !body.success || !Array.isArray(body.result) || body.result.length === 0) {
        throw new Error(body.errors?.[0]?.message || 'Unable to resolve Cloudflare account id');
    }

    const named = preferredName
        ? body.result.find((entry) => entry.name?.toLowerCase() === preferredName)
        : undefined;
    const selected = named ?? body.result[0];
    if (!selected?.id) {
        throw new Error('Cloudflare account auto-discovery returned no account id');
    }

    return selected.id;
}

type CloudflareZone = {
    name: string;
    status: string | null;
    nameservers: string[];
};

async function listZones(accountId: string, apiToken: string): Promise<Map<string, CloudflareZone>> {
    const zoneMap = new Map<string, CloudflareZone>();
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
        const params = new URLSearchParams({
            'account.id': accountId,
            page: String(page),
            per_page: '50',
        });
        const response = await fetch(`https://api.cloudflare.com/client/v4/zones?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
        });

        const body = await response.json() as {
            success?: boolean;
            result?: Array<{ name?: string; status?: string; name_servers?: string[] }>;
            errors?: Array<{ message?: string }>;
            result_info?: { total_pages?: number };
        };

        if (!response.ok || !body.success || !Array.isArray(body.result)) {
            throw new Error(body.errors?.[0]?.message || 'Failed to list Cloudflare zones');
        }

        for (const row of body.result) {
            const name = row.name ? normalizeDomain(row.name) : '';
            if (!name) continue;
            const nameservers = Array.isArray(row.name_servers)
                ? row.name_servers.map((value) => value.trim().toLowerCase()).filter(Boolean)
                : [];
            zoneMap.set(name, {
                name,
                status: row.status ?? null,
                nameservers,
            });
        }

        totalPages = Math.max(1, body.result_info?.total_pages ?? 1);
        page += 1;
    }

    return zoneMap;
}

function isPreflightReady(zone: CloudflareZone | undefined): boolean {
    if (!zone) return false;
    return zone.nameservers.length >= 2;
}

function classifyCreateError(message: string): 'throttle' | 'activation_cap' | 'other' {
    const lowered = message.toLowerCase();
    if (
        lowered.includes('throttle')
        || lowered.includes('rate limit')
        || lowered.includes('please wait')
        || lowered.includes('too many requests')
    ) {
        return 'throttle';
    }

    if (
        lowered.includes('activate some zones')
        || lowered.includes('exceeded the limit for adding zones')
    ) {
        return 'activation_cap';
    }

    return 'other';
}

async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const jumpStart = args.includes('--jump-start');
    const delayMs = parseIntegerArg(args, '--delay-ms', 1000);
    const retryMax = parseIntegerArg(args, '--retry-max', 5);
    const limit = parseIntegerArg(args, '--limit', 0);
    const idsFilter = parseIdsArg(args);

    console.log(`Mode: ${apply ? 'apply' : 'dry-run'}`);
    console.log(`Create delay (ms): ${delayMs}`);
    console.log(`Retry max: ${retryMax}`);
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

    const config = resolveCloudflareConfigFromEnv();
    const accountId = await resolveAccountId(config.apiToken, config.accountId, config.accountName);
    console.log(`Using Cloudflare account: ${accountId}`);

    const zonesBefore = await listZones(accountId, config.apiToken);
    const missingBefore = candidates.filter((row) => !isPreflightReady(zonesBefore.get(normalizeDomain(row.domain))));
    const readyBefore = candidates.length - missingBefore.length;

    console.log(`Preflight before creation -> ready: ${readyBefore}, missing zone: ${missingBefore.length}`);

    const createResults: CreateResult[] = [];
    if (apply && missingBefore.length > 0) {
        let stopDueToActivationCap = false;
        for (const row of missingBefore) {
            if (stopDueToActivationCap) {
                createResults.push({
                    row,
                    created: false,
                    existing: false,
                    failed: false,
                    skipped: true,
                    error: 'Skipped after activation-cap error on earlier domain',
                });
                continue;
            }

            let resultForRow: CreateResult | null = null;
            let attempt = 0;
            while (attempt < retryMax) {
                attempt += 1;
                const created = await createZone(row.domain, { jumpStart });
                if (created.success) {
                    resultForRow = {
                        row,
                        created: !created.alreadyExists,
                        existing: Boolean(created.alreadyExists),
                        failed: false,
                    };
                    break;
                }

                const message = created.error ?? 'Unknown Cloudflare zone create error';
                const classification = classifyCreateError(message);
                if (classification === 'throttle' && attempt < retryMax) {
                    const waitMs = Math.min(30000, delayMs * attempt * 2);
                    console.log(`Throttle on ${row.domain}; retrying in ${waitMs}ms (attempt ${attempt}/${retryMax})`);
                    await sleep(waitMs);
                    continue;
                }

                resultForRow = {
                    row,
                    created: false,
                    existing: false,
                    failed: true,
                    error: message,
                };

                if (classification === 'activation_cap') {
                    stopDueToActivationCap = true;
                }
                break;
            }

            createResults.push(resultForRow ?? {
                row,
                created: false,
                existing: false,
                failed: true,
                error: 'Unknown Cloudflare zone create error',
            });

            await sleep(delayMs);
        }

        const createdCount = createResults.filter((item) => item.created).length;
        const existingCount = createResults.filter((item) => item.existing).length;
        const failedCount = createResults.filter((item) => item.failed).length;
        const skippedCount = createResults.filter((item) => item.skipped).length;

        console.log(`Zone creation -> created: ${createdCount}, existing: ${existingCount}, failed: ${failedCount}, skipped: ${skippedCount}`);

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

    const zonesAfter = await listZones(accountId, config.apiToken);
    const missingAfter = candidates
        .filter((item) => !isPreflightReady(zonesAfter.get(normalizeDomain(item.domain))))
        .map((item) => item.domain);
    const readyAfter = candidates.length - missingAfter.length;

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
