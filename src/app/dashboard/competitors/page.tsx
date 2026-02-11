import { db } from '@/lib/db';
import { competitors, domains } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export default async function CompetitorsPage() {
    const allDomains = await db.select({ id: domains.id, domain: domains.domain }).from(domains);
    const allCompetitors = await db.select().from(competitors).orderBy(desc(competitors.lastCheckedAt));

    // Group competitors by domain
    const domainMap = new Map<string, string>();
    for (const d of allDomains) domainMap.set(d.id, d.domain);

    const grouped = new Map<string, typeof allCompetitors>();
    for (const comp of allCompetitors) {
        const existing = grouped.get(comp.domainId) || [];
        existing.push(comp);
        grouped.set(comp.domainId, existing);
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Competitor Monitoring</h1>

            {allCompetitors.length === 0 ? (
                <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">
                    <p className="text-lg mb-2">No competitors tracked yet</p>
                    <p className="text-sm">Add competitors via the API: POST /api/competitors</p>
                </div>
            ) : (
                Array.from(grouped.entries()).map(([domainId, comps]) => (
                    <div key={domainId} className="bg-card rounded-lg border overflow-hidden">
                        <div className="p-4 border-b bg-muted/30">
                            <h2 className="text-lg font-semibold">
                                {domainMap.get(domainId) || domainId}
                            </h2>
                            <p className="text-sm text-muted-foreground">{comps.length} competitor(s)</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="text-left p-3">Competitor</th>
                                        <th className="text-right p-3">Est. Traffic</th>
                                        <th className="text-right p-3">DA</th>
                                        <th className="text-right p-3">Pages</th>
                                        <th className="text-left p-3">Frequency</th>
                                        <th className="text-left p-3">Last Checked</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comps.map(comp => (
                                        <tr key={comp.id} className="border-t">
                                            <td className="p-3 font-medium">{comp.competitorDomain}</td>
                                            <td className="p-3 text-right">{comp.estimatedTraffic?.toLocaleString() || '—'}</td>
                                            <td className="p-3 text-right">{comp.domainAuthority || '—'}</td>
                                            <td className="p-3 text-right">{comp.totalPages?.toLocaleString() || '—'}</td>
                                            <td className="p-3">{comp.publishFrequency || '—'}</td>
                                            <td className="p-3 text-muted-foreground">
                                                {comp.lastCheckedAt ? new Date(comp.lastCheckedAt).toLocaleDateString() : 'Never'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
