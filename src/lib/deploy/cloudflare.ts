/**
 * Cloudflare Pages Integration
 * Creates projects, triggers deployments, checks status
 */

const CF_API = 'https://api.cloudflare.com/client/v4';
const CF_FETCH_TIMEOUT_MS = 30_000;
const CF_UPLOAD_TIMEOUT_MS = 120_000;

interface CloudflareConfig {
    apiToken: string;
    accountId: string;
}

export type CloudflareClientOptions = {
    apiToken?: string | null;
    accountId?: string | null;
};

export type ResolvedCloudflareAccount = {
    id: string;
    name: string | null;
};

interface ProjectCreateResult {
    success: boolean;
    projectName?: string;
    deploymentUrl?: string;
    error?: string;
}

interface DeploymentResult {
    success: boolean;
    deploymentId?: string;
    projectName?: string;
    url?: string;
    status?: string;
    error?: string;
}

type ZoneCreateResult = {
    success: boolean;
    zoneId?: string;
    zoneName?: string;
    nameservers?: string[];
    status?: string;
    alreadyExists?: boolean;
    error?: string;
};

type ZoneNameserverLookup = {
    zoneId: string;
    zoneName: string;
    nameservers: string[];
};

const accountListCache = new Map<string, ResolvedCloudflareAccount[]>();
const accountListLookupInFlight = new Map<string, Promise<ResolvedCloudflareAccount[]>>();
const accountIdCache = new Map<string, string>();
const accountIdLookupInFlight = new Map<string, Promise<string>>();
let multiAccountWarningLogged = false;
const CLOUDFLARE_API_MAX_RETRIES = (() => {
    const parsed = Number.parseInt(process.env.CLOUDFLARE_API_MAX_RETRIES || '', 10);
    if (Number.isFinite(parsed)) {
        return Math.max(0, Math.min(parsed, 5));
    }
    return 2;
})();
const CLOUDFLARE_API_BASE_RETRY_DELAY_MS = (() => {
    const parsed = Number.parseInt(process.env.CLOUDFLARE_API_BASE_RETRY_DELAY_MS || '', 10);
    if (Number.isFinite(parsed)) {
        return Math.max(100, Math.min(parsed, 10_000));
    }
    return 800;
})();
const CLOUDFLARE_API_MAX_RETRY_DELAY_MS = (() => {
    const parsed = Number.parseInt(process.env.CLOUDFLARE_API_MAX_RETRY_DELAY_MS || '', 10);
    if (Number.isFinite(parsed)) {
        return Math.max(500, Math.min(parsed, 60_000));
    }
    return 15_000;
})();

function resolveApiToken(options?: CloudflareClientOptions): string {
    const apiToken = options?.apiToken?.trim() || process.env.CLOUDFLARE_API_TOKEN;
    if (!apiToken) {
        throw new Error('CLOUDFLARE_API_TOKEN must be set');
    }
    return apiToken;
}

function accountCacheKey(apiToken: string): string {
    return apiToken;
}

async function listCloudflareAccounts(apiToken: string): Promise<ResolvedCloudflareAccount[]> {
    const cacheKey = accountCacheKey(apiToken);
    const cached = accountListCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const pending = accountListLookupInFlight.get(cacheKey);
    if (pending) {
        return pending;
    }

    const lookup = (async () => {
        const response = await fetch(`${CF_API}/accounts?page=1&per_page=50`, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(CF_FETCH_TIMEOUT_MS),
        });

        const data = await response.json() as {
            success?: boolean;
            result?: Array<{ id?: string; name?: string }>;
            errors?: Array<{ message?: string }>;
        };

        if (!response.ok || !data.success || !Array.isArray(data.result) || data.result.length === 0) {
            const message = data.errors?.[0]?.message || 'Cloudflare account lookup failed';
            throw new Error(message);
        }

        const accounts = data.result
            .filter((candidate): candidate is { id: string; name?: string } => Boolean(candidate?.id))
            .map((candidate) => ({
                id: candidate.id,
                name: candidate.name ?? null,
            }));

        accountListCache.set(cacheKey, accounts);
        return accounts;
    })();

    accountListLookupInFlight.set(cacheKey, lookup);

    try {
        return await lookup;
    } finally {
        accountListLookupInFlight.delete(cacheKey);
    }
}

