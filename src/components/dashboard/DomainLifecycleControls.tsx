'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
}

type LifecycleState =
    | 'sourced'
    | 'underwriting'
    | 'approved'
    | 'acquired'
    | 'build'
    | 'growth'
    | 'monetized'
    | 'hold'
    | 'sell'
    | 'sunset';

interface LifecycleEvent {
    id: string;
    domainId: string;
    actorId: string | null;
    fromState: LifecycleState;
    toState: LifecycleState;
    reason: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
}

interface LifecyclePayload {
    domain: {
        id: string;
        domain: string;
        lifecycleState: LifecycleState;
        updatedAt: string | null;
    };
    allowedTransitions: LifecycleState[];
    events: LifecycleEvent[];
}

const STATE_BADGE_STYLE: Record<LifecycleState, string> = {
    sourced: 'bg-slate-100 text-slate-800',
    underwriting: 'bg-blue-100 text-blue-800',
    approved: 'bg-indigo-100 text-indigo-800',
    acquired: 'bg-emerald-100 text-emerald-800',
    build: 'bg-cyan-100 text-cyan-900',
    growth: 'bg-lime-100 text-lime-900',
    monetized: 'bg-green-200 text-green-950',
    hold: 'bg-amber-100 text-amber-900',
    sell: 'bg-orange-100 text-orange-900',
    sunset: 'bg-zinc-200 text-zinc-900',
};

function formatTimestamp(value: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString();
}

export default function DomainLifecycleControls({ domainId }: Props) {
    const [payload, setPayload] = useState<LifecyclePayload | null>(null);
    const [targetState, setTargetState] = useState<LifecycleState | ''>('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const currentState = payload?.domain.lifecycleState ?? 'sourced';
    const allowedTransitions = useMemo(
        () => payload?.allowedTransitions ?? [],
        [payload?.allowedTransitions],
    );

    useEffect(() => {
        if (allowedTransitions.length === 0) {
            setTargetState('');
            return;
        }
        if (!targetState || !allowedTransitions.includes(targetState)) {
            setTargetState(allowedTransitions[0]);
        }
    }, [allowedTransitions, targetState]);

    async function loadLifecycle() {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/domains/${domainId}/lifecycle?limit=20`);
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to load lifecycle state');
            }
            const data = await response.json() as LifecyclePayload;
            setPayload(data);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load lifecycle state');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadLifecycle();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [domainId]);

    const canTransition = useMemo(
        () => allowedTransitions.length > 0 && Boolean(targetState) && !saving,
        [allowedTransitions.length, targetState, saving],
    );

    async function applyTransition() {
        if (!targetState) return;
        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const response = await fetch(`/api/domains/${domainId}/lifecycle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toState: targetState,
                    reason: reason.trim() || null,
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(body.error || 'Failed to transition lifecycle state');
            }
            setReason('');
            setMessage(`Lifecycle moved to ${targetState.replaceAll('_', ' ')}.`);
            await loadLifecycle();
        } catch (transitionError) {
            setError(transitionError instanceof Error ? transitionError.message : 'Failed to transition lifecycle state');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Lifecycle Controls</CardTitle>
                    <CardDescription>Loading lifecycle controls...</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (!payload) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Lifecycle Controls</CardTitle>
                    <CardDescription>Unable to load lifecycle controls.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Lifecycle Controls</CardTitle>
                <CardDescription>
                    Transition this domain through sourcing, build, growth, monetization, and disposition states.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Current State</p>
                    <Badge className={`mt-2 capitalize ${STATE_BADGE_STYLE[currentState]}`}>
                        {currentState}
                    </Badge>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Updated: {formatTimestamp(payload.domain.updatedAt)}
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="lifecycle-target">Next State</Label>
                        <Select
                            value={targetState || undefined}
                            onValueChange={(value) => setTargetState(value as LifecycleState)}
                            disabled={allowedTransitions.length === 0 || saving}
                        >
                            <SelectTrigger id="lifecycle-target">
                                <SelectValue placeholder="No allowed transitions" />
                            </SelectTrigger>
                            <SelectContent>
                                {allowedTransitions.map((state) => (
                                    <SelectItem key={state} value={state}>
                                        {state.replaceAll('_', ' ')}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="lifecycle-reason">Reason</Label>
                        <Input
                            id="lifecycle-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Required for hold/sell/sunset transitions"
                            disabled={saving}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button onClick={applyTransition} disabled={!canTransition}>
                        {saving ? 'Applying...' : 'Apply Transition'}
                    </Button>
                    {allowedTransitions.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            No transitions available for your role from this state.
                        </p>
                    )}
                </div>

                <div className="rounded-md border p-3">
                    <p className="font-medium">Recent Lifecycle Events</p>
                    {payload.events.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">No lifecycle events recorded.</p>
                    ) : (
                        <div className="mt-2 space-y-2">
                            {payload.events.map((event) => (
                                <div key={event.id} className="rounded border p-2">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                        <span className="capitalize">{event.fromState}</span>
                                        <span className="text-muted-foreground">to</span>
                                        <span className="capitalize">{event.toState}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {formatTimestamp(event.createdAt)}
                                    </p>
                                    {event.reason && (
                                        <p className="mt-1 text-xs text-muted-foreground">Reason: {event.reason}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}
                {message && (
                    <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                        {message}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
