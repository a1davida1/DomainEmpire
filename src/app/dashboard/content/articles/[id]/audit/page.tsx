'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ScrollText, Loader2 } from 'lucide-react';

type AuditEvent = {
    id: string;
    articleId: string;
    revisionId: string | null;
    actorId: string;
    actorRole: string;
    eventType: string;
    reasonCode: string | null;
    rationale: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
};

const EVENT_COLORS: Record<string, string> = {
    created: 'bg-green-100 text-green-800',
    edited: 'bg-blue-100 text-blue-800',
    submitted_for_review: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    published: 'bg-purple-100 text-purple-800',
    archived: 'bg-gray-100 text-gray-800',
    reverted: 'bg-orange-100 text-orange-800',
    comment: 'bg-sky-100 text-sky-800',
    qa_completed: 'bg-teal-100 text-teal-800',
    expert_signed: 'bg-indigo-100 text-indigo-800',
};

export default function AuditLogPage() {
    const params = useParams();
    const articleId = params.id as string;
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/articles/${articleId}/events`)
            .then(r => {
                if (!r.ok) throw new Error(`Failed to load audit events: ${r.statusText}`);
                return r.json();
            })
            .then(data => { if (!cancelled) setEvents(data); })
            .catch(err => console.error('Failed to load audit events:', err))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [articleId]);

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <ScrollText className="h-6 w-6" />
                <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
            </div>

            {events.length === 0 ? (
                <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">
                    No audit events recorded yet.
                </div>
            ) : (
                <div className="bg-card rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left p-3">Time</th>
                                    <th className="text-left p-3">Event</th>
                                    <th className="text-left p-3">Actor</th>
                                    <th className="text-left p-3">Rationale</th>
                                    <th className="text-left p-3">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map(event => (
                                    <tr key={event.id} className="border-t">
                                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                                            {new Date(event.createdAt).toLocaleString()}
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_COLORS[event.eventType] || 'bg-gray-100'}`}>
                                                {event.eventType.replaceAll('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <span className="text-xs text-muted-foreground">
                                                {event.actorRole}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            {event.rationale || <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="p-3 text-xs text-muted-foreground">
                                            {event.metadata ? (
                                                <code className="bg-muted px-1 py-0.5 rounded">
                                                    {JSON.stringify(event.metadata).slice(0, 100)}
                                                </code>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
