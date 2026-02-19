'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Save, Send, RotateCcw, ShieldAlert } from 'lucide-react';

type ChecklistItem = {
  id: string;
  category: string;
  label: string;
  required: boolean;
};

type QaData = {
  checklist: {
    id: string | null;
    name: string;
    items: ChecklistItem[];
  };
  latestResult: {
    allPassed: boolean;
    results: Record<string, { checked: boolean; notes?: string }>;
    completedAt: string;
    unitTestPassId?: string | null;
  } | null;
};

type ArticleInfo = {
  id: string;
  title: string | null;
  status: string | null;
  ymylLevel: string | null;
  contentType: string | null;
};

type Me = { id: string; role: 'admin' | 'editor' | 'reviewer' | 'expert'; name: string };

const ROLE_LEVEL: Record<Me['role'], number> = { editor: 1, reviewer: 2, expert: 3, admin: 4 };

function parseIssueCodes(raw: string): string[] {
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function isToolContentType(contentType: string | null): boolean {
  return contentType === 'calculator'
    || contentType === 'wizard'
    || contentType === 'configurator'
    || contentType === 'quiz'
    || contentType === 'survey'
    || contentType === 'assessment'
    || contentType === 'interactive_infographic'
    || contentType === 'interactive_map';
}

export function ToolReviewPanel({ articleId }: { articleId: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [qa, setQa] = useState<QaData | null>(null);
  const [article, setArticle] = useState<ArticleInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [unitTestPassId, setUnitTestPassId] = useState('');

  // Decision fields (structured rationale)
  const [rationale, setRationale] = useState('');
  const [evidenceQuality, setEvidenceQuality] = useState<'strong' | 'moderate' | 'weak'>('moderate');
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [confidenceScore, setConfidenceScore] = useState(70);
  const [issueCodesInput, setIssueCodesInput] = useState('');
  const [citationsChecked, setCitationsChecked] = useState(false);
  const [disclosureChecked, setDisclosureChecked] = useState(false);

  const [methodologyCheck, setMethodologyCheck] = useState<'passed' | 'needs_changes' | 'missing'>('passed');
  const [formulaCoverage, setFormulaCoverage] = useState<'full' | 'partial' | 'none'>('full');
  const [edgeCasesTested, setEdgeCasesTested] = useState(false);
  const [unitsVerified, setUnitsVerified] = useState(false);

  const [branchingLogicValidated, setBranchingLogicValidated] = useState(false);
  const [eligibilityCopyClear, setEligibilityCopyClear] = useState(false);
  const [fallbackPathTested, setFallbackPathTested] = useState(false);

  const [submitting, setSubmitting] = useState<'qa' | 'status' | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [meRes, qaRes, articleRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch(`/api/articles/${articleId}/qa`),
        fetch(`/api/articles/${articleId}`),
      ]);

      if (!meRes.ok) throw new Error('Failed to load user session');
      if (!qaRes.ok) throw new Error('Failed to load QA checklist');
      if (!articleRes.ok) throw new Error('Failed to load article');

      const meJson = await meRes.json();
      const qaJson = await qaRes.json();
      const articleJson = await articleRes.json();

      setMe({ id: meJson.id, role: meJson.role, name: meJson.name });
      setQa(qaJson as QaData);
      setArticle({
        id: articleJson.id,
        title: articleJson.title ?? null,
        status: articleJson.status ?? null,
        ymylLevel: articleJson.ymylLevel ?? null,
        contentType: articleJson.contentType ?? null,
      });

      const latest = (qaJson as QaData).latestResult?.results ?? {};
      const nextChecked: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(latest)) {
        nextChecked[k] = Boolean(v?.checked);
      }
      setChecked(nextChecked);
      setUnitTestPassId(typeof (qaJson as QaData).latestResult?.unitTestPassId === 'string'
        ? (qaJson as QaData).latestResult!.unitTestPassId!
        : '');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load review panel');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const checklistItems = qa?.checklist.items ?? [];
  const requiredIds = checklistItems.filter((i) => i.required).map((i) => i.id);
  const requiredPassedCount = requiredIds.filter((id) => checked[id]).length;
  const allRequiredChecked = requiredIds.every((id) => checked[id]);

  const hasCalcIntegrityItem = checklistItems.some((item) => item.id === 'calc_tested');
  const currentStatus = article?.status ?? 'draft';
  const contentType = article?.contentType ?? null;
  const toolLike = isToolContentType(contentType);
  const unsupportedDecisionType = contentType === 'comparison'
    || contentType === 'review'
    || contentType === 'lead_capture'
    || contentType === 'health_decision';

  const canApprove = me ? ROLE_LEVEL[me.role] >= ROLE_LEVEL.reviewer : false;

  function buildStructuredRationale() {
    const base = {
      summary: rationale.trim(),
      evidenceQuality,
      riskLevel,
      confidenceScore,
      issueCodes: parseIssueCodes(issueCodesInput),
      citationsChecked,
      disclosureChecked,
    };

    if (contentType === 'calculator') {
      return { ...base, methodologyCheck, formulaCoverage, edgeCasesTested, unitsVerified };
    }
    if (
      contentType === 'wizard'
      || contentType === 'configurator'
      || contentType === 'quiz'
      || contentType === 'survey'
      || contentType === 'assessment'
    ) {
      return { ...base, branchingLogicValidated, eligibilityCopyClear, fallbackPathTested };
    }

    // General fallback (still valid for transitions that don't require structured rationale)
    return { ...base, factualityAssessment: 'verified', structureQuality: 'adequate' };
  }

  async function saveQa() {
    if (!qa) return;
    setSubmitting('qa');
    try {
      const results: Record<string, { checked: boolean }> = {};
      for (const item of qa.checklist.items) {
        results[item.id] = { checked: Boolean(checked[item.id]) };
      }

      const res = await fetch(`/api/articles/${articleId}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: qa.checklist.id,
          results,
          unitTestPassId: unitTestPassId.trim() || null,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save QA');
      }

      toast.success('QA saved');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save QA');
    } finally {
      setSubmitting(null);
    }
  }

  async function transition(toStatus: string) {
    setSubmitting('status');
    try {
      const res = await fetch(`/api/articles/${articleId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: toStatus,
          rationale,
          rationaleDetails: buildStructuredRationale(),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = Array.isArray(body.details) ? ` ${body.details.join('; ')}` : '';
        throw new Error((body.error || 'Status transition failed') + details);
      }

      toast.success(`Moved to ${body.newStatus || toStatus}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status transition failed');
    } finally {
      setSubmitting(null);
    }
  }

  const approveDisabledReason = (() => {
    if (unsupportedDecisionType) return 'Use the Full QA form for this content type';
    if (!canApprove) return 'Requires reviewer role';
    if (currentStatus !== 'review') return 'Article is not in review';
    if (!qa) return 'QA not loaded';
    if (!allRequiredChecked) return 'All required QA items must be checked';
    if (rationale.trim().length < 20) return 'Rationale must be at least 20 characters';
    return null;
  })();

  const sendBackDisabledReason = (() => {
    if (unsupportedDecisionType) return 'Use the Full QA form for this content type';
    if (!canApprove) return 'Requires reviewer role';
    if (!(currentStatus === 'review' || currentStatus === 'approved')) return 'Only review/approved can be sent back';
    if (rationale.trim().length < 20) return 'Rationale must be at least 20 characters';
    if (parseIssueCodes(issueCodesInput).length === 0) return 'At least one issue code is required';
    return null;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!qa || !article) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Failed to load review panel.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">
              {article.title || 'Untitled'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {toolLike ? 'Tool review mode' : 'Content review mode'}
            </p>
          </div>
          <Badge variant="outline" className="capitalize text-[10px]">
            {currentStatus}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {contentType && (
            <Badge variant="secondary" className="capitalize text-[10px]">
              {contentType.replaceAll('_', ' ')}
            </Badge>
          )}
          {article.ymylLevel && article.ymylLevel !== 'none' && (
            <Badge variant="outline" className="capitalize text-[10px]">
              <ShieldAlert className="mr-1 h-3 w-3" />
              YMYL {article.ymylLevel}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/content/articles/${articleId}`} className="text-xs text-primary hover:underline">
            Open editor
          </Link>
          <span className="text-xs text-muted-foreground">·</span>
          <Link href={`/dashboard/content/articles/${articleId}/review`} className="text-xs text-primary hover:underline">
            Full QA form
          </Link>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2 flex items-center justify-between">
          <p className="text-xs font-semibold">QA Checklist</p>
          <Badge variant="outline" className={cn('text-[10px]', allRequiredChecked ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700')}>
            Required {requiredPassedCount}/{requiredIds.length}
          </Badge>
        </div>
        <div className="p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Template: <span className="font-medium text-foreground">{qa.checklist.name}</span>
          </p>
          <div className="space-y-1.5">
            {checklistItems.map((item) => (
              <label
                key={item.id}
                className={cn(
                  'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer',
                  checked[item.id] ? 'bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900' : 'hover:bg-muted/40',
                )}
              >
                <input
                  type="checkbox"
                  checked={Boolean(checked[item.id])}
                  onChange={() => setChecked((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                  className="mt-0.5 h-4 w-4"
                />
                <div className="min-w-0">
                  <p className={cn('leading-snug', checked[item.id] && 'line-through text-muted-foreground')}>
                    {item.label}
                    {item.required && <span className="ml-1 text-red-500">*</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{item.category}</p>
                </div>
              </label>
            ))}
          </div>

          {contentType === 'calculator' && hasCalcIntegrityItem && (
            <div className="pt-2 space-y-1">
              <Label htmlFor="unitTestPassId" className="text-xs">Deterministic unit test pass ID (optional unless calc_tested is checked)</Label>
              <Input
                id="unitTestPassId"
                value={unitTestPassId}
                onChange={(e) => setUnitTestPassId(e.target.value)}
                placeholder="e.g. calc-ci-2026-02-18.2201"
              />
            </div>
          )}

          <Button onClick={saveQa} disabled={submitting !== null} size="sm" className="w-full">
            {submitting === 'qa' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save QA
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-semibold">Decision</p>
          <p className="text-[11px] text-muted-foreground">Required to approve / send back.</p>
        </div>
        <div className="p-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="rationale" className="text-xs">Rationale / notes</Label>
            <textarea
              id="rationale"
              className="w-full min-h-[90px] rounded-md border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-purple-500"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="What you tested, what passed/failed, and why you’re approving or sending back…"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="evidenceQuality">Evidence</Label>
              <select
                id="evidenceQuality"
                className="w-full rounded-md border bg-background p-2 text-xs"
                value={evidenceQuality}
                onChange={(e) => setEvidenceQuality(e.target.value as 'strong' | 'moderate' | 'weak')}
              >
                <option value="strong">Strong</option>
                <option value="moderate">Moderate</option>
                <option value="weak">Weak</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="riskLevel">Risk</Label>
              <select
                id="riskLevel"
                className="w-full rounded-md border bg-background p-2 text-xs"
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value as 'low' | 'medium' | 'high')}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="confidenceScore">Confidence (0–100)</Label>
              <Input
                id="confidenceScore"
                type="number"
                min={0}
                max={100}
                value={confidenceScore}
                onChange={(e) => setConfidenceScore(Number.parseInt(e.target.value || '0', 10))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="issueCodes">Issue codes</Label>
              <Input
                id="issueCodes"
                value={issueCodesInput}
                onChange={(e) => setIssueCodesInput(e.target.value)}
                placeholder="edge_cases,units,calc_logic"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={citationsChecked} onChange={(e) => setCitationsChecked(e.target.checked)} />
              Citations checked
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={disclosureChecked} onChange={(e) => setDisclosureChecked(e.target.checked)} />
              Disclosures checked
            </label>
          </div>

          {contentType === 'calculator' && (
            <div className="rounded-md border bg-muted/20 p-2 space-y-2">
              <p className="text-xs font-medium">Calculator integrity</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="methodologyCheck">Methodology</Label>
                  <select
                    id="methodologyCheck"
                    className="w-full rounded-md border bg-background p-2 text-xs"
                    value={methodologyCheck}
                    onChange={(e) => setMethodologyCheck(e.target.value as 'passed' | 'needs_changes' | 'missing')}
                  >
                    <option value="passed">Passed</option>
                    <option value="needs_changes">Needs changes</option>
                    <option value="missing">Missing</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="formulaCoverage">Formula coverage</Label>
                  <select
                    id="formulaCoverage"
                    className="w-full rounded-md border bg-background p-2 text-xs"
                    value={formulaCoverage}
                    onChange={(e) => setFormulaCoverage(e.target.value as 'full' | 'partial' | 'none')}
                  >
                    <option value="full">Full</option>
                    <option value="partial">Partial</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={edgeCasesTested} onChange={(e) => setEdgeCasesTested(e.target.checked)} />
                  Edge cases tested
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={unitsVerified} onChange={(e) => setUnitsVerified(e.target.checked)} />
                  Units verified
                </label>
              </div>
            </div>
          )}

          {(contentType === 'wizard' || contentType === 'configurator' || contentType === 'quiz' || contentType === 'survey' || contentType === 'assessment') && (
            <div className="rounded-md border bg-muted/20 p-2 space-y-2">
              <p className="text-xs font-medium">Interactive logic</p>
              <div className="grid grid-cols-1 gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={branchingLogicValidated} onChange={(e) => setBranchingLogicValidated(e.target.checked)} />
                  Branching logic validated
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={eligibilityCopyClear} onChange={(e) => setEligibilityCopyClear(e.target.checked)} />
                  Eligibility copy is clear
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={fallbackPathTested} onChange={(e) => setFallbackPathTested(e.target.checked)} />
                  Fallback path tested
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => transition('approved')}
              disabled={submitting !== null || approveDisabledReason !== null}
              size="sm"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting === 'status' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Approve
            </Button>
            {approveDisabledReason && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                <ShieldAlert className="inline-block mr-1 h-3 w-3" />
                {approveDisabledReason}
              </p>
            )}

            <Button
              onClick={() => transition('draft')}
              disabled={submitting !== null || sendBackDisabledReason !== null}
              size="sm"
              variant="outline"
              className="w-full"
            >
              {submitting === 'status' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Send back to draft
            </Button>
            {sendBackDisabledReason && (
              <p className="text-[11px] text-muted-foreground">
                {sendBackDisabledReason}
              </p>
            )}

            {currentStatus === 'draft' && (
              <Button
                onClick={() => transition('review')}
                disabled={submitting !== null}
                size="sm"
                variant="secondary"
                className="w-full"
              >
                <Send className="mr-2 h-4 w-4" />
                Submit for review
              </Button>
            )}

            {!canApprove && (
              <div className="rounded-md border bg-muted/20 p-2 text-[11px] text-muted-foreground flex items-start gap-2">
                <XCircle className="mt-0.5 h-3.5 w-3.5" />
                <p>
                  You’re logged in as <span className="font-medium">{me?.role || 'editor'}</span>. You can save QA, but approvals require reviewer+.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

