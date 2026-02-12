'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { History, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { lcsDiff } from '@/lib/audit/revisions';

type Revision = {
    id: string;
    revisionNumber: number;
    title: string | null;
    contentHash: string;
    wordCount: number | null;
    changeType: string;
    changeSummary: string | null;
    createdById: string | null;
    createdAt: string;
};

type RevisionFull = Revision & {
    contentMarkdown: string | null;
    metaDescription: string | null;
};

type DiffPair = {
    older: RevisionFull | null;
    newer: RevisionFull | null;
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
    ai_generated: 'bg-purple-100 text-purple-800',
    ai_refined: 'bg-indigo-100 text-indigo-800',
    manual_edit: 'bg-blue-100 text-blue-800',
    status_change: 'bg-yellow-100 text-yellow-800',
    bulk_refresh: 'bg-orange-100 text-orange-800',
};


export default function RevisionsPage() {
    const params = useParams();
    const articleId = params.id as string;
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(true);
    const [diffPair, setDiffPair] = useState<DiffPair | null>(null);
    const [diffLoading, setDiffLoading] = useState(false);
    const [expandedRev, setExpandedRev] = useState<number | null>(null);

    useEffect(() => {
        fetch(`/api/articles/${articleId}/revisions`)
            .then(r => r.json())
            .then(setRevisions)
            .finally(() => setLoading(false));
    }, [articleId]);

    async function loadDiff(revisionNumber: number) {
        if (expandedRev === revisionNumber) {
            setExpandedRev(null);
            setDiffPair(null);
            return;
        }
        setDiffLoading(true);
        setExpandedRev(revisionNumber);
        const res = await fetch(`/api/articles/${articleId}/revisions?diff=${revisionNumber}`);
        setDiffPair(await res.json());
        setDiffLoading(false);
    }

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <History className="h-6 w-6" />
                <h1 className="text-3xl font-bold">Revision History</h1>
            </div>

            {revisions.length === 0 ? (
                <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">
                    No revisions recorded yet.
                </div>
            ) : (
                <div className="space-y-2">
                    {revisions.map(rev => (
                        <div key={rev.id} className="bg-card rounded-lg border">
                            <button
                                onClick={() => loadDiff(rev.revisionNumber)}
                                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-mono font-bold text-muted-foreground">
                                        #{rev.revisionNumber}
                                    </span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CHANGE_TYPE_COLORS[rev.changeType] || 'bg-gray-100'}`}>
                                                {rev.changeType.replaceAll('_', ' ')}
                                            </span>
                                            {rev.wordCount && (
                                                <span className="text-xs text-muted-foreground">{rev.wordCount} words</span>
                                            )}
                                        </div>
                                        {rev.changeSummary && (
                                            <p className="text-sm text-muted-foreground mt-0.5">{rev.changeSummary}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(rev.createdAt).toLocaleString()}
                                    </span>
                                    {expandedRev === rev.revisionNumber ?
                                        <ChevronUp className="h-4 w-4" /> :
                                        <ChevronDown className="h-4 w-4" />
                                    }
                                </div>
                            </button>

                            {expandedRev === rev.revisionNumber && (
                                <div className="border-t p-4">
                                    {diffLoading ? (
                                        <div className="flex items-center justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                                    ) : diffPair?.newer ? (
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium">
                                                {diffPair.older
                                                    ? `Changes from revision #${rev.revisionNumber - 1} to #${rev.revisionNumber}`
                                                    : `Initial content (revision #${rev.revisionNumber})`
                                                }
                                            </p>
                                            <div className="font-mono text-xs bg-muted/30 rounded p-3 max-h-96 overflow-auto">
                                                {diffPair.older ? (
                                                    lcsDiff(
                                                        diffPair.older.contentMarkdown || '',
                                                        diffPair.newer.contentMarkdown || ''
                                                    ).map((line, i) => (
                                                        <div
                                                            key={i}
                                                            className={
                                                                line.type === 'add' ? 'bg-green-100 text-green-800' :
                                                                    line.type === 'remove' ? 'bg-red-100 text-red-800 line-through' :
                                                                        ''
                                                            }
                                                        >
                                                            {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}
                                                            {line.line || '\u00A0'}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <pre className="whitespace-pre-wrap">{diffPair.newer.contentMarkdown?.slice(0, 2000)}
                                                        {(diffPair.newer.contentMarkdown?.length || 0) > 2000 ? '\n... (truncated)' : ''}</pre>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No data available.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