async function resolveCloudflareAccountId(
    apiToken: string,
    explicitAccountId?: string | null,
): Promise<string> {
    if (explicitAccountId?.trim()) {
        return explicitAccountId.trim();
    }

    const cacheKey = `${accountCacheKey(apiToken)}::${process.env.CLOUDFLARE_ACCOUNT_NAME?.trim().toLowerCase() || ''}`;
    const cached = accountIdCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const pending = accountIdLookupInFlight.get(cacheKey);
    if (pending) {
        return pending;
    }

    const lookup = (async () => {
        const accounts = await listCloudflareAccounts(apiToken);
        const preferredAccountName = process.env.CLOUDFLARE_ACCOUNT_NAME?.trim().toLowerCase();
        const namedMatch = preferredAccountName
            ? accounts.find((candidate) => candidate.name?.toLowerCase() === preferredAccountName)
            : undefined;

        const selected = namedMatch ?? accounts[0];
        if (!selected?.id) {
            throw new Error('CLOUDFLARE_ACCOUNT_ID is not set and account auto-discovery returned no id');
        }

        if (!namedMatch && accounts.length > 1 && !preferredAccountName && !multiAccountWarningLogged) {
            console.warn('Multiple Cloudflare accounts detected; using first account. Set CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_NAME to pin one.');
            multiAccountWarningLogged = true;
        }

        accountIdCache.set(cacheKey, selected.id);
        return selected.id;
    })();

    accountIdLookupInFlight.set(cacheKey, lookup);
    try {
        return await lookup;
    } finally {
        accountIdLookupInFlight.delete(cacheKey);
    }
}

export async function resolveCloudflareAccountByReference(
    reference: string,
    options?: CloudflareClientOptions,
): Promise<ResolvedCloudflareAccount | null> {
    const normalizedReference = reference.trim().toLowerCase();
    if (!normalizedReference) {
        return null;
    }

    if (/^[a-f0-9]{32}$/i.test(normalizedReference)) {
        return {
            id: normalizedReference,
            name: null,
        };
    }

    const apiToken = resolveApiToken(options);
    const accounts = await listCloudflareAccounts(apiToken);
    const matched = accounts.find((account) => {
        if (account.id.toLowerCase() === normalizedReference) return true;
        if (account.name?.toLowerCase() === normalizedReference) return true;
        return false;
    });

    return matched ?? null;
}

async function getConfig(options?: CloudflareClientOptions): Promise<CloudflareConfig> {
    const apiToken = resolveApiToken(options);
    const explicitAccountId = options?.accountId?.trim()
        || process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
        || null;

    const accountId = await resolveCloudflareAccountId(apiToken, explicitAccountId);
    return { apiToken, accountId };
}

