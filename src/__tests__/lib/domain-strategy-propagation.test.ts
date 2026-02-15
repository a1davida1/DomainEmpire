import { describe, expect, it } from 'vitest';
import {
    getAvailableStrategyPropagationModules,
    mergeStrategyPropagationConfig,
} from '@/lib/domain/strategy-propagation';

describe('domain strategy propagation', () => {
    it('detects available modules from source shape', () => {
        const modules = getAvailableStrategyPropagationModules({
            siteTemplate: 'comparison',
            contentConfig: {
                schedule: { frequency: 'weekly' },
                writingWorkflow: { outlineTemplate: 'outline.v1' },
                branding: { primaryColor: '#111111' },
            },
        });

        expect(modules).toEqual([
            'site_template',
            'schedule',
            'writing_workflow',
            'branding',
        ]);
    });

    it('merges selected modules and appends audit history', () => {
        const merged = mergeStrategyPropagationConfig({
            sourceConfig: {
                schedule: { frequency: 'daily' },
                writingWorkflow: { draftTemplate: 'draft.v2' },
                branding: { primaryColor: '#123456' },
            },
            targetConfig: {
                schedule: { frequency: 'sporadic' },
                writingWorkflow: { draftTemplate: 'draft.v1' },
                branding: { primaryColor: '#654321' },
                strategyPropagationHistory: [],
            },
            modules: ['schedule', 'writing_workflow'],
            history: {
                at: '2026-02-15T00:00:00.000Z',
                sourceDomainId: 'source-domain',
                sourceDomain: 'source.example',
                modules: ['schedule', 'writing_workflow'],
                appliedBy: 'user-1',
                note: null,
            },
        });

        expect(merged.schedule).toEqual({ frequency: 'daily' });
        expect(merged.writingWorkflow).toEqual({ draftTemplate: 'draft.v2' });
        expect(merged.branding).toEqual({ primaryColor: '#654321' });
        expect(Array.isArray(merged.strategyPropagationHistory)).toBe(true);
        expect((merged.strategyPropagationHistory as Array<unknown>).length).toBe(1);
    });

    it('keeps existing config when modules are not selected', () => {
        const merged = mergeStrategyPropagationConfig({
            sourceConfig: {
                branding: { primaryColor: '#123456' },
            },
            targetConfig: {
                branding: { primaryColor: '#654321' },
            },
            modules: [],
            history: {
                at: '2026-02-15T00:00:00.000Z',
                sourceDomainId: 'source-domain',
                sourceDomain: 'source.example',
                modules: [],
                appliedBy: 'user-1',
                note: null,
            },
        });

        expect(merged.branding).toEqual({ primaryColor: '#654321' });
    });
});
