import { Sidebar } from '@/components/dashboard/Sidebar';
import { MobileNav } from '@/components/dashboard/MobileNav';
import { CommandPalette } from '@/components/dashboard/CommandPalette';
import { Breadcrumbs } from '@/components/dashboard/Breadcrumbs';
import { ScrollToTop } from '@/components/dashboard/ScrollToTop';
import { KeyboardShortcutsHelp } from '@/components/dashboard/KeyboardShortcutsHelp';
import { PageTitle } from '@/components/dashboard/PageTitle';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { verifyAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Protect all dashboard routes
    const isAuthenticated = await verifyAuth();

    if (!isAuthenticated) {
        redirect('/login');
    }

    return (
        <div className="flex h-screen bg-background flex-col md:flex-row">
            <MobileNav />
            <div className="hidden md:flex">
                <Sidebar />
            </div>
            <main className="flex-1 overflow-auto">
                <div className="container mx-auto p-4 md:p-6">
                    <Breadcrumbs />
                    <PageTransition>{children}</PageTransition>
                </div>
            </main>
            <CommandPalette />
            <ScrollToTop />
            <KeyboardShortcutsHelp />
            <PageTitle />
        </div>
    );
}
