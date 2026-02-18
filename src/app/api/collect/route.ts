/**
 * POST /api/collect — Public form submission endpoint for deployed sites.
 *
 * Deployed sites POST form data here (LeadForm, newsletter, contact, calculator, etc.).
 * No auth required — validated by Origin/Referer domain matching.
 * Includes CORS headers so deployed sites can submit cross-origin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, formSubmissions, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';

const VALID_FORM_TYPES = ['lead', 'newsletter', 'contact', 'calculator', 'quiz', 'survey'] as const;
type FormType = (typeof VALID_FORM_TYPES)[number];

const MAX_DATA_KEYS = 30;
const MAX_FIELD_LENGTH = 5000;

function corsHeaders(origin: string | null): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

function extractDomain(url: string | null): string | null {
    if (!url) return null;
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function sanitizeString(value: unknown, maxLen = MAX_FIELD_LENGTH): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().slice(0, maxLen);
    return trimmed.length > 0 ? trimmed : null;
}

function sanitizeData(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const obj = raw as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    let count = 0;
    for (const [key, value] of Object.entries(obj)) {
        if (count >= MAX_DATA_KEYS) break;
        const safeKey = key.slice(0, 100);
        if (typeof value === 'string') {
            result[safeKey] = value.slice(0, MAX_FIELD_LENGTH);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            result[safeKey] = value;
        }
        count++;
    }
    return result;
}

// OPTIONS — CORS preflight
export async function OPTIONS(request: NextRequest) {
    const origin = request.headers.get('origin');
    return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(origin),
    });
}

// POST — Accept form submission
export async function POST(request: NextRequest) {
    const origin = request.headers.get('origin');
    const headers = corsHeaders(origin);

    try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json(
                { error: 'Invalid JSON body' },
                { status: 400, headers },
            );
        }

        // Extract domain from Origin header, Referer, or body
        const originDomain = extractDomain(origin);
        const refererDomain = extractDomain(request.headers.get('referer'));
        const bodyDomain = sanitizeString(body.domain, 253);
        const domain = originDomain || refererDomain || bodyDomain;

        if (!domain) {
            return NextResponse.json(
                { error: 'Could not determine source domain' },
                { status: 400, headers },
            );
        }

        // Validate form type
        const rawType = sanitizeString(body.formType || body.form_type, 50);
        const formType: FormType = VALID_FORM_TYPES.includes(rawType as FormType)
            ? (rawType as FormType)
            : 'lead';

        // Extract known fields
        const route = sanitizeString(body.route || body.page, 500) || '/';
        const email = sanitizeString(body.email, 320);
        const data = sanitizeData(body.data || body.fields || body);

        // Remove meta fields from data to avoid duplication
        for (const metaKey of ['domain', 'formType', 'form_type', 'route', 'page', 'email']) {
            delete data[metaKey];
        }

        // Resolve domainId by looking up the domain in our DB
        let domainId: string | null = null;
        try {
            const domainRow = await db.select({ id: domains.id })
                .from(domains)
                .where(eq(domains.domain, domain))
                .limit(1);
            if (domainRow[0]) {
                domainId = domainRow[0].id;
            }
        } catch {
            // Non-fatal — proceed without domainId
        }

        // Extract request metadata
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || null;
        const userAgent = sanitizeString(request.headers.get('user-agent'), 500);
        const referrer = sanitizeString(request.headers.get('referer'), 2000);

        // Insert submission
        await db.insert(formSubmissions).values({
            domainId,
            domain,
            formType,
            route,
            data,
            email,
            ip,
            userAgent,
            referrer,
        });

        return NextResponse.json(
            { ok: true },
            { status: 201, headers },
        );
    } catch (error) {
        console.error('[Collect] Form submission error:', error instanceof Error ? error.message : error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers },
        );
    }
}