async function cfFetch(
    endpoint: string,
    options: RequestInit = {},
    clientOptions?: CloudflareClientOptions,
): Promise<Response> {
    const config = await getConfig(clientOptions);
    const requestInit: RequestInit = {
        ...options,
        headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    };

    let response = await fetch(`${CF_API}${endpoint}`, { ...requestInit, signal: AbortSignal.timeout(CF_FETCH_TIMEOUT_MS) });
    for (let attempt = 1; attempt <= CLOUDFLARE_API_MAX_RETRIES; attempt += 1) {
        if (!isRetryableStatus(response.status)) {
            return response;
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
        const fallbackDelay = Math.min(
            CLOUDFLARE_API_MAX_RETRY_DELAY_MS,
            CLOUDFLARE_API_BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
        );
        const jitterMs = Math.floor(Math.random() * 250);
        await sleep((retryAfterMs ?? fallbackDelay) + jitterMs);
        response = await fetch(`${CF_API}${endpoint}`, { ...requestInit, signal: AbortSignal.timeout(CF_FETCH_TIMEOUT_MS) });
    }

    return response;
}

function normalizeNameserver(value: string): string {
    return value.trim().toLowerCase().replace(/\.+$/g, '');
}

function normalizeDomain(value: string): string {
    return value.trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function parseRetryAfterMs(header: string | null): number | null {
    if (!header) return null;

    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(CLOUDFLARE_API_MAX_RETRY_DELAY_MS, Math.max(250, seconds * 1000));
    }

    const parsedDateMs = Date.parse(header);
    if (!Number.isNaN(parsedDateMs)) {
        const delta = parsedDateMs - Date.now();
        if (delta > 0) {
            return Math.min(CLOUDFLARE_API_MAX_RETRY_DELAY_MS, Math.max(250, delta));
        }
    }

    return null;
}

function isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
}

/**
 * Get Pages project info
 */
export async function getPagesProject(
    projectName: string,
    clientOptions?: CloudflareClientOptions,
): Promise<{
    name: string;
    subdomain: string;
    domains: string[];
    latestDeployment?: {
        id: string;
        url: string;
        status: string;
    };
} | null> {
    const config = await getConfig(clientOptions);

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}`,
            {},
            clientOptions,
        );

        const data = await response.json();

        if (!data.success) {
            return null;
        }

        return {
            name: data.result.name,
            subdomain: data.result.subdomain,
            domains: data.result.domains || [],
            latestDeployment: data.result.latest_deployment ? {
                id: data.result.latest_deployment.id,
                url: data.result.latest_deployment.url,
                status: data.result.latest_deployment.latest_stage?.status || 'unknown',
            } : undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Get deployment status
 */
export async function getDeploymentStatus(
    projectName: string,
    deploymentId: string,
    clientOptions?: CloudflareClientOptions,
): Promise<DeploymentResult> {
    const config = await getConfig(clientOptions);

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
            {},
            clientOptions,
        );

        const data = await response.json();

        if (!data.success) {
            return { success: false, error: data.errors?.[0]?.message || 'Failed to get deployment' };
        }

        return {
            success: true,
            deploymentId: data.result.id,
            url: data.result.url,
            status: data.result.latest_stage?.status || 'unknown',
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Add custom domain to Pages project
 */
export async function addCustomDomain(
    projectName: string,
    domain: string,
    clientOptions?: CloudflareClientOptions,
): Promise<{ success: boolean; error?: string }> {
    const config = await getConfig(clientOptions);

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}/domains`,
            {
                method: 'POST',
                body: JSON.stringify({ name: domain }),
            },
            clientOptions,
        );

        const data = await response.json();

        if (!data.success) {
            const errMsg = (data.errors?.[0]?.message || '') as string;
            // Domain already attached to this project — treat as success
            if (/already.*exist/i.test(errMsg) || /already.*active/i.test(errMsg) || /already.*registered/i.test(errMsg) || /already.*added/i.test(errMsg)) {
                console.log(`[CF] Domain "${domain}" already linked to project "${projectName}", continuing.`);
                return { success: true };
            }
            return { success: false, error: errMsg || 'Failed to add domain' };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Create a Pages project for Direct Upload (no GitHub source).
 * Returns the existing project if it already exists.
 */
export async function createDirectUploadProject(
    projectName: string,
    clientOptions?: CloudflareClientOptions,
): Promise<ProjectCreateResult> {
    const config = await getConfig(clientOptions);

    try {
        // Check if the project already exists first — avoids brittle error-message
        // parsing when the CF API returns "already exists" in varying formats.
        const existing = await getPagesProject(projectName, clientOptions);
        if (existing) {
            console.log(`[CF] Project "${projectName}" already exists, reusing.`);
            return {
                success: true,
                projectName: existing.name,
                deploymentUrl: existing.subdomain,
            };
        }

        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name: projectName,
                    production_branch: 'main',
                }),
            },
            clientOptions,
        );

        const data = await response.json();

        if (!data.success) {
            // Race condition: project may have been created between GET and POST.
            const errCode = data.errors?.[0]?.code;
            const errMsg = (data.errors?.[0]?.message || '') as string;
            const alreadyExists = errCode === 8000007
                || errCode === '8000007'
                || /already exists/i.test(errMsg);

            if (alreadyExists) {
                console.log(`[CF] Project "${projectName}" created concurrently, reusing.`);
                return {
                    success: true,
                    projectName,
                    deploymentUrl: `${projectName}.pages.dev`,
                };
            }
            return { success: false, error: data.errors?.[0]?.message || 'Failed to create project' };
        }

        return {
            success: true,
            projectName: data.result.name,
            deploymentUrl: data.result.subdomain,
        };
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        if (/already exists/i.test(errMsg)) {
            console.log(`[CF] Project "${projectName}" already exists (caught), reusing.`);
            return {
                success: true,
                projectName,
                deploymentUrl: `${projectName}.pages.dev`,
            };
        }
        return {
            success: false,
            error: errMsg,
        };
    }
}

