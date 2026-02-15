import { z } from 'zod';

function parseAllowedLeadDomains(): string[] {
    const raw = process.env.ALLOWED_LEAD_DOMAINS;
    if (!raw) return [];
    return raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .map((entry) => entry.replace(/^www\./, ''))
        .filter((entry) => entry.length > 0);
}

function isPrivateOrLocalHost(hostname: string): boolean {
    const host = hostname.trim().toLowerCase();
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
        return true;
    }
    if (host.endsWith('.local')) return true;
    if (host.startsWith('10.')) return true;
    if (host.startsWith('192.168.')) return true;
    if (host.startsWith('169.254.')) return true;
    const octets = host.split('.');
    if (octets.length === 4 && octets.every((octet) => /^\d+$/.test(octet))) {
        const first = Number(octets[0]);
        const second = Number(octets[1]);
        if (first === 172 && second >= 16 && second <= 31) return true;
    }
    return false;
}

export function isAllowedLeadEndpoint(endpoint: string): boolean {
    const value = endpoint.trim();
    if (!value) return false;

    if (value.startsWith('/')) {
        return !value.startsWith('//');
    }

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return false;
    }

    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;

    const host = parsed.hostname.trim().toLowerCase().replace(/^www\./, '');
    if (isPrivateOrLocalHost(host)) return false;

    const allowedDomains = parseAllowedLeadDomains();
    if (allowedDomains.length === 0) return false;

    return allowedDomains.some((allowedDomain) => (
        host === allowedDomain || host.endsWith(`.${allowedDomain}`)
    ));
}

export const calculatorConfigSchema = z.object({
    inputs: z.array(z.object({
        id: z.string(), label: z.string(),
        type: z.enum(['number', 'select', 'range']),
        default: z.number().optional(), min: z.number().optional(),
        max: z.number().optional(), step: z.number().optional(),
        options: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
    })).min(1),
    outputs: z.array(z.object({
        id: z.string(), label: z.string(),
        format: z.enum(['currency', 'percent', 'number']),
        decimals: z.number().int().min(0).max(10).optional(),
    })).min(1),
    formula: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    methodology: z.string().optional(),
}).strict();

export const comparisonDataSchema = z.object({
    options: z.array(z.object({
        name: z.string(),
        url: z.string().url().optional(),
        badge: z.string().optional(),
        scores: z.record(z.string(), z.union([z.number(), z.string()])),
    })).min(1),
    columns: z.array(z.object({
        key: z.string(), label: z.string(),
        type: z.enum(['number', 'text', 'rating']),
        sortable: z.boolean().optional(),
    })).min(1),
    defaultSort: z.string().optional(),
    verdict: z.string().optional(),
}).strict();

export const leadGenConfigSchema = z.object({
    fields: z.array(z.object({
        name: z.string(), label: z.string(),
        type: z.enum(['text', 'email', 'tel', 'select', 'number']),
        required: z.boolean().optional(),
        options: z.array(z.string()).optional(),
    })).min(1),
    consentText: z.string().min(1),
    endpoint: z.string().url(),
    successMessage: z.string().min(1),
    disclosureAboveFold: z.string().optional(),
    privacyPolicyUrl: z.string().url().optional(),
}).strict();

export const wizardConfigSchema = z.object({
    steps: z.array(z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        fields: z.array(z.object({
            id: z.string().min(1),
            type: z.enum(['radio', 'checkbox', 'select', 'number', 'text']),
            label: z.string().min(1),
            options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
            required: z.boolean().optional(),
        }).refine(
            (field) => {
                if (['radio', 'checkbox', 'select'].includes(field.type)) {
                    return Array.isArray(field.options) && field.options.length > 0;
                }
                return true;
            },
            { message: 'options is required and must be non-empty for radio, checkbox, and select types', path: ['options'] },
        )).min(1),
        nextStep: z.string().optional(),
        branches: z.array(z.object({
            condition: z.string().min(1),
            goTo: z.string().min(1),
        })).optional(),
    })).min(1),
    resultRules: z.array(z.object({
        condition: z.string().min(1),
        title: z.string().min(1),
        body: z.string().min(1),
        cta: z.object({
            text: z.string().min(1),
            url: z.string().url(),
        }).optional(),
    })).min(1),
    resultTemplate: z.enum(['summary', 'recommendation', 'score', 'eligibility']),
    collectLead: z.object({
        fields: z.array(z.string()).min(1),
        consentText: z.string().min(1),
        endpoint: z.string().min(1).refine(isAllowedLeadEndpoint, {
            message: 'Endpoint must be an internal path or an HTTPS host in ALLOWED_LEAD_DOMAINS',
        }),
    }).optional(),
    scoring: z.object({
        method: z.enum(['completion', 'weighted']).optional(),
        weights: z.record(z.string(), z.number().min(0)).optional(),
        valueMap: z.record(z.string(), z.record(z.string(), z.number().min(0).max(100))).optional(),
        bands: z.array(z.object({
            min: z.number().min(0).max(100),
            max: z.number().min(0).max(100),
            label: z.string().min(1),
            description: z.string().optional(),
        }).refine((band) => band.max >= band.min, {
            message: 'Band max must be greater than or equal to min',
            path: ['max'],
        })).optional(),
        outcomes: z.array(z.object({
            min: z.number().min(0).max(100),
            max: z.number().min(0).max(100),
            title: z.string().min(1),
            body: z.string().min(1),
            cta: z.object({
                text: z.string().min(1),
                url: z.string().url(),
            }).optional(),
        }).refine((outcome) => outcome.max >= outcome.min, {
            message: 'Outcome max must be greater than or equal to min',
            path: ['max'],
        })).optional(),
    }).optional(),
}).strict();

export const geoDataSchema = z.object({
    regions: z.record(z.string(), z.object({
        content: z.string().min(1),
        label: z.string().optional(),
    })).optional(),
    fallback: z.string().min(1),
}).strict();
