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
 * Create a Cloudflare Pages project connected to GitHub
 */
export async function createPagesProject(
    projectName: string,
    githubRepo: string,
    productionBranch: string = 'main'
): Promise<ProjectCreateResult> {
    const config = getConfig();

    try {
        // Note: This requires GitHub integration to be set up in Cloudflare dashboard first
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects`,
            {
                method: 'POST',
                body: JSON.stringify({
                    name: projectName,
                    production_branch: productionBranch,
                    build_config: {
                        build_command: 'npm run build',
                        destination_dir: 'dist',
                        root_dir: '',
                    },
                    source: {
                        type: 'github',
                        config: {
                            owner: process.env.GITHUB_OWNER,
                            repo_name: githubRepo,
                            production_branch: productionBranch,
                            pr_comments_enabled: false,
                            deployments_enabled: true,
                        },
                    },
                }),
            }
        );

        const data = await response.json();

        if (!data.success) {
            // Check if project already exists
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
 * Trigger a deployment
 */
export async function triggerDeployment(
    projectName: string,
    branch: string = 'main'
): Promise<DeploymentResult> {
    const config = getConfig();

    try {
        const response = await cfFetch(
            `/accounts/${config.accountId}/pages/projects/${projectName}/deployments`,
            {
                method: 'POST',
                body: JSON.stringify({
                    branch,
                }),
            }
        );

        const data = await response.json();

        if (!data.success) {
            return { success: false, error: data.errors?.[0]?.message || 'Failed to trigger deployment' };
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
