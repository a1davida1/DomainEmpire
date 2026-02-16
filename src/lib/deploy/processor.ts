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

import { db, domains, contentQueue, articles, pageDefinitions } from '@/lib/db';
import { eq, and, count } from 'drizzle-orm';
import { createDirectUploadProject, directUploadDeploy, addCustomDomain, getZoneNameservers, verifyDomainPointsToCloudflare, ensurePagesDnsRecord } from './cloudflare';
import {
    hasRegistrarNameserverCredentials,
    isAutomatedNameserverRegistrar,
    registrarCredentialHint,
    updateRegistrarNameservers,
} from './registrar';
import { generateSiteFiles } from './generator';
import {
    recordCloudflareHostShardOutcome,
    resolveCloudflareHostShardPlan,
    type CloudflareHostShard,
} from './host-sharding';
import { advanceDomainLifecycleForAcquisition } from '@/lib/domain/lifecycle-sync';

interface DeployPayload {
    domain: string;
    triggerBuild: boolean;
    addCustomDomain: boolean;
    cloudflareAccount?: string | null;
    deployTarget?: 'production' | 'staging';
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
    hostShardPlan: CloudflareHostShard[];
    hostShard: CloudflareHostShard;
    deployTarget: 'production' | 'staging';
    stagingUrl?: string;
}

/**
 * Validate deploy credentials required for Cloudflare operations
 */
function validateDeployCredentials(shards: CloudflareHostShard[]): string[] {
    const errors: string[] = [];

    const hasEnvToken = Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim());
    const hasShardToken = shards.some((shard) => Boolean(shard.cloudflare.apiToken?.trim()));
    if (!hasEnvToken && !hasShardToken) {
        errors.push('CLOUDFLARE_API_TOKEN is not set and no Cloudflare shard credential is configured');
    }

    return errors;
}

function isRetryableCloudflareError(message: string): boolean {
    const lowered = message.toLowerCase();
    return lowered.includes('429')
        || lowered.includes('rate limit')
        || lowered.includes('too many requests')
        || lowered.includes('please wait')
        || lowered.includes('timeout')
        || lowered.includes('timed out')
        || lowered.includes('temporarily unavailable')
        || lowered.includes('service unavailable')
        || lowered.includes('internal error')
        || lowered.includes('gateway');
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
    const deployErrors: string[] = [];

    for (const shard of ctx.hostShardPlan) {
        const projectResult = await createDirectUploadProject(ctx.projectName, shard.cloudflare);

        if (!projectResult.success) {
            const message = projectResult.error || 'Unknown Cloudflare project create error';
            deployErrors.push(`[${shard.shardKey}] project create failed: ${message}`);
            recordCloudflareHostShardOutcome(
                {
                    shardKey: shard.shardKey,
                    accountId: shard.cloudflare.accountId ?? null,
                    sourceConnectionId: shard.connectionId ?? null,
                },
                isRetryableCloudflareError(message) ? 'rate_limited' : 'failure',
            );

            if (isRetryableCloudflareError(message) && ctx.hostShardPlan.length > 1) {
                continue;
            }

            await failStep(ctx, 1, message);
            throw new Error(`Failed to create CF project: ${message}`);
        }

        ctx.cfProject = projectResult.projectName;
        ctx.hostShard = shard;

        await db.update(domains).set({
            cloudflareProject: projectResult.projectName,
            updatedAt: new Date(),
        }).where(eq(domains.id, ctx.domainId));

        const uploadResult = await directUploadDeploy(
            ctx.cfProject || ctx.projectName,
            files,
            shard.cloudflare,
            ctx.deployTarget === 'staging' ? { branch: 'staging' } : undefined,
        );

        if (!uploadResult.success) {
            const message = uploadResult.error || 'Cloudflare direct upload failed';
            deployErrors.push(`[${shard.shardKey}] upload failed: ${message}`);
            recordCloudflareHostShardOutcome(
                {
                    shardKey: shard.shardKey,
                    accountId: shard.cloudflare.accountId ?? null,
                    sourceConnectionId: shard.connectionId ?? null,
                },
                isRetryableCloudflareError(message) ? 'rate_limited' : 'failure',
            );

            if (isRetryableCloudflareError(message) && ctx.hostShardPlan.length > 1) {
                continue;
            }

            await failStep(ctx, 1, message);
            throw new Error(`Direct upload failed: ${message}`);
        }
        recordCloudflareHostShardOutcome({
            shardKey: shard.shardKey,
            accountId: shard.cloudflare.accountId ?? null,
            sourceConnectionId: shard.connectionId ?? null,
        }, 'success');

        if (ctx.deployTarget === 'staging' && uploadResult.url) {
            ctx.stagingUrl = uploadResult.url;
        }

        const failoverAttempts = Math.max(deployErrors.length, 0);
        const branchLabel = ctx.deployTarget === 'staging' ? ' [staging]' : '';
        await doneStep(
            ctx,
            1,
            `Deployed${branchLabel}: ${uploadResult.url || ctx.projectName} (host shard: ${shard.shardKey}${failoverAttempts > 0 ? `, failover retries: ${failoverAttempts}` : ''})`,
        );
        return;
    }

    const detail = deployErrors.length > 0
        ? deployErrors.join(' | ')
        : 'Direct upload failed across all configured host shards';
    await failStep(ctx, 1, detail);
    throw new Error(`Direct upload failed across all host shards: ${detail}`);
}

