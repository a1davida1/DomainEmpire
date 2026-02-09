/**
 * Deployment Processor - Handles the actual deployment workflow
 * 
 * Pipeline: Validate → Create Repo → Generate Files → Commit → Deploy → Custom Domain
 * 
 * Features:
 * - Pre-flight validation (env vars, domain data)
 * - Step-by-step progress tracking in job result
 * - Rollback on failure (mark domain as not deployed)
 * - Timeout-safe: each step is idempotent where possible
 */

import { db, domains, contentQueue, articles } from '@/lib/db';
import { eq, count } from 'drizzle-orm';
import { createDomainRepo, commitMultipleFiles } from './github';
import { createPagesProject, triggerDeployment, addCustomDomain } from './cloudflare';
import { generateSiteFiles } from './generator';

interface DeployPayload {
    domain: string;
    createRepo: boolean;
    triggerBuild: boolean;
    addCustomDomain: boolean;
}

interface DeployStep {
    step: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    detail?: string;
}

/**
 * Validate environment variables required for deployment
 */
function validateDeployEnv(): string[] {
    const errors: string[] = [];

    if (!process.env.GITHUB_TOKEN) errors.push('GITHUB_TOKEN is not set');
    if (!process.env.GITHUB_OWNER) errors.push('GITHUB_OWNER is not set');
    if (!process.env.CLOUDFLARE_API_TOKEN) errors.push('CLOUDFLARE_API_TOKEN is not set');
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) errors.push('CLOUDFLARE_ACCOUNT_ID is not set');

    return errors;
}

/**
 * Update job progress with step details
 */
async function updateJobProgress(jobId: string, steps: DeployStep[]) {
    await db.update(contentQueue).set({
        result: { steps, lastUpdated: new Date().toISOString() },
    }).where(eq(contentQueue.id, jobId));
}

/**
 * Process a deployment job
 */
