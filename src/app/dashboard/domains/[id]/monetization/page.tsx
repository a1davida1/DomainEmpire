import { notFound } from 'next/navigation';
import { db, domains, monetizationProfiles } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { AffiliateManager } from '@/components/monetization/AffiliateManager';
import { AdNetworkConfig } from '@/components/monetization/AdNetworkConfig';
import { MonetizationSettings } from '@/components/monetization/MonetizationSettings';
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
    const adPlacements = (profile?.adPlacements as { position: string; type: string }[]) || [];

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
                    <AdNetworkConfig
                        domainId={id}
                        initialNetwork={profile?.adNetwork || 'none'}
                        initialNetworkId={profile?.adNetworkId || null}
                        initialPlacements={adPlacements}
                    />
                </TabsContent>

                <TabsContent value="settings">
                    <MonetizationSettings
                        domainId={id}
                        initialLeadGenEnabled={profile?.leadGenEnabled || false}
                        initialLeadGenFormType={profile?.leadGenFormType || null}
                        initialLeadGenEndpoint={profile?.leadGenEndpoint || null}
                        initialLeadGenValue={profile?.leadGenValue ?? null}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}
