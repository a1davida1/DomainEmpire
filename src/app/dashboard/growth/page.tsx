'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    RefreshCw,
    Rocket,
    FolderOpen,
    KeyRound,
    AlertTriangle,
    Loader2,
    Play,
    Trash2,
    Upload,
    CheckCircle2,
    XCircle,
    Wrench,
    ClipboardCheck,
    Download,
} from 'lucide-react';

type GrowthChannel = 'pinterest' | 'youtube_shorts';
type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
type MediaAssetType = 'image' | 'video' | 'script' | 'voiceover';
type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'needs_changes';
type ProvenanceSource = 'manual_upload' | 'external_url' | 'ai_generated' | 'worker' | 'imported' | 'migrated';
type BulkMediaOperation = 'move_folder' | 'set_moderation' | 'add_tags' | 'remove_tags' | 'delete';

interface CampaignResearchSummary {
    id: string;
    domain: string;
    decision: string | null;
    decisionReason: string | null;
}

interface PromotionCampaign {
    id: string;
    domainResearchId: string;
    channels: GrowthChannel[];
    budget: number;
    status: CampaignStatus;
    dailyCap: number;
    createdAt: string;
    updatedAt: string | null;
    research?: CampaignResearchSummary | null;
}

interface CampaignListResponse {
    count: number;
    campaigns: PromotionCampaign[];
}

interface DomainResearchCandidate {
    id: string;
    domain: string;
    decision: string | null;
    recommendedMaxBid: number | null;
    confidenceScore: number | null;
}

interface CandidateListResponse {
    candidates: DomainResearchCandidate[];
}

interface MediaAsset {
    id: string;
    type: MediaAssetType;
    url: string;
    folder: string;
    tags: string[];
    metadata: Record<string, unknown>;
    usageCount: number;
    createdAt: string;
}

interface MediaAssetListResponse {
    page: number;
    limit: number;
    total: number;
    assets: MediaAsset[];
}

interface MediaModerationTask {
    id: string;
    userId: string;
    assetId: string;
    status: ModerationStatus | 'cancelled';
    slaHours: number;
    escalateAfterHours: number;
    dueAt: string | null;
    reviewerId: string | null;
    backupReviewerId: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewNotes: string | null;
    metadata: Record<string, unknown>;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string | null;
    asset?: Pick<MediaAsset, 'id' | 'type' | 'url' | 'folder' | 'metadata'> | null;
    sla?: {
        dueAt: string;
        escalateAt: string;
        isBreached: boolean;
        isEscalated: boolean;
    };
}

interface MediaModerationTaskListResponse {
    count: number;
    tasks: MediaModerationTask[];
}

interface ReviewerDirectoryEntry {
    id: string;
    name: string;
    role: 'reviewer' | 'expert' | 'admin';
    pendingTasks: number;
}

interface ReviewerDirectoryResponse {
    count: number;
    reviewers: ReviewerDirectoryEntry[];
}

interface ModerationPolicyInsightsResponse {
    windowHours: number;
    trendDays: number;
    pending: {
        total: number;
        pendingByReviewer: Record<string, number>;
        pendingSkew: number;
    };
    assignments: {
        total: number;
        overrideCount: number;
        alertEventCount: number;
        assignmentByReviewer: Record<string, number>;
        topReviewerId: string | null;
        topReviewerShare: number;
        alertCodeCounts: Record<string, number>;
        playbookCounts: Record<string, number>;
    };
    trends: Array<{
        date: string;
        assignments: number;
        overrides: number;
        alertEvents: number;
        topAlertCode: string | null;
        topPlaybookId: string | null;
    }>;
    generatedAt: string;
}

interface ModerationApprovalSummary {
    mode: 'any' | 'ordered';
    approvedCount: number;
    requiredApprovals: number;
    nextReviewerId: string | null;
}

interface ModerationAssignmentDraft {
    reviewerId: string;
    backupReviewerId: string;
    escalationChain: string[];
    teamLeadId: string;
    reason: string;
}

interface GrowthCredentialStatus {
    userId: string;
    channel: GrowthChannel;
    configured: boolean;
    revoked: boolean;
    accessTokenExpiresAt: string | null;
    refreshTokenExpiresAt: string | null;
    hasRefreshToken: boolean;
    scopes: string[];
    providerAccountId: string | null;
    metadata: Record<string, unknown>;
    updatedAt: string | null;
}

interface GrowthCredentialListResponse {
    credentials: GrowthCredentialStatus[];
}

interface CampaignFormState {
    domainResearchId: string;
    budget: string;
    dailyCap: string;
    pinterest: boolean;
    youtubeShorts: boolean;
}

interface MediaFormState {
    type: MediaAssetType;
    url: string;
    folder: string;
    tags: string;
    provenanceSource: ProvenanceSource;
    provenanceRef: string;
}

interface CredentialFormState {
    channel: GrowthChannel;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
    scopes: string;
    providerAccountId: string;
}

type ApiError = Error & { status?: number };

const CHANNEL_LABELS: Record<GrowthChannel, string> = {
    pinterest: 'Pinterest',
    youtube_shorts: 'YouTube Shorts',
};

