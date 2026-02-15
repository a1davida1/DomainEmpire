import { describe, expect, it } from 'vitest';
import { parseStructuredRationale, requiresStructuredRationale } from '@/lib/review/rationale-policy';

describe('requiresStructuredRationale', () => {
    it('requires structure for review decisions and publish transitions', () => {
        expect(requiresStructuredRationale('review', 'approved')).toBe(true);
        expect(requiresStructuredRationale('review', 'draft')).toBe(true);
        expect(requiresStructuredRationale('approved', 'published')).toBe(true);
        expect(requiresStructuredRationale('draft', 'review')).toBe(false);
    });
});

describe('parseStructuredRationale', () => {
    it('rejects short freeform rationale when structure is required', () => {
        const result = parseStructuredRationale({
            contentType: 'article',
            rationale: 'Too short',
            rationaleDetails: {},
            fromStatus: 'review',
            toStatus: 'approved',
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('at least 20');
        }
    });

    it('rejects calculator rationale when required calculator fields are missing', () => {
        const result = parseStructuredRationale({
            contentType: 'calculator',
            rationale: 'Calculator logic reviewed with detailed notes and edge-case checks.',
            rationaleDetails: {
                summary: 'Calculator logic reviewed with detailed notes and edge-case checks.',
                evidenceQuality: 'strong',
                riskLevel: 'low',
                confidenceScore: 92,
                issueCodes: [],
                citationsChecked: true,
                disclosureChecked: true,
            },
            fromStatus: 'review',
            toStatus: 'approved',
        });

        expect(result.ok).toBe(false);
    });

    it('accepts valid calculator rationale payload', () => {
        const result = parseStructuredRationale({
            contentType: 'calculator',
            rationale: 'Calculator logic reviewed with edge-case vectors and unit checks.',
            rationaleDetails: {
                summary: 'Calculator logic reviewed with edge-case vectors and unit checks.',
                evidenceQuality: 'strong',
                riskLevel: 'low',
                confidenceScore: 95,
                issueCodes: [],
                citationsChecked: true,
                disclosureChecked: true,
                methodologyCheck: 'passed',
                formulaCoverage: 'full',
                edgeCasesTested: true,
                unitsVerified: true,
            },
            fromStatus: 'review',
            toStatus: 'approved',
        });

        expect(result.ok).toBe(true);
    });

    it('requires issue codes when sending content back to draft', () => {
        const result = parseStructuredRationale({
            contentType: 'article',
            rationale: 'Article requires revision for unsupported factual claims.',
            rationaleDetails: {
                summary: 'Article requires revision for unsupported factual claims.',
                evidenceQuality: 'weak',
                riskLevel: 'high',
                confidenceScore: 40,
                issueCodes: [],
                citationsChecked: false,
                disclosureChecked: false,
                factualityAssessment: 'unclear',
                structureQuality: 'weak',
            },
            fromStatus: 'review',
            toStatus: 'draft',
        });

        expect(result.ok).toBe(false);
    });
});
