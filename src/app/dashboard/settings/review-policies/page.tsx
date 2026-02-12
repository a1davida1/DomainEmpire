'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';

type Policy = {
    id: string;
    domainId: string | null;
    contentType: string | null;
    ymylLevel: string;
    requiredRole: string;
    requiresQaChecklist: boolean;
    requiresExpertSignoff: boolean;
    autoPublish: boolean;
    createdAt: string;
};

type Domain = {
    id: string;
    domain: string;
};

const YMYL_LEVELS = ['none', 'low', 'medium', 'high'] as const;
const ROLES = ['editor', 'reviewer', 'expert', 'admin'] as const;

export default function ReviewPoliciesPage() {
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const successTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    useEffect(() => {
        return () => {
            if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
            }
        };
    }, []);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Form state
    const [formDomainId, setFormDomainId] = useState('');
    const [formYmylLevel, setFormYmylLevel] = useState<string>('none');
    const [formRequiredRole, setFormRequiredRole] = useState<string>('reviewer');
    const [formQaRequired, setFormQaRequired] = useState(true);
    const [formExpertRequired, setFormExpertRequired] = useState(false);
    const [formAutoPublish, setFormAutoPublish] = useState(false);

    const loadPolicies = useCallback(async () => {
        try {
            const [policiesRes, domainsRes] = await Promise.all([
                fetch('/api/review/policies'),
                fetch('/api/domains'),
            ]);

            if (!policiesRes.ok) throw new Error(`Failed to load policies: ${policiesRes.statusText}`);
            if (!domainsRes.ok) throw new Error(`Failed to load domains: ${domainsRes.statusText}`);

            setPolicies(await policiesRes.json());
            const data = await domainsRes.json();
            setDomains(Array.isArray(data) ? data : data.domains || []);
        } catch (err: any) {
            console.error('Load failed:', err);
            setError(err.message || 'Failed to load page data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadPolicies(); }, [loadPolicies]);

    async function createPolicy() {
        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/review/policies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domainId: formDomainId || null,
                    ymylLevel: formYmylLevel,
                    requiredRole: formRequiredRole,
                    requiresQaChecklist: formQaRequired,
                    requiresExpertSignoff: formExpertRequired,
                    autoPublish: formAutoPublish,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to create policy');
            }

            setSuccessMessage('Policy created successfully');
            setShowForm(false);
            resetForm();
            await loadPolicies();

            if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
            successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err: any) {
            console.error('Create failed:', err);
            setError(err.message || 'Failed to create policy');
        } finally {
            setCreating(false);
        }
    }

    async function deletePolicy(id: string) {
        if (!globalThis.confirm('Are you sure you want to delete this policy?')) return;

        setDeletingId(id);
        setError(null);
        try {
            const res = await fetch(`/api/review/policies?id=${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to delete policy');
            }
            setSuccessMessage('Policy deleted successfully');
            await loadPolicies();

            if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
            successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 5000);
        } catch (err: any) {
            console.error('Delete failed:', err);
            setError(err.message || 'Failed to delete policy');
        } finally {
            setDeletingId(null);
        }
    }

    function resetForm() {
        setFormDomainId('');
        setFormYmylLevel('none');
        setFormRequiredRole('reviewer');
        setFormQaRequired(true);
        setFormExpertRequired(false);
        setFormAutoPublish(false);
    }

    function getDomainName(id: string | null): string {
        if (!id) return 'Global (all domains)';
        const d = domains.find(d => d.id === id);
        return d ? d.domain : id;
    }

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-6 w-6" />
                    <h1 className="text-3xl font-bold">Review Policies</h1>
                </div>
                <Button onClick={() => setShowForm(true)} disabled={showForm}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Policy
                </Button>
            </div>

            <p className="text-sm text-muted-foreground">
                Approval policies control who can approve and publish articles based on YMYL risk level and domain.
                When no specific policy matches, sensible defaults apply (higher YMYL = stricter requirements).
            </p>

            {error && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-lg flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </div>
            )}

            {successMessage && (
                <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded-lg flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    {successMessage}
                </div>
            )}

            {/* Create form */}
            {showForm && (
                <div className="bg-card rounded-lg border p-4 space-y-4">
                    <h2 className="text-lg font-semibold">New Approval Policy</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="domain-id" className="block text-sm font-medium mb-1">Domain (Optional)</label>
                            <select
                                id="domain-id"
                                value={formDomainId}
                                onChange={(e) => setFormDomainId(e.target.value)}
                                className="w-full p-2 rounded border bg-background"
                            >
                                <option value="">Global (all domains)</option>
                                {domains.map(d => (
                                    <option key={d.id} value={d.id}>{d.domain}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="ymyl-level" className="block text-sm font-medium mb-1">YMYL Level</label>
                            <select
                                id="ymyl-level"
                                value={formYmylLevel}
                                onChange={(e) => setFormYmylLevel(e.target.value as any)}
                                className="w-full p-2 rounded border bg-background"
                            >
                                {YMYL_LEVELS.map(l => (
                                    <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="required-role" className="block text-sm font-medium mb-1">Required Role</label>
                            <select
                                id="required-role"
                                value={formRequiredRole}
                                onChange={(e) => setFormRequiredRole(e.target.value as any)}
                                className="w-full p-2 rounded border bg-background"
                            >
                                {ROLES.map(r => (
                                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 pt-2">
                        <label htmlFor="qa-required" className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                id="qa-required"
                                checked={formQaRequired}
                                onChange={(e) => setFormQaRequired(e.target.checked)}
                                className="rounded border-gray-300"
                            />
                            <span className="text-sm">Requires QA Checklist</span>
                        </label>
                        <label htmlFor="expert-required" className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                id="expert-required"
                                checked={formExpertRequired}
                                onChange={e => setFormExpertRequired(e.target.checked)}
                                className="rounded border-gray-300"
                            />
                            <span className="text-sm">Require Expert Sign-off</span>
                        </label>
                        <label htmlFor="auto-publish" className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                id="auto-publish"
                                checked={formAutoPublish}
                                onChange={(e) => setFormAutoPublish(e.target.checked)}
                                className="rounded border-gray-300"
                            />
                            <span className="text-sm">Auto-publish on Approval</span>
                        </label>
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={createPolicy} disabled={creating}>
                            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Create Policy
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Policy list */}
            {policies.length === 0 && !showForm ? (
                <div className="bg-muted/30 rounded-lg border p-8 text-center">
                    <p className="text-muted-foreground">No custom approval policies defined. Default policies are in effect.</p>
                    <p className="text-xs text-muted-foreground mt-2">
                        Defaults: High YMYL requires expert, Medium requires reviewer, Low/None requires editor.
                    </p>
                </div>
            ) : (
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3 font-medium">Scope</th>
                                <th className="text-left p-3 font-medium">YMYL</th>
                                <th className="text-left p-3 font-medium">Min. Role</th>
                                <th className="text-center p-3 font-medium">QA</th>
                                <th className="text-center p-3 font-medium">Expert</th>
                                <th className="text-center p-3 font-medium">Auto-Pub</th>
                                <th className="text-right p-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {policies.map(p => (
                                <tr key={p.id} className="border-t">
                                    <td className="p-3">{getDomainName(p.domainId)}</td>
                                    <td className="p-3">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${p.ymylLevel === 'high' ? 'bg-red-100 text-red-800' :
                                            p.ymylLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                p.ymylLevel === 'low' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-gray-100 text-gray-600'
                                            }`}>
                                            {p.ymylLevel}
                                        </span>
                                    </td>
                                    <td className="p-3 capitalize">{p.requiredRole}</td>
                                    <td className="p-3 text-center">{p.requiresQaChecklist ? 'Yes' : 'No'}</td>
                                    <td className="p-3 text-center">{p.requiresExpertSignoff ? 'Yes' : 'No'}</td>
                                    <td className="p-3 text-center">{p.autoPublish ? 'Yes' : 'No'}</td>
                                    <td className="p-3 text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => deletePolicy(p.id)}
                                            disabled={deletingId === p.id}
                                            aria-label="Delete policy"
                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                        >
                                            {deletingId === p.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