/**
 * Deploy files directly to Cloudflare Pages via Direct Upload.
 * Uploads all files as multipart form data — no GitHub needed.
 * Supports binary data for images/assets.
 */
export async function directUploadDeploy(
    projectName: string,
    files: Array<{ path: string; content: string | Buffer | Uint8Array }>,
    clientOptions?: CloudflareClientOptions,
    deployOptions?: { branch?: string },
): Promise<DeploymentResult> {
    const config = await getConfig(clientOptions);

    try {
        const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
        const { join, dirname } = await import('node:path');
        const { spawnSync } = await import('node:child_process');

        // Validate inputs to prevent command injection via args
        const SAFE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/i;
        if (!SAFE_NAME_RE.test(projectName)) {
            return { success: false, error: 'Invalid project name for deploy' };
        }
        const branch = deployOptions?.branch || 'main';
        if (!SAFE_NAME_RE.test(branch)) {
            return { success: false, error: 'Invalid branch name for deploy' };
        }

        const tmpDir = join(process.env.TMPDIR || '/tmp', `cf-deploy-${projectName}-${Date.now()}`);
        rmSync(tmpDir, { recursive: true, force: true });

        try {
            for (const file of files) {
                const filePath = join(tmpDir, file.path);
                mkdirSync(dirname(filePath), { recursive: true });
                if (typeof file.content === 'string') {
                    writeFileSync(filePath, file.content, 'utf-8');
                } else {
                    writeFileSync(filePath, file.content);
                }
            }

            const env = {
                ...process.env,
                CLOUDFLARE_API_TOKEN: config.apiToken,
                CLOUDFLARE_ACCOUNT_ID: config.accountId,
            };

            const proc = spawnSync('npx', [
                'wrangler', 'pages', 'deploy', tmpDir,
                `--project-name=${projectName}`,
                `--branch=${branch}`,
                '--commit-dirty=true',
            ], {
                env,
                timeout: CF_UPLOAD_TIMEOUT_MS,
                encoding: 'utf-8' as BufferEncoding,
                maxBuffer: 10 * 1024 * 1024,
                shell: true,
            });

            if (proc.error) throw proc.error;
            if (proc.signal) {
                const partial = `${proc.stdout || ''}${proc.stderr || ''}`.slice(-300);
                throw new Error(`Deploy process killed by signal ${proc.signal}${partial ? `: ${partial}` : ''}`);
            }
            const output = `${proc.stdout || ''}${proc.stderr || ''}`;

            const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev/);
            const url = urlMatch ? urlMatch[0] : undefined;
            const success = output.includes('Deployment complete') || output.includes('Success!');

            if (!success) {
                return { success: false, error: output.slice(-500) };
            }

            return {
                success: true,
                url,
                status: 'success',
                projectName,
            };
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        };
    }
}

