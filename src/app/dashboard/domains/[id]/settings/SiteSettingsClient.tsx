'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Save, Plus, Trash2 } from 'lucide-react';

type SiteSettings = {
    siteName?: string;
    siteDescription?: string;
    phone?: string;
    contactEmail?: string;
    showSidebar?: boolean;
    sidebarAboutText?: string;
    footerText?: string;
    ctaHeading?: string;
    ctaButtonText?: string;
    ctaButtonUrl?: string;
    socialLinks?: Array<{ platform: string; url: string }>;
    customCss?: string;
};

interface Props {
    domainId: string;
    domainName: string;
    initialSettings: SiteSettings;
}

export function SiteSettingsClient({ domainId, domainName, initialSettings }: Props) {
    const [settings, setSettings] = useState<SiteSettings>(initialSettings);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    function update<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
        setSettings(prev => ({ ...prev, [key]: value }));
    }

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/domains/${domainId}/settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (!res.ok) {
                setMessage({ type: 'error', text: data.error || 'Failed to save' });
                return;
            }
            setSettings(data.settings);
            setMessage({ type: 'success', text: 'Settings saved. Redeploy the site for changes to take effect.' });
        } catch (err) {
            setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
        } finally {
            setSaving(false);
        }
    }

    function addSocialLink() {
        const links = settings.socialLinks || [];
        if (links.length >= 10) return;
        update('socialLinks', [...links, { platform: '', url: '' }]);
    }

    function updateSocialLink(index: number, field: 'platform' | 'url', value: string) {
        const links = [...(settings.socialLinks || [])];
        links[index] = { ...links[index], [field]: value };
        update('socialLinks', links);
    }

    function removeSocialLink(index: number) {
        const links = [...(settings.socialLinks || [])];
        links.splice(index, 1);
        update('socialLinks', links);
    }

    return (
        <div className="space-y-6">
            {message && (
                <div className={`rounded-md border p-3 text-sm ${
                    message.type === 'success'
                        ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
                        : 'border-destructive/50 bg-destructive/10 text-destructive'
                }`}>
                    {message.text}
                </div>
            )}

            {/* Identity */}
            <Card>
                <CardHeader>
                    <CardTitle>Site Identity</CardTitle>
                    <CardDescription>Override the auto-generated site name and description.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label htmlFor="siteName" className="text-sm font-medium">Site Name</label>
                            <input
                                id="siteName"
                                type="text"
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                                placeholder={domainName.split('.')[0]?.replace(/[-_]/g, ' ') || 'My Site'}
                                value={settings.siteName || ''}
                                onChange={e => update('siteName', e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Displayed in header, footer, and page titles.</p>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="contactEmail" className="text-sm font-medium">Contact Email</label>
                            <input
                                id="contactEmail"
                                type="email"
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                                placeholder="contact@example.com"
                                value={settings.contactEmail || ''}
                                onChange={e => update('contactEmail', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="siteDescription" className="text-sm font-medium">Site Description</label>
                        <textarea
                            id="siteDescription"
                            className="w-full rounded border bg-background px-3 py-2 text-sm"
                            rows={2}
                            placeholder="Expert guides about..."
                            value={settings.siteDescription || ''}
                            onChange={e => update('siteDescription', e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Used in meta description and sidebar about section.</p>
                    </div>
                </CardContent>
            </Card>

            {/* Contact / Phone */}
            <Card>
                <CardHeader>
                    <CardTitle>Phone &amp; Contact</CardTitle>
                    <CardDescription>Phone number displayed in the site header (click-to-call).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label htmlFor="phone" className="text-sm font-medium">Phone Number</label>
                            <input
                                id="phone"
                                type="tel"
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                                placeholder="(555) 123-4567"
                                value={settings.phone || ''}
                                onChange={e => update('phone', e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">Leave empty to hide the phone from the header.</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sidebar */}
            <Card>
                <CardHeader>
                    <CardTitle>Sidebar</CardTitle>
                    <CardDescription>Control whether the sidebar is shown and what appears in it.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                        <input
                            id="showSidebar"
                            type="checkbox"
                            className="h-4 w-4 rounded border"
                            checked={settings.showSidebar !== false}
                            onChange={e => update('showSidebar', e.target.checked)}
                        />
                        <label htmlFor="showSidebar" className="text-sm font-medium">Show sidebar</label>
                    </div>
                    {settings.showSidebar !== false && (
                        <div className="space-y-1.5">
                            <label htmlFor="sidebarAboutText" className="text-sm font-medium">Sidebar About Text</label>
                            <textarea
                                id="sidebarAboutText"
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                                rows={3}
                                placeholder="A short description shown in the sidebar about section..."
                                value={settings.sidebarAboutText || ''}
                                onChange={e => update('sidebarAboutText', e.target.value)}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Footer & CTA */}
            <Card>
                <CardHeader>
                    <CardTitle>Footer &amp; Call to Action</CardTitle>
                    <CardDescription>Customize footer text and the CTA section.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="footerText" className="text-sm font-medium">Footer Copyright Text</label>
                        <input
                            id="footerText"
                            type="text"
                            className="w-full rounded border bg-background px-3 py-2 text-sm"
                            placeholder={`© ${new Date().getFullYear()} ${domainName}`}
                            value={settings.footerText || ''}
                            onChange={e => update('footerText', e.target.value)}
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <label htmlFor="ctaHeading" className="text-sm font-medium">CTA Heading</label>
                            <input
                                id="ctaHeading"
                                type="text"
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                                placeholder="Ready to get started?"
                                value={settings.ctaHeading || ''}
                                onChange={e => update('ctaHeading', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="ctaButtonText" className="text-sm font-medium">CTA Button Text</label>
                            <input
                                id="ctaButtonText"
                                type="text"
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                                placeholder="Browse All Guides"
                                value={settings.ctaButtonText || ''}
                                onChange={e => update('ctaButtonText', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="ctaButtonUrl" className="text-sm font-medium">CTA Button URL</label>
                        <input
                            id="ctaButtonUrl"
                            type="text"
                            className="w-full rounded border bg-background px-3 py-2 text-sm"
                            placeholder="/"
                            value={settings.ctaButtonUrl || ''}
                            onChange={e => update('ctaButtonUrl', e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Social Links */}
            <Card>
                <CardHeader>
                    <CardTitle>Social Links</CardTitle>
                    <CardDescription>Social media links displayed in the footer.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {(settings.socialLinks || []).map((link, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <select
                                className="rounded border bg-background px-2 py-2 text-sm"
                                value={link.platform}
                                onChange={e => updateSocialLink(i, 'platform', e.target.value)}
                                aria-label="Platform"
                            >
                                <option value="">Select...</option>
                                <option value="twitter">Twitter / X</option>
                                <option value="facebook">Facebook</option>
                                <option value="instagram">Instagram</option>
                                <option value="linkedin">LinkedIn</option>
                                <option value="youtube">YouTube</option>
                                <option value="tiktok">TikTok</option>
                                <option value="pinterest">Pinterest</option>
                            </select>
                            <input
                                type="url"
                                className="flex-1 rounded border bg-background px-3 py-2 text-sm"
                                placeholder="https://..."
                                value={link.url}
                                onChange={e => updateSocialLink(i, 'url', e.target.value)}
                                aria-label="URL"
                            />
                            <Button variant="ghost" size="icon" onClick={() => removeSocialLink(i)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addSocialLink}>
                        <Plus className="mr-1 h-3 w-3" /> Add Social Link
                    </Button>
                </CardContent>
            </Card>

            {/* Custom CSS */}
            <Card>
                <CardHeader>
                    <CardTitle>Custom CSS</CardTitle>
                    <CardDescription>Additional CSS injected into every page. Use sparingly.</CardDescription>
                </CardHeader>
                <CardContent>
                    <textarea
                        id="customCss"
                        className="w-full rounded border bg-background px-3 py-2 font-mono text-sm"
                        rows={4}
                        placeholder=".sidebar { display: none; }"
                        value={settings.customCss || ''}
                        onChange={e => update('customCss', e.target.value)}
                    />
                </CardContent>
            </Card>

            {/* Save */}
            <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Settings'}
                </Button>
                <p className="text-xs text-muted-foreground">
                    Changes take effect on next deploy.
                </p>
            </div>
        </div>
    );
}
