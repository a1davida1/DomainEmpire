/**
 * Deployment Processor - Handles the actual deployment workflow
 * 
 * Pipeline: Validate → Create Repo → Generate Files → Commit → Deploy → Custom Domain → DNS
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
import { updateNameservers } from './godaddy';
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

interface DeployContext {
    jobId: string;
    domainId: string;
    payload: DeployPayload;
    steps: DeployStep[];
    repoName: string;
    githubRepo?: string;
    cfProject?: string;
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
 * Mark a step as running and persist progress
 */
async function startStep(ctx: DeployContext, stepIndex: number) {
    ctx.steps[stepIndex].status = 'running';
    await updateJobProgress(ctx.jobId, ctx.steps);
}

/**
 * Mark a step as failed and persist progress
 */
async function failStep(ctx: DeployContext, stepIndex: number, detail: string) {
    ctx.steps[stepIndex].status = 'failed';
    ctx.steps[stepIndex].detail = detail;
    await updateJobProgress(ctx.jobId, ctx.steps);
}

/**
 * Mark a step as done
 */
function doneStep(ctx: DeployContext, stepIndex: number, detail: string) {
    ctx.steps[stepIndex].status = 'done';
    ctx.steps[stepIndex].detail = detail;
}

/**
 * Step 1: Create GitHub repository
 */
async function stepCreateRepo(ctx: DeployContext): Promise<void> {
    if (!ctx.payload.createRepo) {
        doneStep(ctx, 0, 'Skipped — repo already exists');
        return;
    }

    await startStep(ctx, 0);

    const repoResult = await createDomainRepo(
        ctx.payload.domain,
        `Static site for ${ctx.payload.domain}`
    );

    if (!repoResult.success) {
        await failStep(ctx, 0, repoResult.error || 'Unknown error');
        throw new Error(`Failed to create repo: ${repoResult.error}`);
    }

    ctx.githubRepo = repoResult.repoUrl;
    doneStep(ctx, 0, repoResult.repoUrl || 'Created');

    await db.update(domains).set({
        githubRepo: repoResult.repoUrl,
        updatedAt: new Date(),
    }).where(eq(domains.id, ctx.domainId));
}

/**
 * Step 2: Generate site files
 */
async function stepGenerateFiles(ctx: DeployContext): Promise<{ path: string; content: string }[]> {
    await startStep(ctx, 1);

    const files = await generateSiteFiles(ctx.domainId);

    if (files.length === 0) {
        await failStep(ctx, 1, 'No files generated');
        throw new Error('Site generator produced zero files');
    }

    doneStep(ctx, 1, `${files.length} files generated`);
    return files;
}

/**
 * Step 3: Commit files to repository
 */
async function stepCommitFiles(ctx: DeployContext, files: { path: string; content: string }[]): Promise<void> {
    await startStep(ctx, 2);

    const commitResult = await commitMultipleFiles(
        ctx.repoName,
        files,
        `Deploy site content — ${new Date().toISOString()}`,
        'main'
    );

    if (!commitResult.success) {
        await failStep(ctx, 2, commitResult.error || 'Unknown error');
        throw new Error(`Failed to commit files: ${commitResult.error}`);
    }

    doneStep(ctx, 2, commitResult.sha || 'Committed');
}

/**
 * Step 4: Deploy to Cloudflare Pages
 */
async function stepDeployCloudflare(ctx: DeployContext): Promise<void> {
    if (!ctx.payload.triggerBuild) {
        doneStep(ctx, 3, 'Skipped — build not requested');
        return;
    }

    await startStep(ctx, 3);

    const projectResult = await createPagesProject(ctx.repoName, ctx.repoName, 'main');

    if (!projectResult.success) {
        await failStep(ctx, 3, projectResult.error || 'Unknown error');
        throw new Error(`Failed to create CF project: ${projectResult.error}`);
    }

    ctx.cfProject = projectResult.projectName;

    await db.update(domains).set({
        cloudflareProject: projectResult.projectName,
        updatedAt: new Date(),
    }).where(eq(domains.id, ctx.domainId));

    try {
        await triggerDeployment(ctx.repoName, 'main');
        doneStep(ctx, 3, `Project: ${projectResult.projectName}`);
    } catch (err: any) {
        await failStep(ctx, 3, err instanceof Error ? err.message : String(err));
        throw new Error(`Failed to trigger deployment: ${err}`);
    }
}

/**
 * Step 5: Add custom domain to Cloudflare Pages
 */