/**
 * Step 3: Add custom domain to Cloudflare Pages
 */
async function stepAddCustomDomain(ctx: DeployContext): Promise<boolean> {
    if (!ctx.payload.addCustomDomain || !ctx.cfProject) {
        await doneStep(ctx, 2, 'Skipped');
        return false;
    }

    await startStep(ctx, 2);
    try {
        const result = await addCustomDomain(
            ctx.cfProject,
            ctx.payload.domain,
            ctx.hostShard.cloudflare,
        );
        if (!result.success) {
            recordCloudflareHostShardOutcome(
                {
                    shardKey: ctx.hostShard.shardKey,
                    accountId: ctx.hostShard.cloudflare.accountId ?? null,
                    sourceConnectionId: ctx.hostShard.connectionId ?? null,
                },
                isRetryableCloudflareError(result.error || '') ? 'rate_limited' : 'failure',
            );
            throw new Error(result.error || 'Unknown Cloudflare domain link error');
        }
        recordCloudflareHostShardOutcome({
            shardKey: ctx.hostShard.shardKey,
            accountId: ctx.hostShard.cloudflare.accountId ?? null,
            sourceConnectionId: ctx.hostShard.connectionId ?? null,
        }, 'success');
        await doneStep(ctx, 2, `Linked ${ctx.payload.domain}`);
        return true;
    } catch (err: unknown) {
        await failStep(ctx, 2, `Failed to link ${ctx.payload.domain}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
    }
}

/**
 * Step 4: Configure CNAME DNS record in Cloudflare zone → Pages project
 */
async function stepConfigureDnsRecord(ctx: DeployContext, customDomainLinked: boolean): Promise<void> {
    if (!ctx.payload.addCustomDomain || !customDomainLinked || !ctx.cfProject) {
        await doneStep(ctx, 3, 'Skipped (Custom domain not linked)');
        return;
    }

    await startStep(ctx, 3);

    try {
        // Resolve the Pages subdomain from the project name
        const pagesTarget = `${ctx.cfProject}.pages.dev`;
        const result = await ensurePagesDnsRecord(
            ctx.payload.domain,
            pagesTarget,
            ctx.hostShard.cloudflare,
        );

        if (!result.success) {
            await failStep(ctx, 3, result.error || 'Failed to configure DNS record');
            throw new Error(result.error || 'Failed to configure DNS record for Pages project');
        }

        const actionLabel = result.action === 'created' ? 'Created'
            : result.action === 'updated' ? 'Updated'
            : 'Already configured';
        await doneStep(ctx, 3, `${actionLabel} CNAME → ${pagesTarget}`);
    } catch (err: unknown) {
        if ((err as Error).message?.includes('Failed to configure DNS record')) {
            throw err;
        }
        await failStep(ctx, 3, `DNS record configuration failed: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
    }
}

/**
 * Step 5: Update DNS via registrar API (GoDaddy/Namecheap)
 */
type DnsUpdateResult = 'updated' | 'skipped' | 'failed';

async function stepUpdateDns(ctx: DeployContext, customDomainLinked: boolean): Promise<DnsUpdateResult> {
    if (!ctx.payload.addCustomDomain || !customDomainLinked) {
        await doneStep(ctx, 4, 'Skipped (Custom domain not linked)');
        return 'skipped';
    }

    await startStep(ctx, 4);

    try {
        const [domainRow] = await db.select({ registrar: domains.registrar })
            .from(domains)
            .where(eq(domains.id, ctx.domainId))
            .limit(1);

        if (!domainRow || !isAutomatedNameserverRegistrar(domainRow.registrar)) {
            await doneStep(ctx, 4, 'Skipped (Registrar unsupported for automated DNS)');
            return 'skipped';
        }

        if (!hasRegistrarNameserverCredentials(domainRow.registrar)) {
            await doneStep(ctx, 4, `Skipped (Missing registrar credentials: ${registrarCredentialHint(domainRow.registrar)})`);
            return 'skipped';
        }

        let zone = await getZoneNameservers(ctx.payload.domain, ctx.hostShard.cloudflare);
        let zoneShardKey = ctx.hostShard.shardKey;

        if (!zone) {
            for (const shard of ctx.hostShardPlan) {
                if (shard.shardKey === ctx.hostShard.shardKey) continue;
                const resolved = await getZoneNameservers(ctx.payload.domain, shard.cloudflare);
                if (!resolved) continue;
                zone = resolved;
                zoneShardKey = shard.shardKey;
                break;
            }
        }

        if (!zone) {
            await failStep(ctx, 4, `Unable to resolve Cloudflare nameservers for ${ctx.payload.domain}`);
            return 'failed';
        }

        await updateRegistrarNameservers(domainRow.registrar, ctx.payload.domain, zone.nameservers);
        await doneStep(ctx, 4, `Nameservers updated (${zone.nameservers.join(', ')}) via shard ${zoneShardKey}`);
        return 'updated';
    } catch (err) {
        await failStep(ctx, 4, err instanceof Error ? err.message : 'DNS update failed');
        console.error(`DNS update failed for ${ctx.payload.domain}:`, err);
        return 'failed';
    }
}

/**
 * Step 6: Verify that live DNS NS records point to Cloudflare.
 * This is the ground-truth check — if NS records don't resolve to CF,
 * browsers will not reach the Cloudflare Pages deployment.
 */
async function stepVerifyDns(ctx: DeployContext): Promise<boolean> {
    await startStep(ctx, 5);

    try {
        const result = await verifyDomainPointsToCloudflare(ctx.payload.domain);

        if (result.verified) {
            await doneStep(ctx, 5, result.detail);
            return true;
        }

        // Not a hard failure — files are deployed, but domain isn't reachable yet
        await doneStep(ctx, 5, `DNS not pointing to Cloudflare: ${result.detail}. Domain will not serve content until NS records are updated.`);
        return false;
    } catch (err) {
        await doneStep(ctx, 5, `DNS verification inconclusive: ${err instanceof Error ? err.message : String(err)}`);
        return false;
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

    // v2 domains may have page_definitions instead of (or in addition to) articles
    const pageDefCount = await db
        .select({ count: count() })
        .from(pageDefinitions)
        .where(and(eq(pageDefinitions.domainId, job.domainId), eq(pageDefinitions.isPublished, true)));

    if ((articleCount[0]?.count || 0) === 0 && (pageDefCount[0]?.count || 0) === 0) {
        throw new Error(`Domain ${payload.domain} has no articles or published page definitions to deploy`);
    }

    return { job, payload, domain: domainRecord[0] };
}

/**
 * Process a deployment job
 */
export async function processDeployJob(jobId: string): Promise<void> {
    const { job, payload, domain } = await validateJob(jobId);
    const hostShardPlan = await resolveCloudflareHostShardPlan({
        domain: payload.domain,
        cloudflareAccount: payload.cloudflareAccount ?? domain.cloudflareAccount ?? null,
        domainNiche: domain.niche ?? null,
        maxFallbacks: 3,
    });
    const hostShard = hostShardPlan.primary;

    const credentialErrors = validateDeployCredentials(hostShardPlan.all);
    if (credentialErrors.length > 0) {
        throw new Error(`Deployment configuration missing: ${credentialErrors.join(', ')}`);
    }

    // Mark as processing
    await db.update(contentQueue).set({
        status: 'processing',
        startedAt: new Date(),
    }).where(eq(contentQueue.id, jobId));

    const deployTarget = payload.deployTarget || 'production';
    const isStaging = deployTarget === 'staging';

    const steps: DeployStep[] = isStaging
        ? [
            { step: 'Generate Files', status: 'pending' },
            { step: 'Upload to Cloudflare (staging)', status: 'pending' },
        ]
        : [
            { step: 'Generate Files', status: 'pending' },
            { step: 'Upload to Cloudflare', status: 'pending' },
            { step: 'Add Custom Domain', status: 'pending' },
            { step: 'Configure DNS Record', status: 'pending' },
            { step: 'Update Nameservers', status: 'pending' },
            { step: 'Verify DNS', status: 'pending' },
        ];

    const ctx: DeployContext = {
        jobId,
        domainId: job.domainId!,
        payload,
        projectName: sanitizeProjectName(payload.domain),
        hostShardPlan: hostShardPlan.all,
        hostShard,
        deployTarget,
        steps,
    };

    try {
        const files = await stepGenerateFiles(ctx);
        await stepDirectUpload(ctx, files);

        // Staging deploys: skip custom domain, DNS, and NS steps
        if (isStaging) {
            await db.update(contentQueue).set({
                status: 'completed',
                completedAt: new Date(),
                result: {
                    steps: ctx.steps,
                    cfProject: ctx.cfProject,
                    filesDeployed: files.length,
                    deployTarget: 'staging',
                    stagingUrl: ctx.stagingUrl || null,
                    completedAt: new Date().toISOString(),
                },
            }).where(eq(contentQueue.id, jobId));
            return;
        }

        const customDomainLinked = await stepAddCustomDomain(ctx);
        await stepConfigureDnsRecord(ctx, customDomainLinked);
        const dnsUpdateResult = await stepUpdateDns(ctx, customDomainLinked);
        const dnsVerified = await stepVerifyDns(ctx);

        // Determine deployed status:
        // - Step 4 (Configure DNS Record) creates the CNAME in the CF zone → Pages project.
        // - Step 5 (Update Nameservers) pushed NS to registrar → trust it, propagation will complete.
        // - Step 6 (Verify DNS) is the live check — used when step 5 was skipped/failed.
        const shouldMarkDeployed = dnsUpdateResult === 'updated' || dnsVerified;

        // Mark complete
        await db.update(contentQueue).set({
            status: 'completed',
            completedAt: new Date(),
            result: {
                steps: ctx.steps,
                cfProject: ctx.cfProject,
                filesDeployed: files.length,
                dnsVerified,
                dnsUpdateResult,
                completedAt: new Date().toISOString(),
            },
        }).where(eq(contentQueue.id, jobId));

        await db.update(domains).set({
            isDeployed: shouldMarkDeployed,
            lastDeployedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(domains.id, ctx.domainId));

        try {
            await advanceDomainLifecycleForAcquisition({
                domainId: ctx.domainId,
                targetState: 'build',
                actorId: null,
                actorRole: 'admin',
                reason: 'Deployment completed successfully',
                metadata: {
                    source: 'deploy_processor',
                    jobId,
                    cloudflareProject: ctx.cfProject ?? null,
                },
            });
        } catch (lifecycleError) {
            console.error('Failed to auto-advance lifecycle to build after deploy:', {
                domainId: ctx.domainId,
                jobId,
                error: lifecycleError instanceof Error ? lifecycleError.message : String(lifecycleError),
            });
        }

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

/**
 * Process a staging-only deploy. Generates files and uploads to a 'staging' branch
 * on CF Pages, returning a preview URL without touching DNS or custom domains.
 *
 * This can be called directly (not from the content queue) for on-demand staging previews.
 */
export async function processStagingDeploy(domainId: string): Promise<{
    success: boolean;
    stagingUrl?: string;
    cfProject?: string;
    fileCount: number;
    error?: string;
}> {
    const domainRow = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (domainRow.length === 0) {
        return { success: false, fileCount: 0, error: 'Domain not found' };
    }
    const domain = domainRow[0];

    const hostShardPlan = await resolveCloudflareHostShardPlan({
        domain: domain.domain,
        cloudflareAccount: domain.cloudflareAccount ?? null,
        domainNiche: domain.niche ?? null,
        maxFallbacks: 1,
    });

    const credentialErrors = validateDeployCredentials(hostShardPlan.all);
    if (credentialErrors.length > 0) {
        return { success: false, fileCount: 0, error: `Missing credentials: ${credentialErrors.join(', ')}` };
    }

    try {
        const files = await generateSiteFiles(domainId);
        if (files.length === 0) {
            return { success: false, fileCount: 0, error: 'Generator produced zero files' };
        }

        const projectName = sanitizeProjectName(domain.domain);
        const shard = hostShardPlan.primary;

        const projectResult = await createDirectUploadProject(projectName, shard.cloudflare);
        if (!projectResult.success) {
            return { success: false, fileCount: files.length, error: projectResult.error || 'Project create failed' };
        }

        const uploadResult = await directUploadDeploy(
            projectResult.projectName || projectName,
            files,
            shard.cloudflare,
            { branch: 'staging' },
        );

        if (!uploadResult.success) {
            return { success: false, fileCount: files.length, error: uploadResult.error || 'Upload failed' };
        }

        return {
            success: true,
            stagingUrl: uploadResult.url || undefined,
            cfProject: projectResult.projectName || projectName,
            fileCount: files.length,
        };
    } catch (err) {
        return {
            success: false,
            fileCount: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
