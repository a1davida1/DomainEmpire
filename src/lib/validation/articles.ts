import { z } from 'zod';

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