/**
 * Delete Pages project
 */
export async function deletePagesProject(
    projectName: string,
    clientOptions?: CloudflareClientOptions,
): Promise<{ success: boolean; error?: string }> {
    const config = await getConfig(clientOptions);

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}`,
            { method: 'DELETE' },
            clientOptions,
        );

        const data = await response.json();

        if (!data.success && response.status !== 200) {
            return { success: false, error: data.errors?.[0]?.message || 'Failed to delete project' };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Resolve authoritative Cloudflare nameservers for a zone.
 * Returns null when the zone is not found or nameservers are unavailable.
 */
export async function getZoneNameservers(
    domain: string,
    clientOptions?: CloudflareClientOptions,
): Promise<{
    zoneId: string;
    zoneName: string;
    nameservers: string[];
} | null> {
    const normalizedDomain = normalizeDomain(domain);

    try {
        const config = await getConfig(clientOptions);
        const params = new URLSearchParams({
            name: normalizedDomain,
            match: 'all',
            page: '1',
            per_page: '1',
            'account.id': config.accountId,
        });

        const response = await cfFetch(`/zones?${params.toString()}`, {}, clientOptions);
        if (!response.ok) return null;

        const data = await response.json() as {
            success?: boolean;
            result?: Array<{
                id?: string;
                name?: string;
                name_servers?: string[];
            }>;
        };

        if (!data.success || !Array.isArray(data.result) || data.result.length === 0) {
            return null;
        }

        const zone = data.result.find((candidate) => {
            if (!candidate?.name) return false;
            return candidate.name.toLowerCase() === normalizedDomain;
        }) ?? data.result[0];

        if (!zone?.id || !zone?.name) {
            return null;
        }

        const nameservers = Array.isArray(zone.name_servers)
            ? [...new Set(zone.name_servers
                .map((value) => normalizeNameserver(value))
                .filter((value) => value.endsWith('.cloudflare.com')))]
            : [];

        if (nameservers.length < 2) {
            return null;
        }

        return {
            zoneId: zone.id,
            zoneName: zone.name,
            nameservers,
        };
    } catch {
        return null;
    }
}

/**
 * Resolve Cloudflare nameservers for many domains with a single zone listing sweep.
 * Throws on Cloudflare API errors so callers can distinguish API outages from missing zones.
 */
export async function getZoneNameserverMap(
    domains: string[],
    clientOptions?: CloudflareClientOptions,
): Promise<Map<string, ZoneNameserverLookup>> {
    const normalized = [...new Set(domains.map((value) => normalizeDomain(value)).filter(Boolean))];
    const remaining = new Set(normalized);
    const lookup = new Map<string, ZoneNameserverLookup>();
    if (remaining.size === 0) {
        return lookup;
    }

    const config = await getConfig(clientOptions);
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && remaining.size > 0) {
        const params = new URLSearchParams({
            'account.id': config.accountId,
            page: String(page),
            per_page: '50',
        });

        const response = await cfFetch(`/zones?${params.toString()}`, {}, clientOptions);
        const data = await response.json() as {
            success?: boolean;
            errors?: Array<{ message?: string }>;
            result?: Array<{
                id?: string;
                name?: string;
                name_servers?: string[];
            }>;
            result_info?: {
                total_pages?: number;
            };
        };

        if (!response.ok || !data.success || !Array.isArray(data.result)) {
            throw new Error(data.errors?.[0]?.message || 'Failed to list Cloudflare zones');
        }

        for (const zone of data.result) {
            if (!zone?.id || !zone?.name) continue;
            const domainName = normalizeDomain(zone.name);
            if (!remaining.has(domainName)) continue;

            const nameservers = Array.isArray(zone.name_servers)
                ? [...new Set(zone.name_servers
                    .map((value) => normalizeNameserver(value))
                    .filter((value) => value.endsWith('.cloudflare.com')))]
                : [];

            if (nameservers.length < 2) continue;

            lookup.set(domainName, {
                zoneId: zone.id,
                zoneName: zone.name,
                nameservers,
            });
            remaining.delete(domainName);
        }

        totalPages = Math.max(1, data.result_info?.total_pages ?? 1);
        page += 1;
    }

    return lookup;
}

/**
 * Create a Cloudflare zone for a domain.
 * Returns existing zone details when the zone already exists under this account.
 */
export async function createZone(
    domain: string,
    options?: { jumpStart?: boolean },
    clientOptions?: CloudflareClientOptions,
): Promise<ZoneCreateResult> {
    const normalizedDomain = domain.trim().toLowerCase();

    try {
        const config = await getConfig(clientOptions);
        const response = await cfFetch('/zones', {
            method: 'POST',
            body: JSON.stringify({
                name: normalizedDomain,
                account: { id: config.accountId },
                type: 'full',
                jump_start: options?.jumpStart ?? false,
            }),
        }, clientOptions);

        const data = await response.json() as {
            success?: boolean;
            errors?: Array<{ code?: number; message?: string }>;
            result?: {
                id?: string;
                name?: string;
                status?: string;
                name_servers?: string[];
            };
        };

        if (!response.ok || !data.success || !data.result?.id || !data.result?.name) {
            const existing = await getZoneNameservers(normalizedDomain, clientOptions);
            if (existing) {
                return {
                    success: true,
                    alreadyExists: true,
                    zoneId: existing.zoneId,
                    zoneName: existing.zoneName,
                    nameservers: existing.nameservers,
                    status: 'existing',
                };
            }

            return {
                success: false,
                error: data.errors?.[0]?.message || 'Failed to create Cloudflare zone',
            };
        }

        let nameservers = Array.isArray(data.result.name_servers)
            ? [...new Set(data.result.name_servers
                .map((value) => normalizeNameserver(value))
                .filter((value) => value.endsWith('.cloudflare.com')))]
            : [];

        if (nameservers.length < 2) {
            const resolved = await getZoneNameservers(normalizedDomain, clientOptions);
            if (resolved) {
                nameservers = resolved.nameservers;
            }
        }

        return {
            success: true,
            zoneId: data.result.id,
            zoneName: data.result.name,
            nameservers,
            status: data.result.status,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown Cloudflare zone create error',
        };
    }
}

/**
 * Ensure the Cloudflare zone has a CNAME record routing the root domain
 * to the Cloudflare Pages project. Without this record, NS pointing to
 * Cloudflare will still show a parked/default page.
 *
 * Creates the record if missing, updates it if it points elsewhere.
 * Returns the action taken and any error.
 */
export async function ensurePagesDnsRecord(
    domain: string,
    pagesSubdomain: string,
    clientOptions?: CloudflareClientOptions,
): Promise<{ success: boolean; action: 'created' | 'updated' | 'already_correct' | 'none'; error?: string }> {
    const normalizedDomain = normalizeDomain(domain);
    // Pages target: project.pages.dev
    const target = pagesSubdomain.endsWith('.pages.dev')
        ? pagesSubdomain
        : `${pagesSubdomain}.pages.dev`;

    try {
        // Resolve the zone
        const zone = await getZoneNameservers(normalizedDomain, clientOptions);
        if (!zone) {
            return { success: false, action: 'none', error: `No Cloudflare zone found for ${normalizedDomain}` };
        }

        // List existing DNS records for the root domain
        const listParams = new URLSearchParams({
            name: normalizedDomain,
            type: 'CNAME',
        });
        const listResponse = await cfFetch(
            `/zones/${zone.zoneId}/dns_records?${listParams.toString()}`,
            {},
            clientOptions,
        );
        const listData = await listResponse.json() as {
            success?: boolean;
            result?: Array<{ id: string; type: string; name: string; content: string }>;
        };

        const existingCname = listData.success && Array.isArray(listData.result)
            ? listData.result.find((r) => r.name === normalizedDomain && r.type === 'CNAME')
            : null;

        if (existingCname) {
            // Already points to the right target
            if (normalizeDomain(existingCname.content) === normalizeDomain(target)) {
                return { success: true, action: 'already_correct' };
            }

            // Update to point to Pages project
            const updateResponse = await cfFetch(
                `/zones/${zone.zoneId}/dns_records/${existingCname.id}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        type: 'CNAME',
                        name: normalizedDomain,
                        content: target,
                        proxied: true,
                    }),
                },
                clientOptions,
            );
            const updateData = await updateResponse.json() as { success?: boolean; errors?: Array<{ message?: string }> };
            if (!updateData.success) {
                return { success: false, action: 'none', error: updateData.errors?.[0]?.message || 'Failed to update CNAME record' };
            }
            return { success: true, action: 'updated' };
        }

        // Check for conflicting A/AAAA records on the root
        const aListParams = new URLSearchParams({ name: normalizedDomain });
        const aListResponse = await cfFetch(
            `/zones/${zone.zoneId}/dns_records?${aListParams.toString()}`,
            {},
            clientOptions,
        );
        const aListData = await aListResponse.json() as {
            success?: boolean;
            result?: Array<{ id: string; type: string; name: string; content: string }>;
        };

        if (aListData.success && Array.isArray(aListData.result)) {
            // Delete conflicting A/AAAA records on the root that would prevent CNAME
            for (const record of aListData.result) {
                if (record.name === normalizedDomain && (record.type === 'A' || record.type === 'AAAA')) {
                    await cfFetch(
                        `/zones/${zone.zoneId}/dns_records/${record.id}`,
                        { method: 'DELETE' },
                        clientOptions,
                    );
                }
            }
        }

        // Create new CNAME record (Cloudflare supports CNAME flattening at apex)
        const createResponse = await cfFetch(
            `/zones/${zone.zoneId}/dns_records`,
            {
                method: 'POST',
                body: JSON.stringify({
                    type: 'CNAME',
                    name: '@',
                    content: target,
                    proxied: true,
                    comment: 'Auto-created by deploy pipeline for Cloudflare Pages',
                }),
            },
            clientOptions,
        );
        const createData = await createResponse.json() as { success?: boolean; errors?: Array<{ message?: string }> };
        if (!createData.success) {
            return { success: false, action: 'none', error: createData.errors?.[0]?.message || 'Failed to create CNAME record' };
        }
        return { success: true, action: 'created' };
    } catch (error) {
        return {
            success: false,
            action: 'none',
            error: error instanceof Error ? error.message : 'Unknown error ensuring Pages DNS record',
        };
    }
}

