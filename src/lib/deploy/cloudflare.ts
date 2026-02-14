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

function getConfig(): CloudflareConfig {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken || !accountId) {
        throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set');
    }

    return { apiToken, accountId };
}

async function cfFetch(
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const config = getConfig();

    return fetch(`${CF_API}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
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
    const config = getConfig();

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
    const config = getConfig();

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
    const config = getConfig();

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
    const config = getConfig();

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
    const config = getConfig();

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
    const config = getConfig();

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
