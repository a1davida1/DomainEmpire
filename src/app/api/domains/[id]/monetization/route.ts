import { NextRequest, NextResponse } from 'next/server';
import { db, monetizationProfiles, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Stricter ctaTemplates schema with XSS protection
const ctaTemplateSchema = z.object({
    name: z.string().max(200),
    // Limit HTML length and note: actual sanitization should happen server-side before rendering
    html: z.string().max(10000),
    placement: z.string().max(100),
    // Stricter conditions schema - only allow known primitive types
    conditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const monetizationSchema = z.object({
    adNetwork: z.enum(['ezoic', 'mediavine', 'adsense', 'none']).optional(),
    adNetworkId: z.string().nullable().optional(),
    adPlacements: z.array(z.object({ position: z.string(), type: z.string() })).optional(),
    affiliates: z.array(z.object({
        provider: z.string(),
        programId: z.string(),
        linkTemplate: z.string(),
        commissionType: z.string(),
        commissionValue: z.number(),
    })).optional(),
    ctaTemplates: z.array(ctaTemplateSchema).optional(),
    leadGenEnabled: z.boolean().optional(),
    leadGenFormType: z.string().nullable().optional(),
    leadGenEndpoint: z.string().nullable().optional(),
    leadGenValue: z.number().nullable().optional(),
});

interface PageProps {
    params: Promise<{ id: string }>;
}

/**
 * HTML sanitization to prevent XSS.
 * TODO: For production, install and use `sanitize-html` npm package:
 *   npm install sanitize-html @types/sanitize-html
 * Then replace this function with:
 *   import sanitizeHtmlLib from 'sanitize-html';
 *   const sanitizedHtml = sanitizeHtmlLib(html, { allowedTags: [...], allowedAttributes: {...} });
 */
function sanitizeHtml(html: string): string {
    // Decode HTML entities first to catch encoded attacks
    const decoded = html
        .replaceAll(/&#x?[0-9a-f]+;/gi, ' ')
        .replaceAll(/&[a-z]+;/gi, ' ');

    // Remove dangerous patterns
    return decoded
        .replaceAll(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replaceAll(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replaceAll(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
        .replaceAll(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replaceAll(/<embed[^>]*>/gi, '')
        .replaceAll(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replaceAll(/on\w+\s*=\s*[^\s>]*/gi, '')
        .replaceAll(/javascript:/gi, '')
        .replaceAll(/vbscript:/gi, '')
        .replaceAll(/data:/gi, 'data-blocked:')
        .replaceAll(/expression\s*\(/gi, 'expression-blocked(');
}

export async function GET(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const domain = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
        if (domain.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        // Note: Ownership check not required for single-operator system
        // If multi-user support is added, verify domain ownership here

        const profile = await db.select().from(monetizationProfiles).where(eq(monetizationProfiles.domainId, id)).limit(1);

        if (profile.length === 0) {
            return NextResponse.json({
                domainId: id,
                adNetwork: 'none',
                adNetworkId: null,
                adPlacements: [],
                affiliates: [],
                ctaTemplates: [],
                leadGenEnabled: false,
            });
        }

        return NextResponse.json(profile[0]);
    } catch (error) {
        console.error('Get monetization failed:', error);
        return NextResponse.json({ error: 'Failed to get monetization profile' }, { status: 500 });
    }
}

export async function POST(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        // Parse JSON with explicit error handling for malformed JSON
        let body: unknown;
        try {
            body = await request.json();
        } catch (jsonError) {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Invalid JSON in request body' },
                { status: 400 }
            );
        }

        const data = monetizationSchema.parse(body);

        const domain = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
        if (domain.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        // Note: Ownership check not required for single-operator system
        // If multi-user support is added, verify domain ownership here

        // Sanitize HTML in ctaTemplates to prevent XSS
        const sanitizedCtaTemplates = data.ctaTemplates?.map(template => ({
            ...template,
            html: sanitizeHtml(template.html),
        }));

        const updateData = {
            adNetwork: data.adNetwork,
            adNetworkId: data.adNetworkId,
            adPlacements: data.adPlacements,
            affiliates: data.affiliates,
            ctaTemplates: sanitizedCtaTemplates,
            leadGenEnabled: data.leadGenEnabled,
            leadGenFormType: data.leadGenFormType,
            leadGenEndpoint: data.leadGenEndpoint,
            leadGenValue: data.leadGenValue,
            updatedAt: new Date(),
        };

        // Check if profile exists before upsert to reliably detect creation
        const existingProfile = await db
            .select({ id: monetizationProfiles.id })
            .from(monetizationProfiles)
            .where(eq(monetizationProfiles.domainId, id))
            .limit(1);

        const isCreating = existingProfile.length === 0;

        // Use atomic upsert to avoid race condition and TOCTOU issues
        const upsertResult = await db
            .insert(monetizationProfiles)
            .values({
                domainId: id,
                adNetwork: data.adNetwork || 'none',
                adNetworkId: data.adNetworkId,
                adPlacements: data.adPlacements || [],
                affiliates: data.affiliates || [],
                ctaTemplates: sanitizedCtaTemplates || [],
                leadGenEnabled: data.leadGenEnabled || false,
                leadGenFormType: data.leadGenFormType,
                leadGenEndpoint: data.leadGenEndpoint,
                leadGenValue: data.leadGenValue,
            })
            .onConflictDoUpdate({
                target: monetizationProfiles.domainId,
                set: updateData,
            })
            .returning();

        return NextResponse.json(upsertResult[0], { status: isCreating ? 201 : 200 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        console.error('Update monetization failed:', error);
        return NextResponse.json({ error: 'Failed to update monetization profile' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        // First verify domain exists
        const domain = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
        if (domain.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        // Note: Ownership check not required for single-operator system
        // If multi-user support is added, verify domain ownership here

        await db.delete(monetizationProfiles).where(eq(monetizationProfiles.domainId, id));
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete monetization failed:', error);
        return NextResponse.json({ error: 'Failed to delete monetization profile' }, { status: 500 });
    }
}
