'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Shield, ShieldCheck, Eye, Crown, Loader2 } from 'lucide-react';

type User = {
    id: string;
    email: string;
    name: string;
    role: string;
    expertise: string[];
    credentials: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
};

const ROLE_ICONS: Record<string, typeof Shield> = {
    admin: Crown,
    expert: ShieldCheck,
    reviewer: Eye,
    editor: Shield,
};

const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-red-100 text-red-800',
    expert: 'bg-purple-100 text-purple-800',
    reviewer: 'bg-blue-100 text-blue-800',
    editor: 'bg-gray-100 text-gray-800',
};

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formRole, setFormRole] = useState('editor');
    const [formCredentials, setFormCredentials] = useState('');

    async function loadUsers() {
        try {
            const res = await fetch('/api/users');
            if (res.ok) {
                setUsers(await res.json());
            }
        } catch (err) {
            console.error('[Users] Failed to load users:', err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadUsers(); }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setFormError('');
        setSaving(true);

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName,
                    email: formEmail,
                    password: formPassword,
                    role: formRole,
                    credentials: formCredentials || undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setFormError(data.error || 'Failed to create user');
                return;
            }

            setShowForm(false);
            setFormName('');
            setFormEmail('');
            setFormPassword('');
            setFormRole('editor');
            setFormCredentials('');
            loadUsers();
        } catch {
            setFormError('An error occurred');
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(user: User) {
        try {
            if (user.isActive) {
                const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
                if (res.ok) loadUsers();
                else console.error('[Users] Failed to deactivate user:', res.status);
            } else {
                const res = await fetch(`/api/users/${user.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isActive: true }),
                });
                if (res.ok) loadUsers();
                else console.error('[Users] Failed to reactivate user:', res.status);
            }
        } catch (err) {
            console.error('[Users] Toggle active failed:', err);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
                <Button onClick={() => setShowForm(!showForm)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add User
                </Button>
            </div>

            {showForm && (
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-3">New User</h2>
                    <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" value={formName} onChange={e => setFormName(e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" value={formPassword} onChange={e => setFormPassword(e.target.value)} required minLength={8} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="role">Role</Label>
                            <select id="role" aria-label="Role" value={formRole} onChange={e => setFormRole(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
                                <option value="editor">Editor</option>
                                <option value="reviewer">Reviewer</option>
                                <option value="expert">Expert</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <Label htmlFor="credentials">Credentials (optional)</Label>
                            <Input id="credentials" value={formCredentials} onChange={e => setFormCredentials(e.target.value)}
                                placeholder="e.g. CPA, JD, MD" />
                        </div>

                        {formError && (
                            <div className="md:col-span-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                                {formError}
                            </div>
                        )}

                        <div className="md:col-span-2 flex gap-2">
                            <Button type="submit" disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Create User
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-card rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">User</th>
                                <th className="text-left p-3">Role</th>
                                <th className="text-left p-3">Credentials</th>
                                <th className="text-left p-3">Status</th>
                                <th className="text-left p-3">Last Login</th>
                                <th className="text-right p-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => {
                                const RoleIcon = ROLE_ICONS[user.role] || Shield;
                                return (
                                    <tr key={user.id} className="border-t">
                                        <td className="p-3">
                                            <div className="font-medium">{user.name}</div>
                                            <div className="text-xs text-muted-foreground">{user.email}</div>
                                        </td>
                                        <td className="p-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role] || ''}`}>
                                                <RoleIcon className="h-3 w-3" />
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">{user.credentials || '—'}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                                                {user.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <Button variant="ghost" size="sm" onClick={() => toggleActive(user)}>
                                                {user.isActive ? 'Deactivate' : 'Reactivate'}
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
