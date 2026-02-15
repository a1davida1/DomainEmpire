'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Props {
    domainId: string;
    themeStyle: string | null;
    currentConfig: Record<string, unknown> | null;
}

interface WorkflowState {
    themeStyle: string;
    frequency: 'daily' | 'weekly' | 'sporadic';
    timeOfDay: 'morning' | 'evening' | 'random';
    minWords: number;
    maxWords: number;
    outlineTemplate: string;
    draftTemplate: string;
    humanizeTemplate: string;
    seoTemplate: string;
    metaTemplate: string;
    colorScheme: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    typographyPreset: string;
}

function readRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

function readString(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    return value;
}

function readWordRange(value: unknown): [number, number] {
    if (!Array.isArray(value) || value.length < 2) {
        return [800, 1500];
    }
    const first = Number(value[0]);
    const second = Number(value[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
        return [800, 1500];
    }
    const a = Math.max(200, Math.floor(first));
    const b = Math.max(200, Math.floor(second));
    return a <= b ? [a, b] : [b, a];
}

function buildInitialState(config: Record<string, unknown> | null, themeStyle: string | null): WorkflowState {
    const root = readRecord(config);
    const schedule = readRecord(root.schedule);
    const workflow = readRecord(root.writingWorkflow);
    const branding = readRecord(root.branding);
    const [minWords, maxWords] = readWordRange(schedule.wordCountRange);

    const frequencyRaw = readString(schedule.frequency, 'sporadic');
    const timeOfDayRaw = readString(schedule.timeOfDay, 'random');

    const frequency = (frequencyRaw === 'daily' || frequencyRaw === 'weekly' || frequencyRaw === 'sporadic')
        ? frequencyRaw
        : 'sporadic';
    const timeOfDay = (timeOfDayRaw === 'morning' || timeOfDayRaw === 'evening' || timeOfDayRaw === 'random')
        ? timeOfDayRaw
        : 'random';

    return {
        themeStyle: themeStyle || '',
        frequency,
        timeOfDay,
        minWords,
        maxWords,
        outlineTemplate: readString(workflow.outlineTemplate),
        draftTemplate: readString(workflow.draftTemplate),
        humanizeTemplate: readString(workflow.humanizeTemplate),
        seoTemplate: readString(workflow.seoTemplate),
        metaTemplate: readString(workflow.metaTemplate),
        colorScheme: readString(branding.colorScheme),
        primaryColor: readString(branding.primaryColor),
        secondaryColor: readString(branding.secondaryColor),
        accentColor: readString(branding.accentColor),
        typographyPreset: readString(branding.typographyPreset),
    };
}

export default function DomainWorkflowConfig({ domainId, themeStyle, currentConfig }: Props) {
    const initialState = useMemo(() => buildInitialState(currentConfig, themeStyle), [currentConfig, themeStyle]);
    const [state, setState] = useState<WorkflowState>(initialState);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function update<K extends keyof WorkflowState>(key: K, value: WorkflowState[K]) {
        setState((current) => ({ ...current, [key]: value }));
        setSaved(false);
    }

    async function save() {
        setSaving(true);
        setError(null);

        const minWords = Math.max(200, Math.floor(state.minWords));
        const maxWords = Math.max(minWords, Math.floor(state.maxWords));
        setState((current) => ({ ...current, minWords, maxWords }));
        const payload = {
            themeStyle: state.themeStyle || undefined,
            contentConfig: {
                schedule: {
                    frequency: state.frequency,
                    timeOfDay: state.timeOfDay,
                    wordCountRange: [minWords, maxWords],
                },
                writingWorkflow: {
                    outlineTemplate: state.outlineTemplate || undefined,
                    draftTemplate: state.draftTemplate || undefined,
                    humanizeTemplate: state.humanizeTemplate || undefined,
                    seoTemplate: state.seoTemplate || undefined,
                    metaTemplate: state.metaTemplate || undefined,
                },
                branding: {
                    colorScheme: state.colorScheme || undefined,
                    primaryColor: state.primaryColor || undefined,
                    secondaryColor: state.secondaryColor || undefined,
                    accentColor: state.accentColor || undefined,
                    typographyPreset: state.typographyPreset || undefined,
                },
            },
        };

        try {
            const response = await fetch(`/api/domains/${domainId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to save workflow configuration');
            }
            setSaved(true);
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save workflow configuration');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Workflow and Style Profile</CardTitle>
                <CardDescription>
                    Store per-domain article phase templates, generation cadence, and branding color/style settings.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="theme-style">Theme Style</Label>
                        <Input
                            id="theme-style"
                            value={state.themeStyle}
                            onChange={(event) => update('themeStyle', event.target.value)}
                            placeholder="e.g., navy-serif"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="color-scheme">Color Scheme</Label>
                        <Input
                            id="color-scheme"
                            value={state.colorScheme}
                            onChange={(event) => update('colorScheme', event.target.value)}
                            placeholder="e.g., slate-blue"
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="primary-color">Primary Color</Label>
                        <Input
                            id="primary-color"
                            value={state.primaryColor}
                            onChange={(event) => update('primaryColor', event.target.value)}
                            placeholder="#0f172a"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="secondary-color">Secondary Color</Label>
                        <Input
                            id="secondary-color"
                            value={state.secondaryColor}
                            onChange={(event) => update('secondaryColor', event.target.value)}
                            placeholder="#334155"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="accent-color">Accent Color</Label>
                        <Input
                            id="accent-color"
                            value={state.accentColor}
                            onChange={(event) => update('accentColor', event.target.value)}
                            placeholder="#ea580c"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="typography-preset">Typography Preset</Label>
                    <Input
                        id="typography-preset"
                        value={state.typographyPreset}
                        onChange={(event) => update('typographyPreset', event.target.value)}
                        placeholder="e.g., editorial-serif"
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label>Publishing Frequency</Label>
                        <Select
                            value={state.frequency}
                            onValueChange={(value) => update('frequency', value as WorkflowState['frequency'])}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="sporadic">Sporadic</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Preferred Time Window</Label>
                        <Select
                            value={state.timeOfDay}
                            onValueChange={(value) => update('timeOfDay', value as WorkflowState['timeOfDay'])}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="morning">Morning</SelectItem>
                                <SelectItem value="evening">Evening</SelectItem>
                                <SelectItem value="random">Random</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="min-words">Minimum Word Count</Label>
                        <Input
                            id="min-words"
                            type="number"
                            min={200}
                            value={state.minWords}
                            onChange={(event) => update('minWords', Number.parseInt(event.target.value || '200', 10) || 200)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="max-words">Maximum Word Count</Label>
                        <Input
                            id="max-words"
                            type="number"
                            min={200}
                            value={state.maxWords}
                            onChange={(event) => update('maxWords', Number.parseInt(event.target.value || '200', 10) || 200)}
                        />
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="outline-template">Outline Template</Label>
                        <Input
                            id="outline-template"
                            value={state.outlineTemplate}
                            onChange={(event) => update('outlineTemplate', event.target.value)}
                            placeholder="e.g., outline.v2.ymyl"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="draft-template">Draft Template</Label>
                        <Input
                            id="draft-template"
                            value={state.draftTemplate}
                            onChange={(event) => update('draftTemplate', event.target.value)}
                            placeholder="e.g., draft.v3.authority"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="humanize-template">Humanize Template</Label>
                        <Input
                            id="humanize-template"
                            value={state.humanizeTemplate}
                            onChange={(event) => update('humanizeTemplate', event.target.value)}
                            placeholder="e.g., humanize.v2.conversational"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="seo-template">SEO Template</Label>
                        <Input
                            id="seo-template"
                            value={state.seoTemplate}
                            onChange={(event) => update('seoTemplate', event.target.value)}
                            placeholder="e.g., seo.v1.competitive"
                        />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="meta-template">Meta Template</Label>
                        <Input
                            id="meta-template"
                            value={state.metaTemplate}
                            onChange={(event) => update('metaTemplate', event.target.value)}
                            placeholder="e.g., meta.v1.ctr"
                        />
                    </div>
                </div>

                {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <div className="flex justify-end">
                    <Button onClick={save} disabled={saving}>
                        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Workflow Profile'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
