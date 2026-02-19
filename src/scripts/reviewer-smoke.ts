/**
 * Reviewer Workbench smoke test (real HTTP calls).
 *
 * Creates a temporary domain + calculator article + reviewer user,
 * logs in via /api/auth/login, then exercises the endpoints used by the UI:
 * - GET /api/auth/me
 * - GET /api/articles/:id/review-readiness
 * - GET /api/articles/:id/qa
 * - POST /api/articles/:id/qa
 * - POST /api/articles/:id/status (submit for review)
 * - POST /api/articles/:id/status (approve)
 *
 * Cleanup runs at the end (best-effort).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { articles, domains, reviewTasks, users } from '@/lib/db/schema';
import { createUser } from '@/lib/auth';
import { eq } from 'drizzle-orm';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

type HttpResult = { status: number; headers: Headers; text: string; json: unknown | null };

function parseSessionCookie(setCookie: string | null): string {
    if (!setCookie) throw new Error('Missing Set-Cookie header from login response');
    const match = setCookie.match(/(?:^|;\s*)de-session=([^;]+)/i);
    if (!match) throw new Error(`Set-Cookie did not include de-session: ${setCookie}`);
    return `de-session=${match[1]}`;
}

async function httpJson(opts: {
    method: 'GET' | 'POST';
    path: string;
    cookie?: string;
    body?: unknown;
}): Promise<HttpResult> {
    const headers: Record<string, string> = {
        accept: 'application/json',
    };
    if (opts.cookie) headers.cookie = opts.cookie;
    if (opts.method === 'POST') {
        headers['content-type'] = 'application/json';
        headers['x-requested-with'] = 'xmlhttprequest';
    }

    const res = await fetch(`${BASE_URL}${opts.path}`, {
        method: opts.method,
        headers,
        body: opts.method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
        redirect: 'manual',
    });

    const text = await res.text();
    let json: unknown | null = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }
    return { status: res.status, headers: res.headers, text, json };
}

function logStep(name: string, res: HttpResult, expect?: { status?: number | number[] }) {
    const expected = expect?.status;
    const expectedStatuses = Array.isArray(expected) ? expected : (typeof expected === 'number' ? [expected] : null);
    const ok = expectedStatuses
        ? expectedStatuses.includes(res.status)
        : (res.status >= 200 && res.status < 300);
    const tag = ok ? 'OK' : 'FAIL';
    console.log(`\n[${tag}] ${name} → ${res.status}`);
    if (!ok) {
        const excerpt = res.text.length > 1200 ? `${res.text.slice(0, 1200)}…` : res.text;
        console.log(excerpt || '(empty body)');
    }
}

async function main() {
    const runId = randomUUID().slice(0, 8);
    const email = `reviewer.smoke+${runId}@domainempire.local`;
    const password = `Smoke-${runId}-Pass!`;

    const domainName = `reviewer-smoke-${runId}.com`;
    const slug = `reviewer-smoke-${runId}`;

    const htmlCalculator = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Smoke Calculator</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px;">
  <h1>Smoke Calculator</h1>
  <p>
    This page is a fixture used to validate the reviewer workflow for interactive tools.
    It intentionally includes an explanation section so the content quality gate can be
    evaluated realistically for a calculator format (instructions, assumptions, and limitations).
  </p>
  <h2>How to use this calculator</h2>
  <p>
    Enter two numbers, then click Calculate to see the result. Use this tool to sanity-check
    simple addition and confirm that UI inputs, validation, and output rendering work correctly.
    If you enter a blank value, the calculator treats it as zero. If you enter a negative value,
    the calculator will still compute a result, but you should decide whether negative numbers
    are meaningful for your real-world use case. The purpose of this section is to provide clear
    user guidance, document assumptions, and demonstrate that the tool includes enough explanatory
    content to be reviewable on its own.
  </p>
  <p>
    Methodology: the tool parses both inputs as numbers, applies a simple formula, and prints the
    computed output. Edge cases to test include very large numbers, decimals, empty fields, and
    copy-paste input. If you expand this into a real calculator, you should also include a short
    FAQ, cite any non-trivial claims, and add the appropriate disclosures for your domain and YMYL
    level. Reviewers should verify that labels are clear, that units are correct, and that the
    calculator behaves consistently across browsers.
  </p>
  <form id="f" style="display:flex; gap: 12px; align-items:end; flex-wrap:wrap;">
    <label>Value A <input id="a" type="number" value="2" /></label>
    <label>Value B <input id="b" type="number" value="3" /></label>
    <button type="submit">Calculate</button>
  </form>
  <p id="out" style="margin-top: 16px; font-weight: 600;"></p>
  <script>
    const f = document.getElementById('f');
    const out = document.getElementById('out');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const a = Number(document.getElementById('a').value || 0);
      const b = Number(document.getElementById('b').value || 0);
      out.textContent = 'Result: ' + (a + b);
    });
  </script>
</body>
</html>`;

    let domainId: string | null = null;
    let articleId: string | null = null;
    let reviewTaskId: string | null = null;
    let userId: string | null = null;

    try {
        // --- Fixtures ---
        userId = await createUser({
            email,
            name: `Reviewer Smoke ${runId}`,
            password,
            role: 'reviewer',
        });

        const insertedDomain = await db
            .insert(domains)
            .values({
                domain: domainName,
                tld: 'com',
                niche: 'smoke test',
                bucket: 'build',
                status: 'active',
            })
            .returning({ id: domains.id });
        domainId = insertedDomain[0]?.id ?? null;
        if (!domainId) throw new Error('Failed to insert domain fixture');

        const insertedArticle = await db
            .insert(articles)
            .values({
                domainId,
                title: `Smoke Calculator (${runId})`,
                slug,
                status: 'draft',
                ymylLevel: 'medium',
                contentType: 'calculator',
                contentMarkdown: htmlCalculator,
                metaDescription: 'Smoke test calculator for reviewer workbench.',
                calculatorConfig: {
                    inputs: [
                        { id: 'a', label: 'Value A', type: 'number', default: 2, min: 0, max: 100, step: 1 },
                        { id: 'b', label: 'Value B', type: 'number', default: 3, min: 0, max: 100, step: 1 },
                    ],
                    outputs: [{ id: 'sum', label: 'Sum', format: 'number', decimals: 0 }],
                    formula: 'sum = a + b',
                    assumptions: ['Inputs are numbers'],
                    methodology: 'Adds two numbers and displays the sum.',
                },
            })
            .returning({ id: articles.id });
        articleId = insertedArticle[0]?.id ?? null;
        if (!articleId) throw new Error('Failed to insert article fixture');

        console.log(`[Fixture] domainId=${domainId} articleId=${articleId} reviewer=${email}`);

        // --- Login ---
        const loginRes = await httpJson({
            method: 'POST',
            path: '/api/auth/login',
            body: { email, password },
        });
        logStep('POST /api/auth/login', loginRes, { status: 200 });
        if (loginRes.status !== 200) throw new Error('Login failed; cannot continue');

        const cookie = parseSessionCookie(loginRes.headers.get('set-cookie'));

        // --- Session check ---
        const meRes = await httpJson({ method: 'GET', path: '/api/auth/me', cookie });
        logStep('GET /api/auth/me', meRes, { status: 200 });

        // --- Submit for review (creates a content_publish review task) ---
        const submitRes = await httpJson({
            method: 'POST',
            path: `/api/articles/${articleId}/status`,
            cookie,
            body: { status: 'review' },
        });
        logStep('POST /api/articles/:id/status (submit for review)', submitRes, { status: 200 });
        if (submitRes.status !== 200 || !submitRes.json || typeof submitRes.json !== 'object') {
            throw new Error('Submit-for-review failed; cannot continue');
        }
        const submitJson = submitRes.json as Record<string, unknown>;
        reviewTaskId = typeof submitJson.reviewTaskId === 'string' ? submitJson.reviewTaskId : null;
        if (!reviewTaskId) {
            throw new Error('Submit-for-review did not return reviewTaskId (content_publish task missing)');
        }

        // --- Workbench page render (server component) ---
        const pageRes = await fetch(`${BASE_URL}/dashboard/reviewer?taskId=${reviewTaskId}`, {
            method: 'GET',
            headers: { cookie },
            redirect: 'manual',
        });
        console.log(`\n[${pageRes.status >= 200 && pageRes.status < 300 ? 'OK' : 'FAIL'}] GET /dashboard/reviewer → ${pageRes.status}`);

        // --- Review readiness gates ---
        const readinessRes = await httpJson({ method: 'GET', path: `/api/articles/${articleId}/review-readiness`, cookie });
        logStep('GET /api/articles/:id/review-readiness', readinessRes, { status: 200 });

        // --- QA fetch ---
        const qaRes = await httpJson({ method: 'GET', path: `/api/articles/${articleId}/qa`, cookie });
        logStep('GET /api/articles/:id/qa', qaRes, { status: 200 });
        if (qaRes.status !== 200 || !qaRes.json || typeof qaRes.json !== 'object') {
            throw new Error('QA GET failed; cannot continue');
        }
        const qaJson = qaRes.json as Record<string, unknown>;
        const checklist = (qaJson.checklist && typeof qaJson.checklist === 'object' && !Array.isArray(qaJson.checklist))
            ? (qaJson.checklist as Record<string, unknown>)
            : null;
        const rawItems = checklist?.items;
        const checklistItems = Array.isArray(rawItems) ? rawItems : [];
        const templateId = typeof checklist?.id === 'string' ? checklist.id : null;

        // Build results: mark required items true; optional false
        const results: Record<string, { checked: boolean }> = {};
        for (const item of checklistItems) {
            const row = (item && typeof item === 'object' && !Array.isArray(item)) ? (item as Record<string, unknown>) : null;
            const id = typeof row?.id === 'string' ? row.id : '';
            const required = Boolean(row?.required);
            if (!id) continue;
            results[id] = { checked: required };
        }
        // Explicitly check calc_tested to validate deterministic test pass enforcement
        results.calc_tested = { checked: true };

        // --- QA submit (expected to fail without unitTestPassId if calc_tested checked) ---
        const qaPost1 = await httpJson({
            method: 'POST',
            path: `/api/articles/${articleId}/qa`,
            cookie,
            body: { templateId, results },
        });
        logStep('POST /api/articles/:id/qa (missing unitTestPassId)', qaPost1, { status: 400 });

        // --- QA submit with unitTestPassId ---
        const qaPost2 = await httpJson({
            method: 'POST',
            path: `/api/articles/${articleId}/qa`,
            cookie,
            body: {
                templateId,
                results,
                unitTestPassId: `calc-smoke-${runId}.0001`,
                calculationHarnessVersion: 'calculator-harness.v1',
            },
        });
        logStep('POST /api/articles/:id/qa (with unitTestPassId)', qaPost2, { status: 200 });

        // --- Attempt approval ---
        const approveRes = await httpJson({
            method: 'POST',
            path: `/api/articles/${articleId}/status`,
            cookie,
            body: {
                status: 'approved',
                rationale: `Reviewed calculator fixture ${runId}. QA completed and deterministic test pass recorded.`,
                rationaleDetails: {
                    summary: `Reviewed calculator fixture ${runId}. Tested inputs/outputs and verified expected behavior.`,
                    evidenceQuality: 'moderate',
                    riskLevel: 'low',
                    confidenceScore: 80,
                    issueCodes: [],
                    citationsChecked: true,
                    disclosureChecked: true,
                    methodologyCheck: 'passed',
                    formulaCoverage: 'full',
                    edgeCasesTested: true,
                    unitsVerified: true,
                },
            },
        });
        logStep('POST /api/articles/:id/status (approve)', approveRes, { status: 200 });

        // --- Preview endpoint used by the workbench iframe ---
        const previewRes = await fetch(`${BASE_URL}/api/domains/${domainId}/preview?articleId=${articleId}`, {
            method: 'GET',
            headers: { cookie },
            redirect: 'manual',
        });
        console.log(`\n[${previewRes.status >= 200 && previewRes.status < 300 ? 'OK' : 'FAIL'}] GET /api/domains/:id/preview?articleId=… → ${previewRes.status}`);
        if (!(previewRes.status >= 200 && previewRes.status < 300)) {
            const body = await previewRes.text();
            console.log(body.slice(0, 1200));
        }
    } finally {
        // Best-effort cleanup
        try {
            if (reviewTaskId) {
                await db.delete(reviewTasks).where(eq(reviewTasks.id, reviewTaskId));
            }
            if (domainId) {
                await db.delete(domains).where(eq(domains.id, domainId));
            } else if (articleId) {
                await db.delete(articles).where(eq(articles.id, articleId));
            }
        } catch (e) {
            console.warn('[Cleanup] Failed to delete domain/article fixtures:', e);
        }
        try {
            if (userId) {
                await db.delete(users).where(eq(users.id, userId));
            }
        } catch (e) {
            console.warn('[Cleanup] Failed to delete user fixture:', e);
        }
    }
}

void main().catch((err) => {
    console.error('[Smoke] Reviewer workbench smoke test failed:', err);
    process.exitCode = 1;
});