async function stepAddCustomDomain(ctx: DeployContext): Promise<void> {
    if (!ctx.payload.addCustomDomain || !ctx.cfProject) {
        doneStep(ctx, 4, 'Skipped');
        return;
    }

    await startStep(ctx, 4);
    try {
        await addCustomDomain(ctx.cfProject, ctx.payload.domain);
        doneStep(ctx, 4, `Linked ${ctx.payload.domain}`);
    } catch (err: any) {
        await failStep(ctx, 4, `Failed to link ${ctx.payload.domain}: ${err instanceof Error ? err.message : String(err)}`);
        // We usually don't throw here if we want to continue, but step 4 failure might be critical.
        // However, the user prompt said "call failStep... so the step is marked failed instead of remaining running".
        // It didn't explicitly say to throw or return. But if I don't return, it proceeds.
        return;
    }
}

/**
 * Step 6: Update DNS via GoDaddy API
 */
async function stepUpdateDns(ctx: DeployContext): Promise<void> {
    if (!ctx.payload.addCustomDomain || !process.env.GODADDY_API_KEY || !process.env.CLOUDFLARE_NAMESERVERS) {
        doneStep(ctx, 5, 'Skipped (Missing config)');
        return;
    }

    await startStep(ctx, 5);

    try {
        const nameservers = process.env.CLOUDFLARE_NAMESERVERS.split(',').map(ns => ns.trim());
        await updateNameservers(ctx.payload.domain, nameservers);
        doneStep(ctx, 5, 'Nameservers updated');
    } catch (err) {
        // Don't fail the whole job if DNS update fails, but mark the step as failed
        await failStep(ctx, 5, err instanceof Error ? err.message : 'DNS update failed');
        console.error(`DNS update failed for ${ctx.payload.domain}:`, err);
    }
}

/**
 * Validate the job and its associated data before processing
 */
async function validateJob(jobId: string) {
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (jobs.length === 0) throw new Error(`Job ${jobId} not found`);

    const job = jobs[0];
    const payload = job.payload as DeployPayload;

    if (!payload?.domain) {
        throw new Error('Deploy payload missing required "domain" field');
    }

    if (!job.domainId) {
        throw new Error('Deploy job missing domainId reference');
    }

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

    const envErrors = validateDeployEnv();
    if (envErrors.length > 0) {
        throw new Error(`Deployment configuration missing: ${envErrors.join(', ')}`);
    }

    return { job, payload };
}

/**
 * Process a deployment job
 */
export async function processDeployJob(jobId: string): Promise<void> {
    const { job, payload } = await validateJob(jobId);

    // Mark as processing
    await db.update(contentQueue).set({
        status: 'processing',
        startedAt: new Date(),
    }).where(eq(contentQueue.id, jobId));

    const ctx: DeployContext = {
        jobId,
        domainId: job.domainId!,
        payload,
        repoName: payload.domain.replaceAll('.', '-'),
        steps: [
            { step: 'Create Repository', status: 'pending' },
            { step: 'Generate Files', status: 'pending' },
            { step: 'Commit to Repo', status: 'pending' },
            { step: 'Deploy to Cloudflare', status: 'pending' },
            { step: 'Add Custom Domain', status: 'pending' },
            { step: 'Update DNS', status: 'pending' },
        ],
    };

    try {
        await stepCreateRepo(ctx);
        const files = await stepGenerateFiles(ctx);
        await stepCommitFiles(ctx, files);
        await stepDeployCloudflare(ctx);
        await stepAddCustomDomain(ctx);
        await stepUpdateDns(ctx);

        // Mark complete
        await db.update(contentQueue).set({
            status: 'completed',
            completedAt: new Date(),
            result: {
                steps: ctx.steps,
                githubRepo: ctx.githubRepo,
                cfProject: ctx.cfProject,
                filesDeployed: files.length,
                completedAt: new Date().toISOString(),
            },
        }).where(eq(contentQueue.id, jobId));

        await db.update(domains).set({
            isDeployed: true,
            lastDeployedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(domains.id, ctx.domainId));

    } catch (error) {
        // Rollback domain state
        await db.update(contentQueue).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: (job.attempts || 0) + 1,
            result: { steps: ctx.steps, failedAt: new Date().toISOString() },
        }).where(eq(contentQueue.id, jobId));

        await db.update(domains).set({
            isDeployed: false,
            updatedAt: new Date(),
        }).where(eq(domains.id, ctx.domainId));

        throw error;
    }
}
