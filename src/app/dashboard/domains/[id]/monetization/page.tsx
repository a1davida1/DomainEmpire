import { notFound } from 'next/navigation';
import { db, domains, monetizationProfiles } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { AffiliateManager } from '@/components/monetization/AffiliateManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function MonetizationPage({ params }: PageProps) {
    const { id } = await params;

    const domain = await db.query.domains.findFirst({
        where: eq(domains.id, id),
    });

    if (!domain) {
        notFound();
    }

    const profile = await db.query.monetizationProfiles.findFirst({
        where: eq(monetizationProfiles.domainId, id),
    });

    const affiliates = (profile?.affiliates as { provider: string; programId: string; linkTemplate: string; commissionType: string; commissionValue: number }[]) || [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Monetization: {domain.domain}</h1>
                <p className="text-muted-foreground">
                    Manage revenue sources, affiliate programs, and ad placements.
                </p>
            </div>

            <Tabs defaultValue="affiliates" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="affiliates">Affiliate Programs</TabsTrigger>
                    <TabsTrigger value="ads">Ad Networks</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="affiliates" className="space-y-4">
                    <AffiliateManager domainId={id} initialAffiliates={affiliates} />
                </TabsContent>

                <TabsContent value="ads">
                    <Card>
                        <CardHeader>
                            <CardTitle>Ad Network Configuration</CardTitle>
                            <CardDescription>Configure Ezoic, Mediavine, or AdSense settings.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Ad network configuration coming soon.</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="settings">
                    <Card>
                        <CardHeader>
                            <CardTitle>Global Monetization Settings</CardTitle>
                            <CardDescription>General settings for this domain.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Settings coming soon.</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
