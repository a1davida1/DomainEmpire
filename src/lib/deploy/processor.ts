/**
 * Deployment Processor - Handles the actual deployment workflow
 *
 * Pipeline: Validate → Generate Files → Direct Upload to Cloudflare → Custom Domain → DNS
 *
 * Uses Cloudflare Pages Direct Upload — no GitHub dependency.
 *
 * Features:
 * - Pre-flight validation (env vars, domain data)
 * - Step-by-step progress tracking in job result
 * - Rollback on failure (mark domain as not deployed)
 */

import { db, domains, contentQueue, articles } from '@/lib/db';
import { eq, count } from 'drizzle-orm';
import { createDirectUploadProject, directUploadDeploy, addCustomDomain } from './cloudflare';
import { updateNameservers } from './godaddy';
import { generateSiteFiles } from './generator';

interface DeployPayload {
    domain: string;
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
    projectName: string;
    cfProject?: string;
}

/**
 * Validate environment variables required for deployment
 */
function validateDeployEnv(): string[] {
    const errors: string[] = [];

    if (!process.env.CLOUDFLARE_API_TOKEN) errors.push('CLOUDFLARE_API_TOKEN is not set');
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) errors.push('CLOUDFLARE_ACCOUNT_ID is not set');

    return errors;
}

/**
 * Sanitize project name for Cloudflare Pages
 * Rules: lowercase, max 58 chars, alphanumeric & hyphens only, no start/end hyphens
 */
function sanitizeProjectName(domain: string): string {
    const sanitized = domain.toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    // Truncate to 50 chars to leave room for sufixes if needed
    return sanitized.slice(0, 50);
}

/**
 * Update job progress with step details
 */
async function updateJobProgress(jobId: string, steps: DeployStep[]) {
    await db.update(contentQueue).set({
        result: { steps, lastUpdated: new Date().toISOString() },
    }).where(eq(contentQueue.id, jobId));
}

async function startStep(ctx: DeployContext, stepIndex: number) {
    ctx.steps[stepIndex].status = 'running';
    await updateJobProgress(ctx.jobId, ctx.steps);
}

async function failStep(ctx: DeployContext, stepIndex: number, detail: string) {
    ctx.steps[stepIndex].status = 'failed';
    ctx.steps[stepIndex].detail = detail;
    await updateJobProgress(ctx.jobId, ctx.steps);
}

async function doneStep(ctx: DeployContext, stepIndex: number, detail: string) {
    ctx.steps[stepIndex].status = 'done';
    ctx.steps[stepIndex].detail = detail;
    await updateJobProgress(ctx.jobId, ctx.steps);
}

/**
 * Step 1: Generate site files (plain HTML)
 */
async function stepGenerateFiles(ctx: DeployContext): Promise<{ path: string; content: string }[]> {
    await startStep(ctx, 0);

    const files = await generateSiteFiles(ctx.domainId);

    if (files.length === 0) {
        await failStep(ctx, 0, 'No files generated');
        throw new Error('Site generator produced zero files');
    }

    await doneStep(ctx, 0, `${files.length} files generated`);
    return files;
}

/**
 * Step 2: Upload to Cloudflare Pages via Direct Upload
 */
async function stepDirectUpload(ctx: DeployContext, files: { path: string; content: string }[]): Promise<void> {
    if (!ctx.payload.triggerBuild) {
        await doneStep(ctx, 1, 'Skipped — deploy not requested');
        return;
    }

    await startStep(ctx, 1);

    // Create or reuse project
    const projectResult = await createDirectUploadProject(ctx.projectName);

    if (!projectResult.success) {
        await failStep(ctx, 1, projectResult.error || 'Unknown error');
        throw new Error(`Failed to create CF project: ${projectResult.error}`);
    }

    ctx.cfProject = projectResult.projectName;

    await db.update(domains).set({
        cloudflareProject: projectResult.projectName,
        updatedAt: new Date(),
    }).where(eq(domains.id, ctx.domainId));

    // Direct upload files - USE THE RETURNED PROJECT NAME (which might have a unique suffix)
    const uploadResult = await directUploadDeploy(ctx.cfProject || ctx.projectName, files);

    if (!uploadResult.success) {
        await failStep(ctx, 1, uploadResult.error || 'Upload failed');
        throw new Error(`Direct upload failed: ${uploadResult.error}`);
    }

    await doneStep(ctx, 1, `Deployed: ${uploadResult.url || ctx.projectName}`);
}

/**
 * Step 3: Add custom domain to Cloudflare Pages
 */
async function stepAddCustomDomain(ctx: DeployContext): Promise<void> {
    if (!ctx.payload.addCustomDomain || !ctx.cfProject) {
        await doneStep(ctx, 2, 'Skipped');
        return;
    }

    await startStep(ctx, 2);
    try {
        await addCustomDomain(ctx.cfProject, ctx.payload.domain);
        await doneStep(ctx, 2, `Linked ${ctx.payload.domain}`);
    } catch (err: unknown) {
        await failStep(ctx, 2, `Failed to link ${ctx.payload.domain}: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }
}

/**
 * Step 4: Update DNS via GoDaddy API
 */
async function stepUpdateDns(ctx: DeployContext): Promise<void> {
    if (!ctx.payload.addCustomDomain || !process.env.GODADDY_API_KEY || !process.env.CLOUDFLARE_NAMESERVERS) {
        await doneStep(ctx, 3, 'Skipped (Missing config)');
        return;
    }

    await startStep(ctx, 3);

    try {
        const nameservers = process.env.CLOUDFLARE_NAMESERVERS.split(',').map(ns => ns.trim());
        await updateNameservers(ctx.payload.domain, nameservers);
        await doneStep(ctx, 3, 'Nameservers updated');
    } catch (err) {
        await failStep(ctx, 3, err instanceof Error ? err.message : 'DNS update failed');
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
        projectName: sanitizeProjectName(payload.domain),
        steps: [
            { step: 'Generate Files', status: 'pending' },
            { step: 'Upload to Cloudflare', status: 'pending' },
            { step: 'Add Custom Domain', status: 'pending' },
            { step: 'Update DNS', status: 'pending' },
        ],
    };

    try {
        const files = await stepGenerateFiles(ctx);
        await stepDirectUpload(ctx, files);
        await stepAddCustomDomain(ctx);
        await stepUpdateDns(ctx);

        // Mark complete
        await db.update(contentQueue).set({
            status: 'completed',
            completedAt: new Date(),
            result: {
                steps: ctx.steps,
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
