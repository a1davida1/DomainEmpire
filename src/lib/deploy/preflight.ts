import { getZoneNameservers } from './cloudflare';

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
};

function hasCloudflareBuildCredentials(): boolean {
    return Boolean(process.env.CLOUDFLARE_API_TOKEN);
}

function hasGoDaddyCredentials(): boolean {
    return Boolean(process.env.GODADDY_API_KEY && process.env.GODADDY_API_SECRET);
}

export async function runDeployPreflight(input: DeployPreflightInput): Promise<DeployPreflightResult> {
    const issues: DeployPreflightIssue[] = [];
    let zoneNameservers: string[] | null = null;

    if (!hasCloudflareBuildCredentials()) {
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
    if (registrar !== 'godaddy') {
        issues.push({
            code: 'registrar_manual_dns_required',
            severity: 'warning',
            message: `Registrar "${input.registrar || 'unknown'}" requires manual DNS cutover in current automation.`,
        });
    } else if (!hasGoDaddyCredentials()) {
        issues.push({
            code: 'godaddy_credentials_missing',
            severity: 'warning',
            message: 'GODADDY_API_KEY and GODADDY_API_SECRET are not set; DNS nameserver cutover will be skipped.',
        });
    }

    if (hasCloudflareBuildCredentials()) {
        const zone = await getZoneNameservers(input.domain);
        if (!zone) {
            issues.push({
                code: 'cloudflare_zone_unresolved',
                severity: 'warning',
                message: `Unable to resolve Cloudflare zone nameservers for ${input.domain}. Custom-domain link or DNS cutover may fail.`,
            });
        } else {
            zoneNameservers = zone.nameservers;
        }
    }

    return {
        ok: !issues.some((issue) => issue.severity === 'blocking'),
        issues,
        zoneNameservers,
    };
}
