import { db } from '@/lib/db';
import { competitors, domains } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { addCompetitor } from '@/lib/competitors/monitor';
import { revalidatePath } from 'next/cache';


async function addCompetitorAction(formData: FormData) {
    'use server';
    const domainId = formData.get('domainId') as string;
    const competitorDomain = formData.get('competitorDomain') as string;
    if (!domainId || !competitorDomain) return;
    await addCompetitor(domainId, competitorDomain);
    revalidatePath('/dashboard/competitors');
}

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
            <h1 className="text-2xl font-bold tracking-tight">Competitor Monitoring</h1>

            {/* Add Competitor Form */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Add Competitor</h2>
                <form action={addCompetitorAction} className="flex flex-wrap gap-3 items-end">
                    <div>
                        <label htmlFor="domainId" className="text-sm text-muted-foreground block mb-1">Your Domain</label>
                        <select name="domainId" id="domainId" required className="border rounded-lg px-3 py-2 text-sm bg-background">
                            {allDomains.map(d => (
                                <option key={d.id} value={d.id}>{d.domain}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="competitorDomain" className="text-sm text-muted-foreground block mb-1">Competitor Domain</label>
                        <input type="text" name="competitorDomain" id="competitorDomain" required placeholder="example.com"
                            className="border rounded-lg px-3 py-2 text-sm bg-background" />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90">
                        Add Competitor
                    </button>
                </form>
            </div>

            {allCompetitors.length === 0 ? (
                <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">
                    <p className="text-lg mb-2">No competitors tracked yet</p>
                    <p className="text-sm">Use the form above to start tracking competitors.</p>
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
                                        <th className="text-right p-3">History</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comps.map(comp => {
                                        const topKw = (comp.topKeywords as Array<{ keyword: string; position: number; volume: number }>) || [];
                                        return (
                                            <tr key={comp.id} className="border-t">
                                                <td className="p-3">
                                                    <div className="font-medium">{comp.competitorDomain}</div>
                                                    {topKw.length > 0 && (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {topKw.slice(0, 5).map(kw => (
                                                                <span key={kw.keyword} className="px-1.5 py-0.5 bg-muted rounded text-xs text-muted-foreground"
                                                                    title={`Position: ${kw.position}, Volume: ${kw.volume}`}>
                                                                    {kw.keyword}
                                                                </span>
                                                            ))}
                                                            {topKw.length > 5 && (
                                                                <span className="text-xs text-muted-foreground">+{topKw.length - 5} more</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right">{comp.estimatedTraffic?.toLocaleString('en-US') || '—'}</td>
                                                <td className="p-3 text-right">{comp.domainAuthority || '—'}</td>
                                                <td className="p-3 text-right">{comp.totalPages?.toLocaleString('en-US') || '—'}</td>
                                                <td className="p-3">{comp.publishFrequency || '—'}</td>
                                                <td className="p-3 text-muted-foreground">
                                                    {comp.lastCheckedAt ? new Date(comp.lastCheckedAt).toLocaleDateString('en-US', { timeZone: 'UTC' }) : 'Never'}
                                                </td>
                                                <td className="p-3 text-right">
                                                    <span
                                                        className="px-2 py-1 bg-muted rounded text-xs text-muted-foreground cursor-not-allowed"
                                                        title="SERP history tracking coming soon"
                                                    >
                                                        History
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