export async function processDeployJob(jobId: string): Promise<void> {
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (jobs.length === 0) throw new Error(`Job ${jobId} not found`);

    const job = jobs[0];
    const payload = job.payload as DeployPayload;

    // Pre-flight checks
    if (!payload?.domain) {
        throw new Error('Deploy payload missing required "domain" field');
    }

    if (!job.domainId) {
        throw new Error('Deploy job missing domainId reference');
    }

    // Validate the domain exists and has content
    const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId)).limit(1);
    if (domainRecord.length === 0) {
        throw new Error(`Domain ${job.domainId} not found in database`);
    }

    const articleCount = await db
        .select({ count: count() })
        .from(articles)
        .where(eq(articles.domainId, job.domainId));

    if ((articleCount[0]?.count || 0) === 0) {
        throw new Error(`Domain ${payload.domain} has no articles to deploy`);
    }

    // Check env vars
    const envErrors = validateDeployEnv();
    if (envErrors.length > 0) {
        throw new Error(`Deployment configuration missing: ${envErrors.join(', ')}`);
    }

    // Mark as processing
    await db.update(contentQueue).set({
        status: 'processing',
        startedAt: new Date(),
    }).where(eq(contentQueue.id, jobId));

    const steps: DeployStep[] = [
        { step: 'Create Repository', status: 'pending' },
        { step: 'Generate Files', status: 'pending' },
        { step: 'Commit to Repo', status: 'pending' },
        { step: 'Deploy to Cloudflare', status: 'pending' },
        { step: 'Add Custom Domain', status: 'pending' },
    ];

    try {
        const repoName = payload.domain.replaceAll(/\./g, '-');
        let githubRepo: string | undefined;
        let cfProject: string | undefined;

        // Step 1: Create GitHub repo if needed
        if (payload.createRepo) {
            steps[0].status = 'running';
            await updateJobProgress(jobId, steps);

            const repoResult = await createDomainRepo(
                payload.domain,
                `Static site for ${payload.domain}`
            );

            if (!repoResult.success) {
                steps[0].status = 'failed';
                steps[0].detail = repoResult.error;
                await updateJobProgress(jobId, steps);
                throw new Error(`Failed to create repo: ${repoResult.error}`);
            }

            githubRepo = repoResult.repoUrl;
            steps[0].status = 'done';
            steps[0].detail = repoResult.repoUrl;

            await db.update(domains).set({
                githubRepo: repoResult.repoUrl,
                updatedAt: new Date(),
            }).where(eq(domains.id, job.domainId));
        } else {
            steps[0].status = 'done';
            steps[0].detail = 'Skipped — repo already exists';
        }

        // Step 2: Generate site files
        steps[1].status = 'running';
        await updateJobProgress(jobId, steps);

        const files = await generateSiteFiles(job.domainId);

        if (files.length === 0) {
            steps[1].status = 'failed';
            steps[1].detail = 'No files generated';
            await updateJobProgress(jobId, steps);
            throw new Error('Site generator produced zero files');
        }

        steps[1].status = 'done';
        steps[1].detail = `${files.length} files generated`;

        // Step 3: Commit files to repo
        steps[2].status = 'running';
        await updateJobProgress(jobId, steps);

        const commitResult = await commitMultipleFiles(
            repoName,
            files,
            `Deploy site content — ${new Date().toISOString()}`,
            'main'
        );

        if (!commitResult.success) {
            steps[2].status = 'failed';
            steps[2].detail = commitResult.error;
            await updateJobProgress(jobId, steps);
            throw new Error(`Failed to commit files: ${commitResult.error}`);
        }

        steps[2].status = 'done';
        steps[2].detail = commitResult.sha;

        // Step 4: Create/update Cloudflare Pages project
        if (payload.triggerBuild) {
            steps[3].status = 'running';
            await updateJobProgress(jobId, steps);

            const projectName = repoName;
            const projectResult = await createPagesProject(projectName, repoName, 'main');

            if (!projectResult.success) {
                steps[3].status = 'failed';
                steps[3].detail = projectResult.error;
                await updateJobProgress(jobId, steps);
                throw new Error(`Failed to create CF project: ${projectResult.error}`);
            }

            cfProject = projectResult.projectName;

            await db.update(domains).set({
                cloudflareProject: projectResult.projectName,
                updatedAt: new Date(),
            }).where(eq(domains.id, job.domainId));

            await triggerDeployment(projectName, 'main');
            steps[3].status = 'done';
            steps[3].detail = `Project: ${projectResult.projectName}`;
        } else {
            steps[3].status = 'done';
            steps[3].detail = 'Skipped — build not requested';
        }

        // Step 5: Add custom domain if requested
        if (payload.addCustomDomain && cfProject) {
            steps[4].status = 'running';
            await updateJobProgress(jobId, steps);

            await addCustomDomain(cfProject, payload.domain);
            steps[4].status = 'done';
            steps[4].detail = `Linked ${payload.domain}`;
        } else {
            steps[4].status = 'done';
            steps[4].detail = 'Skipped';
        }

        // Mark complete
        await db.update(contentQueue).set({
            status: 'completed',
            completedAt: new Date(),
            result: {
                steps,
                githubRepo,
                cfProject,
                filesDeployed: files.length,
                completedAt: new Date().toISOString(),
            },
        }).where(eq(contentQueue.id, jobId));

        await db.update(domains).set({
            isDeployed: true,
            lastDeployedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(domains.id, job.domainId));

    } catch (error) {
        // Rollback domain state
        await db.update(contentQueue).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: (job.attempts || 0) + 1,
            result: { steps, failedAt: new Date().toISOString() },
        }).where(eq(contentQueue.id, jobId));

        await db.update(domains).set({
            isDeployed: false,
            updatedAt: new Date(),
        }).where(eq(domains.id, job.domainId));

        throw error;
    }
}
