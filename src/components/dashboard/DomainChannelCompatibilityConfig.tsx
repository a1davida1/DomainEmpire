'use client';

import { useEffect, useMemo, useState } from 'react';
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

type Channel = 'pinterest' | 'youtube_shorts';
type Compatibility = 'supported' | 'limited' | 'blocked';

interface ChannelProfile {
    id: string | null;
    domainId: string;
    channel: Channel;
    enabled: boolean;
    compatibility: Compatibility;
    accountRef: string | null;
    dailyCap: number | null;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
    minJitterMinutes: number;
    maxJitterMinutes: number;
    notes: string | null;
}

interface Props {
    domainId: string;
}

const CHANNEL_LABELS: Record<Channel, { title: string; accountLabel: string }> = {
    pinterest: {
        title: 'Pinterest',
        accountLabel: 'Board ID / account reference',
    },
    youtube_shorts: {
        title: 'YouTube Shorts',
        accountLabel: 'Channel ID / account reference',
    },
};

function parseNullableInt(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export default function DomainChannelCompatibilityConfig({ domainId }: Props) {
    const [profiles, setProfiles] = useState<ChannelProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadProfiles() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/domains/${domainId}/channel-compatibility`);
                if (!res.ok) {
                    const payload = await res.json().catch(() => ({}));
                    throw new Error(payload.error || 'Failed to load channel compatibility settings');
                }
                const payload = await res.json();
                if (!cancelled) {
                    setProfiles(Array.isArray(payload.profiles) ? payload.profiles : []);
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load settings');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadProfiles();
        return () => {
            cancelled = true;
        };
    }, [domainId]);

    const canSave = useMemo(() => profiles.length > 0 && !loading && !saving, [profiles.length, loading, saving]);

    function updateProfile(channel: Channel, patch: Partial<ChannelProfile>) {
        setProfiles((current) => current.map((profile) => (
            profile.channel === channel ? { ...profile, ...patch } : profile
        )));
        setSavedAt(null);
    }

    async function saveProfiles() {
        setSaving(true);
        setError(null);

        try {
            const payload = {
                profiles: profiles.map((profile) => ({
                    channel: profile.channel,
                    enabled: profile.enabled,
                    compatibility: profile.compatibility,
                    accountRef: profile.accountRef,
                    dailyCap: profile.dailyCap,
                    quietHoursStart: profile.quietHoursStart,
                    quietHoursEnd: profile.quietHoursEnd,
                    minJitterMinutes: profile.minJitterMinutes,
                    maxJitterMinutes: profile.maxJitterMinutes,
                    notes: profile.notes,
                })),
            };

            const res = await fetch(`/api/domains/${domainId}/channel-compatibility`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.error || 'Failed to save channel compatibility settings');
            }
            setProfiles(Array.isArray(body.profiles) ? body.profiles : profiles);
            setSavedAt(new Date().toISOString());
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Channel Compatibility</CardTitle>
                <CardDescription>
                    Configure per-domain social channel support, publish caps, and cadence variance controls.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                {loading && <p className="text-sm text-muted-foreground">Loading channel settings...</p>}
                {!loading && profiles.length === 0 && (
                    <p className="text-sm text-muted-foreground">No channel settings found for this domain.</p>
                )}

                {!loading && profiles.map((profile) => (
                    <div key={profile.channel} className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h4 className="font-medium">{CHANNEL_LABELS[profile.channel].title}</h4>
                                <p className="text-xs text-muted-foreground">
                                    Channel-specific compatibility and publish timing.
                                </p>
                            </div>
                            <label htmlFor={`channel-enabled-${profile.channel}`} className="flex items-center gap-2 text-sm">
                                <input
                                    id={`channel-enabled-${profile.channel}`}
                                    type="checkbox"
                                    checked={profile.enabled}
                                    onChange={(event) => updateProfile(profile.channel, { enabled: event.target.checked })}
                                />
                                Enabled
                            </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor={`compatibility-${profile.channel}`}>Compatibility</Label>
                                <Select
                                    value={profile.compatibility}
                                    onValueChange={(value) => updateProfile(profile.channel, { compatibility: value as Compatibility })}
                                >
                                    <SelectTrigger id={`compatibility-${profile.channel}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="supported">Supported</SelectItem>
                                        <SelectItem value="limited">Limited</SelectItem>
                                        <SelectItem value="blocked">Blocked</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{CHANNEL_LABELS[profile.channel].accountLabel}</Label>
                                <Input
                                    value={profile.accountRef || ''}
                                    onChange={(event) => updateProfile(profile.channel, { accountRef: event.target.value || null })}
                                    placeholder="Optional"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Daily Cap Override</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={200}
                                    value={profile.dailyCap ?? ''}
                                    onChange={(event) => updateProfile(profile.channel, {
                                        dailyCap: parseNullableInt(event.target.value),
                                    })}
                                    placeholder="Use campaign default"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Quiet Hours (UTC start/end)</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        type="number"
                                        min={0}
                                        max={23}
                                        value={profile.quietHoursStart ?? ''}
                                        onChange={(event) => updateProfile(profile.channel, {
                                            quietHoursStart: parseNullableInt(event.target.value),
                                        })}
                                        placeholder="Start hour"
                                    />
                                    <Input
                                        type="number"
                                        min={0}
                                        max={23}
                                        value={profile.quietHoursEnd ?? ''}
                                        onChange={(event) => updateProfile(profile.channel, {
                                            quietHoursEnd: parseNullableInt(event.target.value),
                                        })}
                                        placeholder="End hour"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Min Jitter (minutes)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={1440}
                                    value={profile.minJitterMinutes}
                                    onChange={(event) => {
                                        const parsed = Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0);
                                        updateProfile(profile.channel, {
                                            minJitterMinutes: Math.min(parsed, profile.maxJitterMinutes),
                                        });
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Max Jitter (minutes)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={1440}
                                    value={profile.maxJitterMinutes}
                                    onChange={(event) => {
                                        const parsed = Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0);
                                        updateProfile(profile.channel, {
                                            maxJitterMinutes: Math.max(parsed, profile.minJitterMinutes),
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Reviewer Notes</Label>
                            <Input
                                value={profile.notes || ''}
                                onChange={(event) => updateProfile(profile.channel, { notes: event.target.value || null })}
                                placeholder="Optional notes about this channel/domain combination"
                            />
                        </div>
                    </div>
                ))}

                {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}
                {savedAt && (
                    <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                        Saved at {new Date(savedAt).toLocaleTimeString()}.
                    </div>
                )}

                <div className="flex justify-end">
                    <Button onClick={saveProfiles} disabled={!canSave}>
                        {saving ? 'Saving...' : 'Save Channel Settings'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
