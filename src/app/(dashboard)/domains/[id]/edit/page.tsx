import Link from 'next/link';
import { notFound } from 'next/navigation';
import DomainEditForm from './DomainEditForm';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';

interface PageProps {
    params: Promise<{ id: string }>;
}

async function getDomain(id: string) {
    try {
        const result = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
        return result[0] || null;
    } catch {
        return null;
    }
}

export default async function EditDomainPage({ params }: PageProps) {
    const { id } = await params;
    const domain = await getDomain(id);

    if (!domain) {
        notFound();
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href={`/dashboard/domains/${id}`}>
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Edit {domain.domain}</h1>
                    <p className="text-muted-foreground">Update domain information</p>
                </div>
            </div>

            <DomainEditForm domain={domain} />
        </div>
    );
}
