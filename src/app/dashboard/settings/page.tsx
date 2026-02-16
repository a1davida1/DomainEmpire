import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ClipboardCheck, FileCheck, Wrench } from 'lucide-react';

export default function SettingsPage() {
    const sections = [
        {
            title: 'User Management',
            description: 'Add, edit, and manage user accounts and roles.',
            href: '/dashboard/settings/users',
            icon: Users,
        },
        {
            title: 'QA Templates',
            description: 'Configure quality assurance checklists for content review.',
            href: '/dashboard/settings/qa-templates',
            icon: FileCheck,
        },
        {
            title: 'Review Policies',
            description: 'Set up approval policies and review workflows.',
            href: '/dashboard/settings/review-policies',
            icon: ClipboardCheck,
        },
        {
            title: 'Operations',
            description: 'Configure queue stale-lock thresholds and SLA targets.',
            href: '/dashboard/settings/operations',
            icon: Wrench,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Configure your Domain Empire instance.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sections.map((section) => (
                    <Link key={section.href} href={section.href}>
                        <Card className="h-full transition-colors hover:bg-accent/50">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <section.icon className="h-5 w-5 text-primary" />
                                    <CardTitle className="text-lg">{section.title}</CardTitle>
                                </div>
                                <CardDescription>{section.description}</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
