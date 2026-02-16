import { getZoneNameservers } from './cloudflare';
import { resolveCloudflareHostShardPlan } from './host-sharding';
import {
    hasRegistrarNameserverCredentials,
    isAutomatedNameserverRegistrar,
    registrarCredentialHint,
} from './registrar';

export type DeployPreflightIssueSeverity = 'blocking' | 'warning';

export type DeployPreflightIssue = {
    code: string;
    message: string;
    severity: DeployPreflightIssueSeverity;
};

export type DeployPreflightResult = {
    ok: boolean;
    issues: DeployPreflightIssue[];
    zoneNameservers: string[] | null;
};

type DeployPreflightInput = {
    domain: string;
    registrar: string | null | undefined;
    addCustomDomain: boolean;
    cloudflareAccount?: string | null;
};

function hasCloudflareBuildCredentials(shardToken?: string | null): boolean {
    return Boolean(shardToken?.trim() || process.env.CLOUDFLARE_API_TOKEN);
}

export async function runDeployPreflight(input: DeployPreflightInput): Promise<DeployPreflightResult> {
    const issues: DeployPreflightIssue[] = [];
    let zoneNameservers: string[] | null = null;
    const hostShardPlan = await resolveCloudflareHostShardPlan({
        domain: input.domain,
        cloudflareAccount: input.cloudflareAccount ?? null,
    });
    const hostShard = hostShardPlan.primary;

    for (const warning of hostShard.warnings) {
        issues.push({
            code: 'cloudflare_shard_resolution_warning',
            severity: 'warning',
            message: warning,
        });
    }

    if (!hasCloudflareBuildCredentials(hostShard.cloudflare.apiToken ?? null)) {
        issues.push({
            code: 'cloudflare_credentials_missing',
            severity: 'blocking',
            message: 'CLOUDFLARE_API_TOKEN is required for deployment (account id can be auto-discovered).',
        });
    }

    if (!input.addCustomDomain) {
        return {
            ok: !issues.some((issue) => issue.severity === 'blocking'),
            issues,
            zoneNameservers: null,
        };
    }

    const registrar = (input.registrar || '').toLowerCase();
    if (!isAutomatedNameserverRegistrar(registrar)) {
        issues.push({
            code: 'registrar_manual_dns_required',
            severity: 'warning',
            message: `Registrar "${input.registrar || 'unknown'}" requires manual DNS cutover in current automation.`,
        });
    } else if (!hasRegistrarNameserverCredentials(registrar)) {
        issues.push({
            code: `${registrar}_credentials_missing`,
            severity: 'warning',
            message: `${registrarCredentialHint(registrar)} are not set; DNS nameserver cutover will be skipped.`,
        });
    }

    if (hasCloudflareBuildCredentials(hostShard.cloudflare.apiToken ?? null)) {
        let resolvedShardKey = hostShard.shardKey;
        for (const shard of hostShardPlan.all) {
            const zone = await getZoneNameservers(input.domain, shard.cloudflare);
            if (zone) {
                zoneNameservers = zone.nameservers;
                resolvedShardKey = shard.shardKey;
                break;
            }
        }

        if (!zoneNameservers) {
            issues.push({
                code: 'cloudflare_zone_unresolved',
                severity: 'warning',
                message: `Unable to resolve Cloudflare zone nameservers for ${input.domain}. Custom-domain link or DNS cutover may fail.`,
            });
        } else if (resolvedShardKey !== hostShard.shardKey) {
            issues.push({
                code: 'cloudflare_zone_resolved_on_failover_shard',
                severity: 'warning',
                message: `Cloudflare zone for ${input.domain} resolved on failover shard "${resolvedShardKey}" instead of primary shard "${hostShard.shardKey}".`,
            });
        }
    }

    return {
        ok: !issues.some((issue) => issue.severity === 'blocking'),
        issues,
        zoneNameservers,
    };
}