const PROVENANCE_LABELS: Record<ProvenanceSource, string> = {
    manual_upload: 'Manual',
    external_url: 'External URL',
    ai_generated: 'AI Generated',
    worker: 'Worker',
    imported: 'Imported',
    migrated: 'Migrated',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toError(responseStatus: number, data: unknown): ApiError {
    const message = isRecord(data) && typeof data.error === 'string'
        ? data.error
        : `Request failed (${responseStatus})`;
    const error = new Error(message) as ApiError;
    error.status = responseStatus;
    return error;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const response = await fetch(input, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
        cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw toError(response.status, data);
    }
    if (data === null) {
        throw toError(response.status, { message: 'Invalid or empty JSON response' });
    }
    return data as T;
}

function formatDate(value: string | null | undefined): string {
    if (!value) return 'n/a';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return 'n/a';
    return parsed.toLocaleString();
}

function formatCurrency(value: number): string {
    if (!Number.isFinite(value)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function parseTags(value: string): string[] {
    return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .slice(0, 50);
}

function readString(
    value: Record<string, unknown> | null | undefined,
    key: string,
): string | null {
    if (!value) return null;
    const raw = value[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function readNumber(
    value: Record<string, unknown> | null | undefined,
    key: string,
): number | null {
    if (!value) return null;
    const raw = value[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
    }
    if (typeof raw === 'string') {
        const parsed = Number.parseInt(raw, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
}

function readStringArray(
    value: Record<string, unknown> | null | undefined,
    key: string,
): string[] {
    if (!value) return [];
    const raw = value[key];
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function toModerationAssignmentDraft(task: MediaModerationTask): ModerationAssignmentDraft {
    return {
        reviewerId: task.reviewerId ?? '',
        backupReviewerId: task.backupReviewerId ?? '',
        escalationChain: readStringArray(task.metadata, 'escalationChain'),
        teamLeadId: readString(task.metadata, 'teamLeadId') ?? '',
        reason: '',
    };
}

function getApprovalSummary(task: MediaModerationTask): ModerationApprovalSummary | null {
    if (!isRecord(task.metadata)) {
        return null;
    }

    const progressRaw = task.metadata.approvalProgress;
    if (isRecord(progressRaw)) {
        const approvedCount = readNumber(progressRaw, 'approvedCount') ?? 0;
        const requiredApprovals = readNumber(progressRaw, 'requiredApprovals') ?? 0;
        const mode = readString(progressRaw, 'mode') === 'ordered' ? 'ordered' : 'any';
        const nextReviewerId = readString(progressRaw, 'nextReviewerId');
        if (requiredApprovals > 0) {
            return {
                mode,
                approvedCount,
                requiredApprovals,
                nextReviewerId,
            };
        }
    }

    const workflowRaw = task.metadata.approvalWorkflow;
    if (!isRecord(workflowRaw)) {
        return null;
    }

    const approverIds = Array.isArray(workflowRaw.approverIds)
        ? workflowRaw.approverIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
    if (approverIds.length === 0) {
        return null;
    }

    const mode = readString(workflowRaw, 'mode') === 'ordered' ? 'ordered' : 'any';
    const configuredMinApprovals = readNumber(workflowRaw, 'minApprovals');
    const requiredApprovals = Math.max(1, Math.min(configuredMinApprovals ?? approverIds.length, approverIds.length));
    const approvalEntries = Array.isArray(task.metadata.approvals)
        ? task.metadata.approvals.filter((entry) => isRecord(entry) && typeof entry.reviewerId === 'string')
        : [];
    const approvedCount = approvalEntries.length;
    const nextReviewerId = mode === 'ordered' && approvedCount < requiredApprovals
        ? (approverIds[approvedCount] ?? null)
        : null;

    return {
        mode,
        approvedCount,
        requiredApprovals,
        nextReviewerId,
    };
}

function getModerationStatus(asset: MediaAsset): ModerationStatus {
    const raw = readString(asset.metadata, 'moderationStatus');
    if (raw === 'approved' || raw === 'rejected' || raw === 'needs_changes') {
        return raw;
    }
    return 'pending';
}

function getProvenanceSource(asset: MediaAsset): ProvenanceSource {
    const raw = readString(asset.metadata, 'provenanceSource');
    if (
        raw === 'external_url'
        || raw === 'ai_generated'
        || raw === 'worker'
        || raw === 'imported'
        || raw === 'migrated'
    ) {
        return raw;
    }
    return 'manual_upload';
}

function statusBadgeClass(status: CampaignStatus): string {
    if (status === 'active') return 'bg-emerald-100 text-emerald-800';
    if (status === 'paused') return 'bg-yellow-100 text-yellow-800';
    if (status === 'completed') return 'bg-blue-100 text-blue-800';
    if (status === 'cancelled') return 'bg-red-100 text-red-800';
    return 'bg-zinc-100 text-zinc-800';
}

function moderationBadgeClass(status: ModerationStatus | 'cancelled'): string {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    if (status === 'needs_changes') return 'bg-yellow-100 text-yellow-800';
    if (status === 'cancelled') return 'bg-zinc-300 text-zinc-900';
    return 'bg-zinc-100 text-zinc-800';
}

export default function GrowthDashboardPage() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [featureDisabled, setFeatureDisabled] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
    const [assets, setAssets] = useState<MediaAsset[]>([]);
    const [assetTotal, setAssetTotal] = useState(0);
    const [moderationTasks, setModerationTasks] = useState<MediaModerationTask[]>([]);
    const [reviewers, setReviewers] = useState<ReviewerDirectoryEntry[]>([]);
    const [moderationPolicyInsights, setModerationPolicyInsights] = useState<ModerationPolicyInsightsResponse | null>(null);
    const [credentials, setCredentials] = useState<GrowthCredentialStatus[]>([]);
    const [candidates, setCandidates] = useState<DomainResearchCandidate[]>([]);

    const [creatingCampaign, setCreatingCampaign] = useState(false);
    const [creatingAsset, setCreatingAsset] = useState(false);
    const [uploadingAssetFile, setUploadingAssetFile] = useState(false);
    const [savingCredential, setSavingCredential] = useState(false);
    const [applyingBulkAction, setApplyingBulkAction] = useState(false);
    const [mutatingCampaignId, setMutatingCampaignId] = useState<string | null>(null);
    const [mutatingAssetId, setMutatingAssetId] = useState<string | null>(null);
    const [queueingModerationAssetId, setQueueingModerationAssetId] = useState<string | null>(null);
    const [mutatingModerationTaskId, setMutatingModerationTaskId] = useState<string | null>(null);
    const [assigningModerationTaskId, setAssigningModerationTaskId] = useState<string | null>(null);
    const [exportingModerationAudit, setExportingModerationAudit] = useState(false);
    const [exportingPolicyInsights, setExportingPolicyInsights] = useState(false);
    const [runningEscalationSweep, setRunningEscalationSweep] = useState(false);
    const [showOnlyPendingModeration, setShowOnlyPendingModeration] = useState(true);
    const [mutatingChannel, setMutatingChannel] = useState<GrowthChannel | null>(null);
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [selectedAssetFile, setSelectedAssetFile] = useState<File | null>(null);
    const assetFileInputRef = useRef<HTMLInputElement | null>(null);

    const [campaignForm, setCampaignForm] = useState<CampaignFormState>({
        domainResearchId: '',
        budget: '0',
        dailyCap: '1',
        pinterest: true,
        youtubeShorts: true,
    });
    const [mediaForm, setMediaForm] = useState<MediaFormState>({
        type: 'image',
        url: '',
        folder: 'inbox',
        tags: '',
        provenanceSource: 'manual_upload',
        provenanceRef: '',
    });
    const [bulkOperation, setBulkOperation] = useState<BulkMediaOperation>('move_folder');
    const [bulkFolder, setBulkFolder] = useState('reviewed');
    const [bulkTags, setBulkTags] = useState('');
    const [bulkModerationStatus, setBulkModerationStatus] = useState<ModerationStatus>('approved');
    const [bulkModerationReason, setBulkModerationReason] = useState('');
    const [moderationAssignmentDrafts, setModerationAssignmentDrafts] = useState<Record<string, ModerationAssignmentDraft>>({});
    const [credentialForm, setCredentialForm] = useState<CredentialFormState>({
        channel: 'pinterest',
        accessToken: '',
        refreshToken: '',
        accessTokenExpiresAt: '',
        refreshTokenExpiresAt: '',
        scopes: '',
        providerAccountId: '',
    });

    const credentialByChannel = useMemo(() => {
        const map = new Map<GrowthChannel, GrowthCredentialStatus>();
        for (const credential of credentials) {
            map.set(credential.channel, credential);
        }
        return map;
    }, [credentials]);

    const reviewerById = useMemo(() => {
        const map = new Map<string, ReviewerDirectoryEntry>();
        for (const reviewer of reviewers) {
            map.set(reviewer.id, reviewer);
        }
        return map;
    }, [reviewers]);

    const teamLeadReviewers = useMemo(() => {
        return reviewers.filter((reviewer) => reviewer.role === 'expert' || reviewer.role === 'admin');
    }, [reviewers]);

    const recommendedReviewers = useMemo(() => {
        return [...reviewers]
            .sort((left, right) => {
                if (left.pendingTasks !== right.pendingTasks) {
                    return left.pendingTasks - right.pendingTasks;
                }
                return left.name.localeCompare(right.name);
            })
            .slice(0, 3);
    }, [reviewers]);

    const campaignSummary = useMemo(() => {
        return campaigns.reduce(
            (acc, campaign) => {
                acc.total += 1;
                acc[campaign.status] += 1;
                return acc;
            },
            { total: 0, draft: 0, active: 0, paused: 0, completed: 0, cancelled: 0 } as Record<CampaignStatus | 'total', number>,
        );
    }, [campaigns]);

    const configuredCredentialCount = useMemo(() => {
        return credentials.filter((credential) => credential.configured && !credential.revoked).length;
    }, [credentials]);

    const pendingModerationCount = useMemo(() => {
        return moderationTasks.filter((task) => task.status === 'pending').length;
    }, [moderationTasks]);

    const formatReviewerLabel = useCallback((reviewerId: string | null | undefined, fallback: string): string => {
        if (!reviewerId) return fallback;
        const reviewer = reviewerById.get(reviewerId);
        if (!reviewer) return reviewerId;
        return `${reviewer.name} (${reviewer.role}, ${reviewer.pendingTasks} pending)`;
    }, [reviewerById]);

    const moderationInsights = useMemo(() => {
        const byReviewer: Record<string, { pending: number; overdue: number; escalated: number }> = {};
        let overdueCount = 0;
        let escalatedCount = 0;
        let unassignedCount = 0;

        for (const task of moderationTasks) {
            const pending = task.status === 'pending';
            const reviewerKey = task.reviewerId || 'unassigned';
            byReviewer[reviewerKey] = byReviewer[reviewerKey] || { pending: 0, overdue: 0, escalated: 0 };
            if (pending) {
                byReviewer[reviewerKey].pending += 1;
                if (!task.reviewerId) {
                    unassignedCount += 1;
                }
            }
            if (task.sla?.isBreached) {
                overdueCount += 1;
                byReviewer[reviewerKey].overdue += 1;
            }
            if (task.sla?.isEscalated) {
                escalatedCount += 1;
                byReviewer[reviewerKey].escalated += 1;
            }
        }

        const reviewerRows = Object.entries(byReviewer)
            .map(([reviewerId, values]) => ({
                reviewerId,
                ...values,
            }))
            .sort((left, right) => (
                (right.overdue + right.escalated + right.pending)
                - (left.overdue + left.escalated + left.pending)
            ))
            .slice(0, 8);

        return {
            overdueCount,
            escalatedCount,
            unassignedCount,
            reviewerRows,
        };
    }, [moderationTasks]);

    const visibleModerationTasks = useMemo(() => {
        const filtered = showOnlyPendingModeration
            ? moderationTasks.filter((task) => task.status === 'pending')
            : moderationTasks;
        return [...filtered].sort((left, right) => {
            const leftEscalated = left.sla?.isEscalated ? 1 : 0;
            const rightEscalated = right.sla?.isEscalated ? 1 : 0;
            if (leftEscalated !== rightEscalated) return rightEscalated - leftEscalated;
            const leftBreached = left.sla?.isBreached ? 1 : 0;
            const rightBreached = right.sla?.isBreached ? 1 : 0;
            if (leftBreached !== rightBreached) return rightBreached - leftBreached;
            return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        });
    }, [moderationTasks, showOnlyPendingModeration]);

    const selectedAssetSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);

    const loadDashboard = useCallback(async () => {
        const tasks = await Promise.allSettled([
            requestJson<CampaignListResponse>('/api/growth/campaigns?includeResearch=true&limit=100'),
            requestJson<MediaAssetListResponse>('/api/growth/media-assets?limit=100'),
            requestJson<MediaModerationTaskListResponse>('/api/growth/media-review/tasks?limit=100'),
            requestJson<ReviewerDirectoryResponse>('/api/growth/media-review/reviewers?limit=200'),
            requestJson<ModerationPolicyInsightsResponse>('/api/growth/media-review/insights?windowHours=72&trendDays=21'),
            requestJson<GrowthCredentialListResponse>('/api/growth/channel-credentials'),
            requestJson<CandidateListResponse>('/api/acquisition/candidates?limit=100'),
        ]);

        let firstError: ApiError | null = null;

        const campaignsResult = tasks[0];
        if (campaignsResult.status === 'fulfilled') {
            setCampaigns(campaignsResult.value.campaigns || []);
        } else {
            firstError = (firstError || campaignsResult.reason) as ApiError;
        }

        const assetsResult = tasks[1];
        if (assetsResult.status === 'fulfilled') {
            const assets = assetsResult.value.assets ?? [];
            setAssets(assets);
            setAssetTotal(assetsResult.value.total ?? assets.length ?? 0);
        } else {
            firstError = (firstError || assetsResult.reason) as ApiError;
        }

        const moderationTasksResult = tasks[2];
        if (moderationTasksResult.status === 'fulfilled') {
            setModerationTasks(moderationTasksResult.value.tasks || []);
        } else {
            firstError = (firstError || moderationTasksResult.reason) as ApiError;
        }

        const reviewersResult = tasks[3];
        if (reviewersResult.status === 'fulfilled') {
            setReviewers(reviewersResult.value.reviewers || []);
        } else {
            firstError = (firstError || reviewersResult.reason) as ApiError;
        }

        const moderationInsightsResult = tasks[4];
        if (moderationInsightsResult.status === 'fulfilled') {
            setModerationPolicyInsights(moderationInsightsResult.value);
        } else {
            firstError = (firstError || moderationInsightsResult.reason) as ApiError;
        }

        const credentialsResult = tasks[5];
        if (credentialsResult.status === 'fulfilled') {
            setCredentials(credentialsResult.value.credentials || []);
        } else {
            firstError = (firstError || credentialsResult.reason) as ApiError;
        }

        const candidatesResult = tasks[6];
        if (candidatesResult.status === 'fulfilled') {
            setCandidates(candidatesResult.value.candidates || []);
            setCampaignForm((prev) => {
                if (prev.domainResearchId || candidatesResult.value.candidates.length === 0) {
                    return prev;
                }
                return { ...prev, domainResearchId: candidatesResult.value.candidates[0].id };
            });
        } else {
            firstError = (firstError || candidatesResult.reason) as ApiError;
        }

        if (!firstError) {
            setError(null);
            setFeatureDisabled(false);
            return;
        }

        if (firstError.status === 403) {
            setFeatureDisabled(true);
        }
        setError(firstError.message || 'Failed to load growth dashboard');
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        loadDashboard()
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [loadDashboard]);

    useEffect(() => {
        const ids = new Set(assets.map((asset) => asset.id));
        setSelectedAssetIds((prev) => prev.filter((id) => ids.has(id)));
    }, [assets]);

    const refreshDashboard = useCallback(async () => {
        setRefreshing(true);
        await loadDashboard();
        setRefreshing(false);
    }, [loadDashboard]);

    const handleCreateCampaign = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);

        const channels: GrowthChannel[] = [];
        if (campaignForm.pinterest) channels.push('pinterest');
        if (campaignForm.youtubeShorts) channels.push('youtube_shorts');

        if (!campaignForm.domainResearchId) {
            setError('Select a candidate domain before creating a campaign.');
            return;
        }
        if (channels.length === 0) {
            setError('Select at least one channel.');
            return;
        }

        const budget = Number.parseFloat(campaignForm.budget);
        const dailyCap = Number.parseInt(campaignForm.dailyCap, 10);
        if (!Number.isFinite(budget) || budget < 0) {
            setError('Budget must be a non-negative number.');
            return;
        }
        if (!Number.isFinite(dailyCap) || dailyCap < 1) {
            setError('Daily cap must be at least 1.');
            return;
        }

        setCreatingCampaign(true);
        try {
            await requestJson('/api/growth/campaigns', {
                method: 'POST',
                body: JSON.stringify({
                    domainResearchId: campaignForm.domainResearchId,
                    channels,
                    budget,
                    dailyCap,
                }),
            });
            setMessage('Campaign created.');
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to create campaign');
        } finally {
            setCreatingCampaign(false);
        }
    }, [campaignForm, refreshDashboard]);

    const handleLaunchCampaign = useCallback(async (campaignId: string) => {
        setMessage(null);
        setMutatingCampaignId(campaignId);
        try {
            const response = await requestJson<{ deduped?: boolean; jobId?: string }>(
                `/api/growth/campaigns/${campaignId}/launch`,
                {
                    method: 'POST',
                    body: JSON.stringify({}),
                },
            );
            if (response.deduped) {
                setMessage(`Launch already queued (job ${response.jobId || 'unknown'}).`);
            } else {
                setMessage(`Campaign queued (job ${response.jobId || 'unknown'}).`);
            }
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to launch campaign');
        } finally {
            setMutatingCampaignId(null);
        }
    }, [refreshDashboard]);

    const handleCreateAsset = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);

        if (!mediaForm.url.trim()) {
            setError('Asset URL is required.');
            return;
        }

        setCreatingAsset(true);
        try {
            await requestJson('/api/growth/media-assets', {
                method: 'POST',
                body: JSON.stringify({
                    type: mediaForm.type,
                    url: mediaForm.url.trim(),
                    folder: mediaForm.folder.trim() || 'inbox',
                    tags: parseTags(mediaForm.tags),
                    provenanceSource: mediaForm.provenanceSource,
                    provenanceRef: mediaForm.provenanceRef.trim() || undefined,
                }),
            });
            setMediaForm((prev) => ({ ...prev, url: '', tags: '', provenanceRef: '' }));
            setMessage('Asset saved.');
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to save media asset');
        } finally {
            setCreatingAsset(false);
        }
    }, [mediaForm, refreshDashboard]);

    const handleUploadAssetFile = useCallback(async () => {
        setMessage(null);
        if (!selectedAssetFile) {
            setError('Select a file before uploading.');
            return;
        }

        setUploadingAssetFile(true);
        try {
            const formData = new FormData();
            formData.append('file', selectedAssetFile);
            formData.append('type', mediaForm.type);
            formData.append('folder', mediaForm.folder.trim() || 'inbox');
            formData.append('tags', mediaForm.tags);
            formData.append('provenanceSource', mediaForm.provenanceSource);
            if (mediaForm.provenanceRef.trim()) {
                formData.append('provenanceRef', mediaForm.provenanceRef.trim());
            }

            const response = await fetch('/api/growth/media-assets/upload', {
                method: 'POST',
                body: formData,
                cache: 'no-store',
            });
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw toError(response.status, data);
            }

            setSelectedAssetFile(null);
            if (assetFileInputRef.current) {
                assetFileInputRef.current.value = '';
            }
            setMessage('File uploaded and asset saved.');
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to upload file');
        } finally {
            setUploadingAssetFile(false);
        }
    }, [selectedAssetFile, mediaForm, refreshDashboard]);

    const handleDeleteAsset = useCallback(async (assetId: string) => {
        setMessage(null);
        setMutatingAssetId(assetId);
        try {
            await requestJson(`/api/growth/media-assets/${assetId}`, {
                method: 'DELETE',
            });
            setMessage('Asset deleted.');
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to delete media asset');
        } finally {
            setMutatingAssetId(null);
        }
    }, [refreshDashboard]);

    const handleQueueModerationTask = useCallback(async (assetId: string) => {
        setMessage(null);
        setQueueingModerationAssetId(assetId);
        try {
            const response = await requestJson<{ created: boolean; task: { id: string } }>('/api/growth/media-review/tasks', {
                method: 'POST',
                body: JSON.stringify({ assetId }),
            });
            setMessage(
                response.created
                    ? `Moderation task queued (${response.task.id}).`
                    : `Open moderation task already exists (${response.task.id}).`,
            );
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to queue moderation task');
        } finally {
            setQueueingModerationAssetId(null);
        }
    }, [refreshDashboard]);

    const handleModerationDecision = useCallback(async (
        taskId: string,
        status: 'approved' | 'rejected' | 'needs_changes' | 'cancelled',
    ) => {
        setMessage(null);
        setMutatingModerationTaskId(taskId);
        try {
            await requestJson(`/api/growth/media-review/tasks/${taskId}/decision`, {
                method: 'POST',
                body: JSON.stringify({
                    status,
                    reviewNotes: `Set via growth dashboard (${status})`,
                    moderationReason: `Set via growth dashboard (${status})`,
                }),
            });
            setMessage(`Moderation task ${status.replaceAll('_', ' ')}.`);
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to update moderation task');
        } finally {
            setMutatingModerationTaskId(null);
        }
    }, [refreshDashboard]);

    const getModerationAssignmentDraft = useCallback((task: MediaModerationTask): ModerationAssignmentDraft => {
        return moderationAssignmentDrafts[task.id] ?? toModerationAssignmentDraft(task);
    }, [moderationAssignmentDrafts]);

    const updateModerationAssignmentDraft = useCallback((
        task: MediaModerationTask,
        patch: Partial<ModerationAssignmentDraft>,
    ) => {
        setModerationAssignmentDrafts((prev) => ({
            ...prev,
            [task.id]: {
                ...(prev[task.id] ?? toModerationAssignmentDraft(task)),
                ...patch,
            },
        }));
    }, []);

    const toggleEscalationChainReviewer = useCallback((
        task: MediaModerationTask,
        reviewerId: string,
        selected: boolean,
    ) => {
        const draft = getModerationAssignmentDraft(task);
        const current = draft.escalationChain;
        const next = selected
            ? (current.includes(reviewerId) ? current : [...current, reviewerId])
            : current.filter((id) => id !== reviewerId);
        updateModerationAssignmentDraft(task, { escalationChain: next });
    }, [getModerationAssignmentDraft, updateModerationAssignmentDraft]);

    const handleClaimModerationTask = useCallback(async (taskId: string) => {
        setMessage(null);
        setAssigningModerationTaskId(taskId);
        try {
            const response = await requestJson<{
                policy: {
                    overrideApplied: boolean;
                    violations: Array<{ code: string }>;
                    alerts: Array<{ code: string }>;
                } | null;
            }>(`/api/growth/media-review/tasks/${taskId}/assignment`, {
                method: 'POST',
                body: JSON.stringify({
                    claim: true,
                    reason: 'Claimed from growth dashboard',
                }),
            });
            const alertText = response.policy?.alerts?.length
                ? ` Policy alerts: ${response.policy.alerts.map((alert) => alert.code).join(', ')}.`
                : '';
            setMessage(`Task claimed.${alertText}`);
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to claim moderation task');
        } finally {
            setAssigningModerationTaskId(null);
        }
    }, [refreshDashboard]);

    const handleSaveModerationAssignment = useCallback(async (task: MediaModerationTask) => {
        setMessage(null);
        setAssigningModerationTaskId(task.id);
        try {
            const draft = getModerationAssignmentDraft(task);
            const response = await requestJson<{
                policy: {
                    overrideApplied: boolean;
                    violations: Array<{ code: string }>;
                    alerts: Array<{ code: string }>;
                } | null;
            }>(`/api/growth/media-review/tasks/${task.id}/assignment`, {
                method: 'POST',
                body: JSON.stringify({
                    reviewerId: draft.reviewerId.trim() || null,
                    backupReviewerId: draft.backupReviewerId.trim() || null,
                    escalationChain: draft.escalationChain,
                    teamLeadId: draft.teamLeadId.trim() || null,
                    reason: draft.reason.trim() || undefined,
                }),
            });
            setModerationAssignmentDrafts((prev) => ({
                ...prev,
                [task.id]: {
                    ...draft,
                    reason: '',
                },
            }));
            const overrideText = response.policy?.overrideApplied ? ' Fairness override applied.' : '';
            const alertText = response.policy?.alerts?.length
                ? ` Policy alerts: ${response.policy.alerts.map((alert) => alert.code).join(', ')}.`
                : '';
            setMessage(`Task assignment updated.${overrideText}${alertText}`);
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to update moderation assignment');
        } finally {
            setAssigningModerationTaskId(null);
        }
    }, [getModerationAssignmentDraft, refreshDashboard]);

    const handleExportModerationAudit = useCallback(async (format: 'json' | 'csv') => {
        setMessage(null);
        setExportingModerationAudit(true);
        try {
            const response = await fetch(`/api/growth/media-review/events/export?format=${format}`, {
                method: 'GET',
                cache: 'no-store',
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw toError(response.status, data);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            const datePart = new Date().toISOString().slice(0, 10);
            anchor.href = url;
            anchor.download = `media-moderation-audit-${datePart}.${format === 'csv' ? 'csv' : 'json'}`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            setMessage('Moderation audit export generated.');
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to export moderation audit');
        } finally {
            setExportingModerationAudit(false);
        }
    }, []);

    const handleExportPolicyInsights = useCallback(async () => {
        setMessage(null);
        setExportingPolicyInsights(true);
        try {
            const response = await fetch('/api/growth/media-review/insights?windowHours=72&trendDays=21&format=csv', {
                method: 'GET',
                cache: 'no-store',
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw toError(response.status, data);
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            const datePart = new Date().toISOString().slice(0, 10);
            anchor.href = url;
            anchor.download = `moderation-policy-insights-${datePart}.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            setMessage('Policy insights export generated.');
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to export policy insights');
        } finally {
            setExportingPolicyInsights(false);
        }
    }, []);

    const handleRunEscalationSweep = useCallback(async (dryRun: boolean) => {
        setMessage(null);
        setRunningEscalationSweep(true);
        try {
            const response = await requestJson<{
                scanned: number;
                eligible: number;
                escalated: number;
                opsNotified: number;
                skipped: number;
                dryRun: boolean;
            }>('/api/growth/media-review/escalations', {
                method: 'POST',
                body: JSON.stringify({
                    dryRun,
                    limit: 200,
                }),
            });
            setMessage(
                `${response.dryRun ? 'Dry run' : 'Sweep'}: ${response.scanned} scanned, ${response.eligible} eligible, `
                + `${response.escalated} escalated, ${response.opsNotified} ops-notified, ${response.skipped} skipped.`,
            );
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to run escalation sweep');
        } finally {
            setRunningEscalationSweep(false);
        }
    }, [refreshDashboard]);

    const toggleAssetSelection = useCallback((assetId: string) => {
        setSelectedAssetIds((prev) => {
            if (prev.includes(assetId)) {
                return prev.filter((id) => id !== assetId);
            }
            return [...prev, assetId];
        });
    }, []);

    const toggleSelectAllAssets = useCallback(() => {
        setSelectedAssetIds((prev) => {
            if (assets.length === 0) return [];
            if (prev.length === assets.length) return [];
            return assets.map((asset) => asset.id);
        });
    }, [assets]);

    const handleApplyBulkAction = useCallback(async () => {
        setMessage(null);
        if (selectedAssetIds.length === 0) {
            setError('Select at least one media asset.');
            return;
        }

        if (bulkOperation === 'delete') {
            const confirmed = window.confirm(
                `Are you sure you want to delete ${selectedAssetIds.length} asset(s)? This action cannot be undone.`,
            );
            if (!confirmed) return;
        }

        const payload: Record<string, unknown> = {
            operation: bulkOperation,
            assetIds: selectedAssetIds,
        };

        if (bulkOperation === 'move_folder') {
            if (!bulkFolder.trim()) {
                setError('Folder is required for move action.');
                return;
            }
            payload.folder = bulkFolder.trim();
        }

        if (bulkOperation === 'add_tags' || bulkOperation === 'remove_tags') {
            const tags = parseTags(bulkTags);
            if (tags.length === 0) {
                setError('Provide at least one tag.');
                return;
            }
            payload.tags = tags;
        }

        if (bulkOperation === 'set_moderation') {
            payload.moderationStatus = bulkModerationStatus;
            payload.moderationReason = bulkModerationReason.trim() || null;
        }

        setApplyingBulkAction(true);
        try {
            const response = await requestJson<{ affectedCount: number; unmatchedIds?: string[] }>('/api/growth/media-assets/bulk', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const unmatchedCount = response.unmatchedIds?.length || 0;
            const unmatchedText = unmatchedCount > 0 ? ` (${unmatchedCount} not owned or missing)` : '';
            setMessage(`Bulk action applied to ${response.affectedCount} assets${unmatchedText}.`);
            setSelectedAssetIds([]);
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to apply bulk action');
        } finally {
            setApplyingBulkAction(false);
        }
    }, [
        selectedAssetIds,
        bulkOperation,
        bulkFolder,
        bulkTags,
        bulkModerationStatus,
        bulkModerationReason,
        refreshDashboard,
    ]);

    const handleSaveCredential = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        if (!credentialForm.accessToken.trim()) {
            setError('Access token is required.');
            return;
        }
        setSavingCredential(true);
        try {
            await requestJson('/api/growth/channel-credentials', {
                method: 'PUT',
                body: JSON.stringify({
                    channel: credentialForm.channel,
                    accessToken: credentialForm.accessToken.trim(),
                    refreshToken: credentialForm.refreshToken.trim() || null,
                    accessTokenExpiresAt: credentialForm.accessTokenExpiresAt.trim() || null,
                    refreshTokenExpiresAt: credentialForm.refreshTokenExpiresAt.trim() || null,
                    scopes: parseTags(credentialForm.scopes),
                    providerAccountId: credentialForm.providerAccountId.trim() || null,
                }),
            });
            setCredentialForm((prev) => ({ ...prev, accessToken: '', refreshToken: '' }));
            setMessage(`${CHANNEL_LABELS[credentialForm.channel]} credential saved.`);
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to save credential');
        } finally {
            setSavingCredential(false);
        }
    }, [credentialForm, refreshDashboard]);

    const handleRefreshCredential = useCallback(async (channel: GrowthChannel) => {
        setMessage(null);
        setMutatingChannel(channel);
        try {
            const response = await requestJson<{ refreshed: boolean }>(
                '/api/growth/channel-credentials',
                {
                    method: 'POST',
                    body: JSON.stringify({ channel, force: true }),
                },
            );
            setMessage(
                response.refreshed
                    ? `${CHANNEL_LABELS[channel]} token refreshed.`
                    : `${CHANNEL_LABELS[channel]} token is still valid; no refresh needed.`,
            );
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to refresh credential');
        } finally {
            setMutatingChannel(null);
        }
    }, [refreshDashboard]);

    const handleRevokeCredential = useCallback(async (channel: GrowthChannel) => {
        setMessage(null);
        setMutatingChannel(channel);
        try {
            await requestJson(`/api/growth/channel-credentials?channel=${channel}`, {
                method: 'DELETE',
            });
            setMessage(`${CHANNEL_LABELS[channel]} credential revoked.`);
            await refreshDashboard();
        } catch (requestError) {
            const typedError = requestError as ApiError;
            setError(typedError.message || 'Failed to revoke credential');
        } finally {
            setMutatingChannel(null);
        }
    }, [refreshDashboard]);

    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading growth dashboard...
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Growth Channels</h1>
                    <p className="text-sm text-muted-foreground">
                        Campaigns, media vault, and channel credentials for Pinterest and YouTube Shorts.
                    </p>
                </div>
                <Button
                    onClick={() => {
                        setError(null);
                        setMessage(null);
                        void refreshDashboard();
                    }}
                    variant="outline"
                    disabled={refreshing}
                >
                    {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Refresh
                </Button>
            </div>

            {featureDisabled && (
                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        `growth_channels_v1` is disabled for your account, so growth APIs are blocked.
                    </AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {message && (
                <Alert>
                    <AlertDescription>{message}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-5">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Campaigns</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-semibold">{campaignSummary.total}</p>
                        <p className="text-xs text-muted-foreground">{campaignSummary.active} active, {campaignSummary.draft} draft</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Media Assets</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-semibold">{assetTotal}</p>
                        <p className="text-xs text-muted-foreground">{assets.filter((asset) => asset.usageCount === 0).length} unused</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Credentials</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-semibold">{configuredCredentialCount}/2</p>
                        <p className="text-xs text-muted-foreground">active channel connections</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Candidates</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-semibold">{candidates.length}</p>
                        <p className="text-xs text-muted-foreground">available for campaign linking</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Review Queue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-3xl font-semibold">{pendingModerationCount}</p>
                        <p className="text-xs text-muted-foreground">pending moderation tasks</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="campaigns" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                    <TabsTrigger value="media">Media Vault</TabsTrigger>
                    <TabsTrigger value="credentials">Credentials</TabsTrigger>
                </TabsList>

                <TabsContent value="campaigns" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Rocket className="h-5 w-5" />
                                Create Campaign
                            </CardTitle>
                            <CardDescription>
                                Select a researched domain and channel mix.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateCampaign}>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="domainResearchId">Domain Candidate</Label>
                                    <select
                                        id="domainResearchId"
                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                        value={campaignForm.domainResearchId}
                                        onChange={(event) => setCampaignForm((prev) => ({ ...prev, domainResearchId: event.target.value }))}
                                    >
                                        <option value="">Select candidate</option>
                                        {candidates.map((candidate) => (
                                            <option key={candidate.id} value={candidate.id}>
                                                {candidate.domain} ({candidate.decision || 'researching'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="campaignBudget">Budget (USD)</Label>
                                    <Input
                                        id="campaignBudget"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={campaignForm.budget}
                                        onChange={(event) => setCampaignForm((prev) => ({ ...prev, budget: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="campaignDailyCap">Daily Cap</Label>
                                    <Input
                                        id="campaignDailyCap"
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={campaignForm.dailyCap}
                                        onChange={(event) => setCampaignForm((prev) => ({ ...prev, dailyCap: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label>Channels</Label>
                                    <div className="flex flex-wrap items-center gap-4 pt-1">
                                        <label className="inline-flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={campaignForm.pinterest}
                                                onChange={(event) => setCampaignForm((prev) => ({ ...prev, pinterest: event.target.checked }))}
                                            />
                                            Pinterest
                                        </label>
                                        <label className="inline-flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={campaignForm.youtubeShorts}
                                                onChange={(event) => setCampaignForm((prev) => ({ ...prev, youtubeShorts: event.target.checked }))}
                                            />
                                            YouTube Shorts
                                        </label>
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <Button type="submit" disabled={creatingCampaign || featureDisabled}>
                                        {creatingCampaign ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                                        Create Campaign
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Existing Campaigns</CardTitle>
                            <CardDescription>
                                Launch from here to enqueue promotion planning.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {campaigns.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                            ) : (
                                campaigns.map((campaign) => (
                                    <div
                                        key={campaign.id}
                                        className="rounded-lg border p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium">
                                                    {campaign.research?.domain || campaign.domainResearchId}
                                                </span>
                                                <Badge className={statusBadgeClass(campaign.status)}>
                                                    {campaign.status}
                                                </Badge>
                                                {campaign.channels.map((channel) => (
                                                    <Badge key={channel} variant="outline">
                                                        {CHANNEL_LABELS[channel]}
                                                    </Badge>
                                                ))}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Budget {formatCurrency(campaign.budget)} • Daily cap {campaign.dailyCap} • Created {formatDate(campaign.createdAt)}
                                            </div>
                                        </div>
                                        <div>
                                            <Button
                                                size="sm"
                                                onClick={() => void handleLaunchCampaign(campaign.id)}
                                                disabled={mutatingCampaignId === campaign.id || featureDisabled}
                                            >
                                                {mutatingCampaignId === campaign.id
                                                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    : <Play className="mr-2 h-4 w-4" />}
                                                Launch
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="media" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FolderOpen className="h-5 w-5" />
                                Add Asset
                            </CardTitle>
                            <CardDescription>
                                Save image/video/script/voice assets to the growth vault.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateAsset}>
                                <div className="space-y-2">
                                    <Label htmlFor="assetType">Type</Label>
                                    <select
                                        id="assetType"
                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                        value={mediaForm.type}
                                        onChange={(event) => setMediaForm((prev) => ({ ...prev, type: event.target.value as MediaAssetType }))}
                                    >
                                        <option value="image">Image</option>
                                        <option value="video">Video</option>
                                        <option value="script">Script</option>
                                        <option value="voiceover">Voiceover</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="assetFolder">Folder</Label>
                                    <Input
                                        id="assetFolder"
                                        value={mediaForm.folder}
                                        onChange={(event) => setMediaForm((prev) => ({ ...prev, folder: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="assetProvenanceSource">Provenance</Label>
                                    <select
                                        id="assetProvenanceSource"
                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                        value={mediaForm.provenanceSource}
                                        onChange={(event) => setMediaForm((prev) => ({
                                            ...prev,
                                            provenanceSource: event.target.value as ProvenanceSource,
                                        }))}
                                    >
                                        {Object.entries(PROVENANCE_LABELS).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="assetProvenanceRef">Provenance Ref (optional)</Label>
                                    <Input
                                        id="assetProvenanceRef"
                                        value={mediaForm.provenanceRef}
                                        onChange={(event) => setMediaForm((prev) => ({ ...prev, provenanceRef: event.target.value }))}
                                        placeholder="job:123 / ticket:abc"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="assetUrl">Asset URL</Label>
                                    <Input
                                        id="assetUrl"
                                        value={mediaForm.url}
                                        onChange={(event) => setMediaForm((prev) => ({ ...prev, url: event.target.value }))}
                                        placeholder="https://..."
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="assetTags">Tags (comma separated)</Label>
                                    <Input
                                        id="assetTags"
                                        value={mediaForm.tags}
                                        onChange={(event) => setMediaForm((prev) => ({ ...prev, tags: event.target.value }))}
                                        placeholder="pin, short, finance"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="assetFile">Upload file (optional)</Label>
                                    <input
                                        id="assetFile"
                                        ref={assetFileInputRef}
                                        type="file"
                                        className="block w-full text-sm"
                                        onChange={(event) => setSelectedAssetFile(event.target.files?.[0] || null)}
                                    />
                                    {selectedAssetFile && (
                                        <p className="text-xs text-muted-foreground">
                                            Selected: {selectedAssetFile.name} ({Math.round(selectedAssetFile.size / 1024)} KB)
                                        </p>
                                    )}
                                </div>
                                <div className="md:col-span-2">
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="submit" disabled={creatingAsset || featureDisabled}>
                                            {creatingAsset ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOpen className="mr-2 h-4 w-4" />}
                                            Save URL Asset
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={uploadingAssetFile || !selectedAssetFile || featureDisabled}
                                            onClick={() => void handleUploadAssetFile()}
                                        >
                                            {uploadingAssetFile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                            Upload File
                                        </Button>
                                    </div>
                                </div>
                                <div className="md:col-span-2 text-xs text-muted-foreground">
                                    Use URL for externally hosted creatives, or upload directly to configured storage provider.
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Bulk Reviewer Actions</CardTitle>
                            <CardDescription>
                                Apply moderation, folder, or tag changes across selected assets.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap items-center gap-3 text-sm">
                                <span className="text-muted-foreground">
                                    Selected: {selectedAssetIds.length}
                                </span>
                                <Button type="button" size="sm" variant="outline" onClick={toggleSelectAllAssets}>
                                    {assets.length > 0 && selectedAssetIds.length === assets.length ? 'Clear Selection' : 'Select All Visible'}
                                </Button>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="bulkOperation">Operation</Label>
                                    <select
                                        id="bulkOperation"
                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                        value={bulkOperation}
                                        onChange={(event) => setBulkOperation(event.target.value as BulkMediaOperation)}
                                    >
                                        <option value="move_folder">Move to folder</option>
                                        <option value="set_moderation">Set moderation status</option>
                                        <option value="add_tags">Add tags</option>
                                        <option value="remove_tags">Remove tags</option>
                                        <option value="delete">Delete assets</option>
                                    </select>
                                </div>
                                {bulkOperation === 'move_folder' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="bulkFolder">Target folder</Label>
                                        <Input
                                            id="bulkFolder"
                                            value={bulkFolder}
                                            onChange={(event) => setBulkFolder(event.target.value)}
                                        />
                                    </div>
                                )}
                                {(bulkOperation === 'add_tags' || bulkOperation === 'remove_tags') && (
                                    <div className="space-y-2">
                                        <Label htmlFor="bulkTags">Tags (comma separated)</Label>
                                        <Input
                                            id="bulkTags"
                                            value={bulkTags}
                                            onChange={(event) => setBulkTags(event.target.value)}
                                            placeholder="promo, q2, approved"
                                        />
                                    </div>
                                )}
                                {bulkOperation === 'set_moderation' && (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="bulkModerationStatus">Moderation status</Label>
                                            <select
                                                id="bulkModerationStatus"
                                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                                value={bulkModerationStatus}
                                                onChange={(event) => setBulkModerationStatus(event.target.value as ModerationStatus)}
                                            >
                                                <option value="pending">Pending</option>
                                                <option value="approved">Approved</option>
                                                <option value="rejected">Rejected</option>
                                                <option value="needs_changes">Needs Changes</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="bulkModerationReason">Reason (optional)</Label>
                                            <Input
                                                id="bulkModerationReason"
                                                value={bulkModerationReason}
                                                onChange={(event) => setBulkModerationReason(event.target.value)}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant={bulkOperation === 'delete' ? 'destructive' : 'default'}
                                onClick={() => void handleApplyBulkAction()}
                                disabled={applyingBulkAction || featureDisabled || selectedAssetIds.length === 0}
                            >
                                {applyingBulkAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Apply Bulk Action
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ClipboardCheck className="h-5 w-5" />
                                Moderation Queue
                            </CardTitle>
                            <CardDescription>
                                SLA-tracked review tasks for media approval with exportable audit logs.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">Overdue {moderationInsights.overdueCount}</Badge>
                                <Badge variant="outline">Escalated {moderationInsights.escalatedCount}</Badge>
                                <Badge variant="outline">Unassigned {moderationInsights.unassignedCount}</Badge>
                            </div>
                            {moderationInsights.reviewerRows.length > 0 && (
                                <div className="rounded-md border overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                        <thead className="bg-muted/40">
                                            <tr>
                                                <th className="text-left px-3 py-2">Reviewer</th>
                                                <th className="text-right px-3 py-2">Pending</th>
                                                <th className="text-right px-3 py-2">Overdue</th>
                                                <th className="text-right px-3 py-2">Escalated</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {moderationInsights.reviewerRows.map((row) => (
                                                <tr key={row.reviewerId} className="border-t">
                                                    <td className="px-3 py-2">
                                                        {row.reviewerId === 'unassigned'
                                                            ? 'Unassigned'
                                                            : formatReviewerLabel(row.reviewerId, row.reviewerId)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">{row.pending}</td>
                                                    <td className="px-3 py-2 text-right">{row.overdue}</td>
                                                    <td className="px-3 py-2 text-right">{row.escalated}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {moderationPolicyInsights && (
                                <div className="rounded-md border p-3 space-y-2">
                                    <div className="text-sm font-medium">Policy Health ({moderationPolicyInsights.windowHours}h)</div>
                                    <div className="grid gap-2 md:grid-cols-4 text-xs">
                                        <div className="rounded border p-2">
                                            <div className="text-muted-foreground">Assignment events</div>
                                            <div className="text-sm font-medium">{moderationPolicyInsights.assignments.total}</div>
                                        </div>
                                        <div className="rounded border p-2">
                                            <div className="text-muted-foreground">Fairness overrides</div>
                                            <div className="text-sm font-medium">{moderationPolicyInsights.assignments.overrideCount}</div>
                                        </div>
                                        <div className="rounded border p-2">
                                            <div className="text-muted-foreground">Alerted assignments</div>
                                            <div className="text-sm font-medium">{moderationPolicyInsights.assignments.alertEventCount}</div>
                                        </div>
                                        <div className="rounded border p-2">
                                            <div className="text-muted-foreground">Pending skew</div>
                                            <div className="text-sm font-medium">{moderationPolicyInsights.pending.pendingSkew}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Top routed reviewer: {formatReviewerLabel(
                                            moderationPolicyInsights.assignments.topReviewerId,
                                            'n/a',
                                        )}
                                        {' • '}
                                        Share {Math.round((moderationPolicyInsights.assignments.topReviewerShare || 0) * 100)}%
                                    </div>
                                    {Object.keys(moderationPolicyInsights.assignments.alertCodeCounts).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(moderationPolicyInsights.assignments.alertCodeCounts)
                                                .sort((left, right) => right[1] - left[1])
                                                .map(([code, count]) => (
                                                    <Badge key={code} variant="outline">
                                                        {code} {count}
                                                    </Badge>
                                                ))}
                                        </div>
                                    )}
                                    {Object.keys(moderationPolicyInsights.assignments.playbookCounts).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(moderationPolicyInsights.assignments.playbookCounts)
                                                .sort((left, right) => right[1] - left[1])
                                                .map(([playbookId, count]) => (
                                                    <Badge key={playbookId} variant="outline">
                                                        {playbookId} {count}
                                                    </Badge>
                                                ))}
                                        </div>
                                    )}
                                    {moderationPolicyInsights.trends.length > 0 && (
                                        <div className="rounded-md border overflow-x-auto">
                                            <table className="min-w-full text-xs">
                                                <thead className="bg-muted/40">
                                                    <tr>
                                                        <th className="text-left px-3 py-2">Date</th>
                                                        <th className="text-right px-3 py-2">Assignments</th>
                                                        <th className="text-right px-3 py-2">Overrides</th>
                                                        <th className="text-right px-3 py-2">Alerts</th>
                                                        <th className="text-left px-3 py-2">Top Alert</th>
                                                        <th className="text-left px-3 py-2">Top Playbook</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {moderationPolicyInsights.trends.map((trendRow) => (
                                                        <tr key={trendRow.date} className="border-t">
                                                            <td className="px-3 py-2">{trendRow.date}</td>
                                                            <td className="px-3 py-2 text-right">{trendRow.assignments}</td>
                                                            <td className="px-3 py-2 text-right">{trendRow.overrides}</td>
                                                            <td className="px-3 py-2 text-right">{trendRow.alertEvents}</td>
                                                            <td className="px-3 py-2">{trendRow.topAlertCode || 'n/a'}</td>
                                                            <td className="px-3 py-2">{trendRow.topPlaybookId || 'n/a'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleRunEscalationSweep(true)}
                                    disabled={runningEscalationSweep || featureDisabled}
                                >
                                    {runningEscalationSweep ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Dry Run Sweep
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleRunEscalationSweep(false)}
                                    disabled={runningEscalationSweep || featureDisabled}
                                >
                                    {runningEscalationSweep ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Run Escalations
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleExportModerationAudit('json')}
                                    disabled={exportingModerationAudit}
                                >
                                    {exportingModerationAudit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    Export JSON
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleExportModerationAudit('csv')}
                                    disabled={exportingModerationAudit}
                                >
                                    {exportingModerationAudit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    Export CSV
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleExportPolicyInsights()}
                                    disabled={exportingPolicyInsights}
                                >
                                    {exportingPolicyInsights ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    Export Policy Trends
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowOnlyPendingModeration((prev) => !prev)}
                                >
                                    {showOnlyPendingModeration ? 'Show All Tasks' : 'Show Pending Only'}
                                </Button>
                            </div>
                            {visibleModerationTasks.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No moderation tasks yet.</p>
                            ) : (
                                visibleModerationTasks.map((task) => {
                                    const approvalSummary = getApprovalSummary(task);
                                    const assignmentDraft = getModerationAssignmentDraft(task);
                                    return (
                                        <div
                                            key={task.id}
                                            className="rounded-lg border p-3 flex flex-col gap-3"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge className={moderationBadgeClass(task.status)}>
                                                    {task.status}
                                                </Badge>
                                                {task.sla?.isBreached && (
                                                    <Badge className="bg-red-100 text-red-800">SLA Breached</Badge>
                                                )}
                                                {task.sla?.isEscalated && (
                                                    <Badge className="bg-orange-100 text-orange-800">Escalated</Badge>
                                                )}
                                                {approvalSummary && approvalSummary.requiredApprovals > 1 && (
                                                    <Badge variant="outline">
                                                        Approvals {approvalSummary.approvedCount}/{approvalSummary.requiredApprovals}
                                                    </Badge>
                                                )}
                                                <span className="text-xs text-muted-foreground break-all">
                                                    Task {task.id}
                                                </span>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Asset: {task.asset?.url || task.assetId}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Due {formatDate(task.sla?.dueAt || task.dueAt)} • Escalate {formatDate(task.sla?.escalateAt || null)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Reviewer {formatReviewerLabel(task.reviewerId, 'unassigned')}
                                                {' • '}
                                                Backup {formatReviewerLabel(task.backupReviewerId, 'none')}
                                            </div>
                                            {approvalSummary && approvalSummary.requiredApprovals > 1 && (
                                                <div className="text-xs text-muted-foreground">
                                                    Workflow {approvalSummary.mode}
                                                    {approvalSummary.nextReviewerId
                                                        ? ` • Next reviewer ${formatReviewerLabel(approvalSummary.nextReviewerId, approvalSummary.nextReviewerId)}`
                                                        : ''}
                                                </div>
                                            )}
                                            <div className="grid gap-2 md:grid-cols-2">
                                                <div className="space-y-1">
                                                    <Label htmlFor={`moderation-reviewer-${task.id}`} className="text-xs text-muted-foreground">
                                                        Reviewer Id
                                                    </Label>
                                                    <select
                                                        id={`moderation-reviewer-${task.id}`}
                                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                                        value={assignmentDraft.reviewerId}
                                                        onChange={(event) => updateModerationAssignmentDraft(task, { reviewerId: event.target.value })}
                                                        disabled={assigningModerationTaskId === task.id || featureDisabled}
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {reviewers.map((reviewer) => (
                                                            <option key={reviewer.id} value={reviewer.id}>
                                                                {reviewer.name} ({reviewer.role}, {reviewer.pendingTasks} pending)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor={`moderation-backup-${task.id}`} className="text-xs text-muted-foreground">
                                                        Backup Reviewer Id
                                                    </Label>
                                                    <select
                                                        id={`moderation-backup-${task.id}`}
                                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                                        value={assignmentDraft.backupReviewerId}
                                                        onChange={(event) => updateModerationAssignmentDraft(task, { backupReviewerId: event.target.value })}
                                                        disabled={assigningModerationTaskId === task.id || featureDisabled}
                                                    >
                                                        <option value="">None</option>
                                                        {reviewers.map((reviewer) => (
                                                            <option key={reviewer.id} value={reviewer.id}>
                                                                {reviewer.name} ({reviewer.role}, {reviewer.pendingTasks} pending)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor={`moderation-chain-${task.id}`} className="text-xs text-muted-foreground">
                                                        Escalation Chain
                                                    </Label>
                                                    <div
                                                        id={`moderation-chain-${task.id}`}
                                                        className="max-h-32 overflow-y-auto rounded-md border p-2 space-y-1"
                                                    >
                                                        {reviewers.length === 0 ? (
                                                            <div className="text-xs text-muted-foreground">No reviewers available</div>
                                                        ) : (
                                                            reviewers.map((reviewer) => (
                                                                <label key={`${task.id}-${reviewer.id}`} className="flex items-center gap-2 text-xs">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={assignmentDraft.escalationChain.includes(reviewer.id)}
                                                                        onChange={(event) => toggleEscalationChainReviewer(task, reviewer.id, event.target.checked)}
                                                                        disabled={assigningModerationTaskId === task.id || featureDisabled}
                                                                    />
                                                                    <span>{reviewer.name} ({reviewer.role}, {reviewer.pendingTasks} pending)</span>
                                                                </label>
                                                            ))
                                                        )}
                                                    </div>
                                                    {assignmentDraft.escalationChain.length > 0 && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Order: {assignmentDraft.escalationChain
                                                                .map((reviewerId) => formatReviewerLabel(reviewerId, reviewerId))
                                                                .join(' -> ')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor={`moderation-team-lead-${task.id}`} className="text-xs text-muted-foreground">
                                                        Team Lead Id
                                                    </Label>
                                                    <select
                                                        id={`moderation-team-lead-${task.id}`}
                                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                                        value={assignmentDraft.teamLeadId}
                                                        onChange={(event) => updateModerationAssignmentDraft(task, { teamLeadId: event.target.value })}
                                                        disabled={assigningModerationTaskId === task.id || featureDisabled}
                                                    >
                                                        <option value="">None</option>
                                                        {teamLeadReviewers.map((reviewer) => (
                                                            <option key={reviewer.id} value={reviewer.id}>
                                                                {reviewer.name} ({reviewer.role}, {reviewer.pendingTasks} pending)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor={`moderation-assignment-reason-${task.id}`} className="text-xs text-muted-foreground">
                                                    Assignment Note
                                                </Label>
                                                <Input
                                                    id={`moderation-assignment-reason-${task.id}`}
                                                    value={assignmentDraft.reason}
                                                    onChange={(event) => updateModerationAssignmentDraft(task, { reason: event.target.value })}
                                                    placeholder="reason for reassign/escalation updates"
                                                    disabled={assigningModerationTaskId === task.id || featureDisabled}
                                                />
                                            </div>
                                            {recommendedReviewers.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {recommendedReviewers.map((reviewer) => (
                                                        <Button
                                                            key={`${task.id}-recommended-${reviewer.id}`}
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => updateModerationAssignmentDraft(task, {
                                                                reviewerId: reviewer.id,
                                                                reason: assignmentDraft.reason || `Load-balance recommendation: ${reviewer.name}`,
                                                            })}
                                                            disabled={assigningModerationTaskId === task.id || featureDisabled}
                                                        >
                                                            Assign {reviewer.name} ({reviewer.pendingTasks})
                                                        </Button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void handleClaimModerationTask(task.id)}
                                                    disabled={task.status !== 'pending' || assigningModerationTaskId === task.id || featureDisabled}
                                                >
                                                    {assigningModerationTaskId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}
                                                    Claim
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void handleSaveModerationAssignment(task)}
                                                    disabled={task.status !== 'pending' || assigningModerationTaskId === task.id || featureDisabled}
                                                >
                                                    {assigningModerationTaskId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                                    Save Routing
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void handleModerationDecision(task.id, 'approved')}
                                                    disabled={task.status !== 'pending' || mutatingModerationTaskId === task.id || featureDisabled}
                                                >
                                                    {mutatingModerationTaskId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                                    Approve
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void handleModerationDecision(task.id, 'needs_changes')}
                                                    disabled={task.status !== 'pending' || mutatingModerationTaskId === task.id || featureDisabled}
                                                >
                                                    {mutatingModerationTaskId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
                                                    Needs Changes
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void handleModerationDecision(task.id, 'rejected')}
                                                    disabled={task.status !== 'pending' || mutatingModerationTaskId === task.id || featureDisabled}
                                                >
                                                    {mutatingModerationTaskId === task.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                                                    Reject
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Vault Assets</CardTitle>
                            <CardDescription>
                                Current media inventory and usage counts.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {assets.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No assets yet.</p>
                            ) : (
                                assets.map((asset) => (
                                    (() => {
                                        const moderationStatus = getModerationStatus(asset);
                                        const provenanceSource = getProvenanceSource(asset);
                                        const moderationReason = readString(asset.metadata, 'moderationReason');
                                        const selected = selectedAssetSet.has(asset.id);
                                        return (
                                            <div
                                                key={asset.id}
                                                className={`rounded-lg border p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${selected ? 'ring-2 ring-primary/40' : ''}`}
                                            >
                                                <div className="space-y-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                                            <input
                                                                type="checkbox"
                                                                checked={selected}
                                                                onChange={() => toggleAssetSelection(asset.id)}
                                                            />
                                                            Select
                                                        </label>
                                                        <Badge variant="outline">{asset.type}</Badge>
                                                        <Badge>{asset.folder}</Badge>
                                                        <Badge className={moderationBadgeClass(moderationStatus)}>
                                                            {moderationStatus}
                                                        </Badge>
                                                        <Badge variant="outline">
                                                            {PROVENANCE_LABELS[provenanceSource]}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground">Used {asset.usageCount} times</span>
                                                    </div>
                                                    <a
                                                        className="text-sm text-primary hover:underline break-all"
                                                        href={asset.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        {asset.url}
                                                    </a>
                                                    <div className="text-xs text-muted-foreground">
                                                        Added {formatDate(asset.createdAt)}
                                                    </div>
                                                    {moderationReason && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Reason: {moderationReason}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void handleQueueModerationTask(asset.id)}
                                                        disabled={queueingModerationAssetId === asset.id || featureDisabled}
                                                    >
                                                        {queueingModerationAssetId === asset.id
                                                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            : <ClipboardCheck className="mr-2 h-4 w-4" />}
                                                        Queue Review
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void handleDeleteAsset(asset.id)}
                                                        disabled={mutatingAssetId === asset.id || featureDisabled}
                                                    >
                                                        {mutatingAssetId === asset.id
                                                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            : <Trash2 className="mr-2 h-4 w-4" />}
                                                        Remove
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })()
                                ))
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="credentials" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <KeyRound className="h-5 w-5" />
                                Save Credential
                            </CardTitle>
                            <CardDescription>
                                Store channel tokens used by the publish workers.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSaveCredential}>
                                <div className="space-y-2">
                                    <Label htmlFor="credentialChannel">Channel</Label>
                                    <select
                                        id="credentialChannel"
                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                        value={credentialForm.channel}
                                        onChange={(event) => setCredentialForm((prev) => ({
                                            ...prev,
                                            channel: event.target.value as GrowthChannel,
                                        }))}
                                    >
                                        <option value="pinterest">Pinterest</option>
                                        <option value="youtube_shorts">YouTube Shorts</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="providerAccountId">Provider Account ID (optional)</Label>
                                    <Input
                                        id="providerAccountId"
                                        value={credentialForm.providerAccountId}
                                        onChange={(event) => setCredentialForm((prev) => ({ ...prev, providerAccountId: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="accessToken">Access Token</Label>
                                    <Input
                                        id="accessToken"
                                        type="password"
                                        value={credentialForm.accessToken}
                                        onChange={(event) => setCredentialForm((prev) => ({ ...prev, accessToken: event.target.value }))}
                                        placeholder="Required"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="refreshToken">Refresh Token (optional)</Label>
                                    <Input
                                        id="refreshToken"
                                        type="password"
                                        value={credentialForm.refreshToken}
                                        onChange={(event) => setCredentialForm((prev) => ({ ...prev, refreshToken: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="accessTokenExpiresAt">Access Expires At (ISO)</Label>
                                    <Input
                                        id="accessTokenExpiresAt"
                                        value={credentialForm.accessTokenExpiresAt}
                                        onChange={(event) => setCredentialForm((prev) => ({ ...prev, accessTokenExpiresAt: event.target.value }))}
                                        placeholder="2026-02-15T00:00:00Z"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="refreshTokenExpiresAt">Refresh Expires At (ISO)</Label>
                                    <Input
                                        id="refreshTokenExpiresAt"
                                        value={credentialForm.refreshTokenExpiresAt}
                                        onChange={(event) => setCredentialForm((prev) => ({ ...prev, refreshTokenExpiresAt: event.target.value }))}
                                        placeholder="2026-03-15T00:00:00Z"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="credentialScopes">Scopes (comma separated)</Label>
                                    <Input
                                        id="credentialScopes"
                                        value={credentialForm.scopes}
                                        onChange={(event) => setCredentialForm((prev) => ({ ...prev, scopes: event.target.value }))}
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <Button type="submit" disabled={savingCredential || featureDisabled}>
                                        {savingCredential ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                                        Save Credential
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                        {(['pinterest', 'youtube_shorts'] as GrowthChannel[]).map((channel) => {
                            const credential = credentialByChannel.get(channel);
                            const isMutating = mutatingChannel === channel;
                            return (
                                <Card key={channel}>
                                    <CardHeader>
                                        <CardTitle>{CHANNEL_LABELS[channel]}</CardTitle>
                                        <CardDescription>
                                            Token health and manual controls.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="space-y-1 text-sm">
                                            <div>
                                                Status:{' '}
                                                {credential ? (
                                                    credential.revoked ? (
                                                        <Badge className="bg-red-100 text-red-800">revoked</Badge>
                                                    ) : (
                                                        <Badge className="bg-emerald-100 text-emerald-800">configured</Badge>
                                                    )
                                                ) : (
                                                    <Badge variant="outline">not configured</Badge>
                                                )}
                                            </div>
                                            <div className="text-muted-foreground">
                                                Access expiry: {formatDate(credential?.accessTokenExpiresAt)}
                                            </div>
                                            <div className="text-muted-foreground">
                                                Refresh token: {credential?.hasRefreshToken ? 'available' : 'missing'}
                                            </div>
                                            <div className="text-muted-foreground">
                                                Updated: {formatDate(credential?.updatedAt)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void handleRefreshCredential(channel)}
                                                disabled={isMutating || featureDisabled || !credential || credential.revoked}
                                            >
                                                {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                                Refresh
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => void handleRevokeCredential(channel)}
                                                disabled={isMutating || featureDisabled || !credential || credential.revoked}
                                            >
                                                Revoke
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
