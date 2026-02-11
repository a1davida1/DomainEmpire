/**
 * GitHub Integration Client
 * Creates repos, pushes content, manages deployments
 */

const GITHUB_API = 'https://api.github.com';

interface GitHubConfig {
    token: string;
    owner: string;
    templateRepo?: string;
}

interface RepoCreateResult {
    success: boolean;
    repoUrl?: string;
    cloneUrl?: string;
    error?: string;
}

interface FileCommitResult {
    success: boolean;
    sha?: string;
    error?: string;
}

function getConfig(): GitHubConfig {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;

    if (!token || !owner) {
        throw new Error('GITHUB_TOKEN and GITHUB_OWNER must be set');
    }

    return {
        token,
        owner,
        templateRepo: process.env.GITHUB_TEMPLATE_REPO,
    };
}

async function githubFetch(
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const config = getConfig();

    const response = await fetch(`${GITHUB_API}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${config.token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    return response;
}

/**
 * Create a new repository for a domain
 */
export async function createDomainRepo(
    domainName: string,
    description: string
): Promise<RepoCreateResult> {
    const config = getConfig();
    const repoName = domainName.replaceAll(/\./g, '-');

    try {
        // Check if we should use a template
        if (config.templateRepo) {
            // Create from template
            const response = await githubFetch(
                `/repos/${config.owner}/${config.templateRepo}/generate`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        owner: config.owner,
                        name: repoName,
                        description,
                        private: true,
                        include_all_branches: false,
                    }),
                }
            );

            if (!response.ok) {
                const error = await response.json();
                return { success: false, error: error.message || 'Failed to create from template' };
            }

            const data = await response.json();
            return {
                success: true,
                repoUrl: data.html_url,
                cloneUrl: data.clone_url,
            };
        }

        // Create empty repo
        const response = await githubFetch('/user/repos', {
            method: 'POST',
            body: JSON.stringify({
                name: repoName,
                description,
                private: true,
                auto_init: true,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            if (response.status === 422 && error.errors?.[0]?.message?.includes('already exists')) {
                // Repo already exists, get its info
                const existingResponse = await githubFetch(`/repos/${config.owner}/${repoName}`);
                if (existingResponse.ok) {
                    const data = await existingResponse.json();
                    return {
                        success: true,
                        repoUrl: data.html_url,
                        cloneUrl: data.clone_url,
                    };
                }
            }
            return { success: false, error: error.message || 'Failed to create repo' };
        }

        const data = await response.json();
        return {
            success: true,
            repoUrl: data.html_url,
            cloneUrl: data.clone_url,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Commit a file to a repository
 */
export async function commitFile(
    repoName: string,
    filePath: string,
    content: string,
    message: string,
    branch: string = 'main'
): Promise<FileCommitResult> {
    const config = getConfig();
    const contentBase64 = Buffer.from(content).toString('base64');

    try {
        // Get current file SHA if it exists (needed for updates)
        let existingSha: string | undefined;
        const getResponse = await githubFetch(
            `/repos/${config.owner}/${repoName}/contents/${filePath}?ref=${branch}`
        );

        if (getResponse.ok) {
            const fileData = await getResponse.json();
            existingSha = fileData.sha;
        }

        // Create or update file
        const response = await githubFetch(
            `/repos/${config.owner}/${repoName}/contents/${filePath}`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    message,
                    content: contentBase64,
                    branch,
                    sha: existingSha,
                }),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return { success: false, error: error.message || 'Failed to commit file' };
        }

        const data = await response.json();
        return {
            success: true,
            sha: data.content.sha,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Commit multiple files in a single commit
 */
export async function commitMultipleFiles(
    repoName: string,
    files: Array<{ path: string; content: string }>,
    message: string,
    branch: string = 'main'
): Promise<FileCommitResult> {
    const config = getConfig();

    try {
        // Get the current commit SHA
        const refResponse = await githubFetch(
            `/repos/${config.owner}/${repoName}/git/refs/heads/${branch}`
        );
        if (!refResponse.ok) {
            return { success: false, error: 'Failed to get branch ref' };
        }
        const refData = await refResponse.json();
        const currentCommitSha = refData.object.sha;

        // Get the current tree
        const commitResponse = await githubFetch(
            `/repos/${config.owner}/${repoName}/git/commits/${currentCommitSha}`
        );
        if (!commitResponse.ok) {
            return { success: false, error: 'Failed to get commit' };
        }
        const commitData = await commitResponse.json();
        const baseTreeSha = commitData.tree.sha;

        // Create blobs for each file in parallel
        const blobResults = await Promise.all(
            files.map(async (file) => {
                const blobResponse = await githubFetch(
                    `/repos/${config.owner}/${repoName}/git/blobs`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            content: file.content,
                            encoding: 'utf-8',
                        }),
                    }
                );
                if (!blobResponse.ok) {
                    throw new Error(`Failed to create blob for ${file.path}`);
                }
                const blobData = await blobResponse.json();
                return {
                    path: file.path,
                    mode: '100644' as const,
                    type: 'blob' as const,
                    sha: blobData.sha,
                };
            })
        );
        const treeItems = blobResults;

        // Create new tree
        const treeResponse = await githubFetch(
            `/repos/${config.owner}/${repoName}/git/trees`,
            {
                method: 'POST',
                body: JSON.stringify({
                    base_tree: baseTreeSha,
                    tree: treeItems,
                }),
            }
        );
        if (!treeResponse.ok) {
            return { success: false, error: 'Failed to create tree' };
        }
        const treeData = await treeResponse.json();

        // Create commit
        const newCommitResponse = await githubFetch(
            `/repos/${config.owner}/${repoName}/git/commits`,
            {
                method: 'POST',
                body: JSON.stringify({
                    message,
                    tree: treeData.sha,
                    parents: [currentCommitSha],
                }),
            }
        );
        if (!newCommitResponse.ok) {
            return { success: false, error: 'Failed to create commit' };
        }
        const newCommitData = await newCommitResponse.json();

        // Update ref
        const updateRefResponse = await githubFetch(
            `/repos/${config.owner}/${repoName}/git/refs/heads/${branch}`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    sha: newCommitData.sha,
                }),
            }
        );
        if (!updateRefResponse.ok) {
            return { success: false, error: 'Failed to update ref' };
        }

        return { success: true, sha: newCommitData.sha };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Get repository info
 */
export async function getRepoInfo(repoName: string): Promise<{
    exists: boolean;
    url?: string;
    defaultBranch?: string;
}> {
    const config = getConfig();

    try {
        const response = await githubFetch(`/repos/${config.owner}/${repoName}`);

        if (!response.ok) {
            return { exists: false };
        }

        const data = await response.json();
        return {
            exists: true,
            url: data.html_url,
            defaultBranch: data.default_branch,
        };
    } catch {
        return { exists: false };
    }
}

/**
 * Delete a repository
 */
export async function deleteRepo(repoName: string): Promise<{ success: boolean; error?: string }> {
    const config = getConfig();

    try {
        const response = await githubFetch(`/repos/${config.owner}/${repoName}`, {
            method: 'DELETE',
        });

        if (!response.ok && response.status !== 204) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
