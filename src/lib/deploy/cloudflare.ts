/**
 * Cloudflare Pages Integration
 * Creates projects, triggers deployments, checks status
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

interface CloudflareConfig {
    apiToken: string;
    accountId: string;
}

interface ProjectCreateResult {
    success: boolean;
    projectName?: string;
    deploymentUrl?: string;
    error?: string;
}

interface DeploymentResult {
    success: boolean;
    deploymentId?: string;
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

let cachedResolvedAccountId: string | null = null;
let accountIdLookupInFlight: Promise<string> | null = null;

async function resolveCloudflareAccountId(apiToken: string): Promise<string> {
    const explicitAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    if (explicitAccountId) {
        return explicitAccountId;
    }

    if (cachedResolvedAccountId) {
        return cachedResolvedAccountId;
    }

    if (accountIdLookupInFlight) {
        return accountIdLookupInFlight;
    }

    accountIdLookupInFlight = (async () => {
        const response = await fetch(`${CF_API}/accounts?page=1&per_page=20`, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json() as {
            success?: boolean;
            result?: Array<{ id?: string; name?: string }>;
            errors?: Array<{ message?: string }>;
        };

        if (!response.ok || !data.success || !Array.isArray(data.result) || data.result.length === 0) {
            const message = data.errors?.[0]?.message || 'Cloudflare account auto-discovery failed';
            throw new Error(`CLOUDFLARE_ACCOUNT_ID is not set and ${message}`);
        }

        const preferredAccountName = process.env.CLOUDFLARE_ACCOUNT_NAME?.trim().toLowerCase();
        const namedMatch = preferredAccountName
            ? data.result.find((candidate) => candidate.name?.toLowerCase() === preferredAccountName)
            : undefined;

        const selected = namedMatch ?? data.result[0];
        if (!selected?.id) {
            throw new Error('CLOUDFLARE_ACCOUNT_ID is not set and account auto-discovery returned no id');
        }

        if (!namedMatch && data.result.length > 1 && !preferredAccountName) {
            console.warn('Multiple Cloudflare accounts detected; using first account. Set CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_ACCOUNT_NAME to pin one.');
        }

        cachedResolvedAccountId = selected.id;
        return selected.id;
    })();

    try {
        return await accountIdLookupInFlight;
    } finally {
        accountIdLookupInFlight = null;
    }
}

async function getConfig(): Promise<CloudflareConfig> {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!apiToken) {
        throw new Error('CLOUDFLARE_API_TOKEN must be set');
    }

    const accountId = await resolveCloudflareAccountId(apiToken);
    return { apiToken, accountId };
}

async function cfFetch(
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const config = await getConfig();

    return fetch(`${CF_API}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
}

function normalizeNameserver(value: string): string {
    return value.trim().toLowerCase().replace(/\.+$/g, '');
}

/**
 * Get Pages project info
 */
export async function getPagesProject(projectName: string): Promise<{
    name: string;
    subdomain: string;
    domains: string[];
    latestDeployment?: {
        id: string;
        url: string;
        status: string;
    };
} | null> {
    const config = await getConfig();

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}`
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
    deploymentId: string
): Promise<DeploymentResult> {
    const config = await getConfig();

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}/deployments/${deploymentId}`
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
    domain: string
): Promise<{ success: boolean; error?: string }> {
    const config = await getConfig();

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}/domains`,
            {
                method: 'POST',
                body: JSON.stringify({ name: domain }),
            }
        );

        const data = await response.json();

        if (!data.success) {
            return { success: false, error: data.errors?.[0]?.message || 'Failed to add domain' };
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
): Promise<ProjectCreateResult> {
    const config = await getConfig();

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name: projectName,
                    production_branch: 'main',
                }),
            }
        );

        const data = await response.json();

        if (!data.success) {
            // Project already exists — reuse it
            if (data.errors?.[0]?.code === 8000007) {
                const existing = await getPagesProject(projectName);
                if (existing) {
                    return {
                        success: true,
                        projectName: existing.name,
                        deploymentUrl: existing.subdomain,
                    };
                }
            }
            return { success: false, error: data.errors?.[0]?.message || 'Failed to create project' };
        }

        return {
            success: true,
            projectName: data.result.name,
            deploymentUrl: data.result.subdomain,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
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
): Promise<DeploymentResult> {
    const config = await getConfig();

    try {
        // Build multipart form data with manifest
        const { createHash } = await import('node:crypto');
        const manifest: Record<string, string> = {};
        const filesByHash = new Map<string, { path: string; content: string | Buffer | Uint8Array }>();

        for (const file of files) {
            // Handle string vs binary content for hashing
            const contentBuffer = typeof file.content === 'string'
                ? Buffer.from(file.content, 'utf-8')
                : Buffer.from(file.content);

            const hash = createHash('sha256').update(contentBuffer).digest('hex');
            const filePath = file.path.startsWith('/') ? file.path : `/${file.path}`;
            manifest[filePath] = hash;
            filesByHash.set(hash, file);
        }

        // Create FormData with manifest + file blobs
        const formData = new FormData();
        formData.append('manifest', JSON.stringify(manifest));

        for (const [hash, file] of filesByHash) {
            // Create Blob from content (auto-handles Buffer/string)
            const content = typeof file.content === 'string' ? file.content : new Uint8Array(file.content);
            const blob = new Blob([content]);
            formData.append('files', blob, hash);
        }

        // POST to Direct Upload endpoint
        const response = await fetch(
            `${CF_API}/accounts/${config.accountId}/pages/projects/${projectName}/deployments`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiToken}`,
                    // Don't set Content-Type — fetch sets it with the boundary for FormData
                },
                body: formData,
            }
        );

        const data = await response.json();

        if (!data.success) {
            return { success: false, error: data.errors?.[0]?.message || 'Direct upload failed' };
        }

        return {
            success: true,
            deploymentId: data.result.id,
            url: data.result.url,
            status: data.result.latest_stage?.status || 'queued',
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Delete Pages project
 */
export async function deletePagesProject(
    projectName: string
): Promise<{ success: boolean; error?: string }> {
    const config = await getConfig();

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}`,
            { method: 'DELETE' }
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
export async function getZoneNameservers(domain: string): Promise<{
    zoneId: string;
    zoneName: string;
    nameservers: string[];
} | null> {
    const normalizedDomain = domain.trim().toLowerCase();

    try {
        const config = await getConfig();
        const params = new URLSearchParams({
            name: normalizedDomain,
            match: 'all',
            page: '1',
            per_page: '1',
            'account.id': config.accountId,
        });

        const response = await cfFetch(`/zones?${params.toString()}`);
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
 * Create a Cloudflare zone for a domain.
 * Returns existing zone details when the zone already exists under this account.
 */
export async function createZone(
    domain: string,
    options?: { jumpStart?: boolean },
): Promise<ZoneCreateResult> {
    const normalizedDomain = domain.trim().toLowerCase();

    try {
        const config = await getConfig();
        const response = await cfFetch('/zones', {
            method: 'POST',
            body: JSON.stringify({
                name: normalizedDomain,
                account: { id: config.accountId },
                type: 'full',
                jump_start: options?.jumpStart ?? false,
            }),
        });

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
            const existing = await getZoneNameservers(normalizedDomain);
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
            const resolved = await getZoneNameservers(normalizedDomain);
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