/**
 * Verify that a domain's live NS records point to Cloudflare.
 * Uses a real DNS lookup so it reflects what browsers/resolvers see.
 */
export async function verifyDomainPointsToCloudflare(domain: string): Promise<{
    verified: boolean;
    nameservers: string[];
    detail: string;
}> {
    const { Resolver } = await import('node:dns/promises');
    const resolver = new Resolver();
    // Use public resolvers to avoid stale local cache
    resolver.setServers(['1.1.1.1', '8.8.8.8']);

    const normalizedDomain = normalizeDomain(domain);

    try {
        const nsRecords = await resolver.resolveNs(normalizedDomain);
        const lowered = nsRecords.map((ns) => ns.toLowerCase());
        const cloudflareNs = lowered.filter((ns) => ns.endsWith('.cloudflare.com') || ns.endsWith('.cloudflare.com.'));

        if (cloudflareNs.length >= 2) {
            return {
                verified: true,
                nameservers: cloudflareNs,
                detail: `NS records point to Cloudflare: ${cloudflareNs.join(', ')}`,
            };
        }

        return {
            verified: false,
            nameservers: lowered,
            detail: `NS records (${lowered.join(', ')}) do not point to Cloudflare`,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            verified: false,
            nameservers: [],
            detail: `DNS NS lookup failed for ${normalizedDomain}: ${message}`,
        };
    }
}
