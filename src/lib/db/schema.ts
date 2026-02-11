import { pgTable, text, integer, real, boolean, timestamp, jsonb, uuid, index, unique, check, numeric } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
export { sql };

// ===========================================
// DOMAINS: The foundation. Every domain in the portfolio.
// ===========================================
export const domains = pgTable('domains', {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain').notNull().unique(),
    tld: text('tld').notNull(),
    registrar: text('registrar').default('godaddy'),
    purchaseDate: timestamp('purchase_date', { mode: 'date' }),
    purchasePrice: real('purchase_price'),
    renewalDate: timestamp('renewal_date', { mode: 'date' }),
    renewalPrice: real('renewal_price'),

    // Classification
    status: text('status', {
        enum: ['parked', 'active', 'redirect', 'forsale', 'defensive']
    }).notNull().default('parked'),
    bucket: text('bucket', {
        enum: ['build', 'redirect', 'park', 'defensive']
    }).notNull().default('build'),
    tier: integer('tier').default(3),
    niche: text('niche'),
    subNiche: text('sub_niche'),

    // Redirect config
    redirectTargetId: uuid('redirect_target_id'),

    // Deployment
    githubRepo: text('github_repo'),
    cloudflareProject: text('cloudflare_project'),
    isDeployed: boolean('is_deployed').default(false),
    lastDeployedAt: timestamp('last_deployed_at'),
    siteTemplate: text('site_template', {
        enum: ['authority', 'comparison', 'calculator', 'review', 'tool', 'hub', 'decision', 'cost_guide', 'niche', 'info', 'consumer', 'brand']
    }).default('authority'),
    // Organization & Infrastructure
    vertical: text('vertical'), // 'Legal', 'Insurance', 'Health', etc.
    cloudflareAccount: text('cloudflare_account'), // 'legal-content-1@...', etc.

    // Design & Strategy
    themeStyle: text('theme_style'), // 'navy-serif', 'green-modern', 'medical-clean'
    monetizationModel: text('monetization_model'), // 'Lead gen', 'Display + affiliate', etc.
    monetizationTier: integer('monetization_tier').default(3), // 1=Lead Gen Only, 2=Affiliate Pri, 3=Display Pri, 4=Brand

    // Valuation
    estimatedRevenueAtMaturityLow: real('estimated_revenue_at_maturity_low'),
    estimatedRevenueAtMaturityHigh: real('estimated_revenue_at_maturity_high'),
    estimatedFlipValueLow: real('estimated_flip_value_low'),
    estimatedFlipValueHigh: real('estimated_flip_value_high'),
    estimatedMonthlyRevenueLow: real('estimated_monthly_revenue_low'),
    estimatedMonthlyRevenueHigh: real('estimated_monthly_revenue_high'),

    // Notes
    notes: text('notes'),
    tags: jsonb('tags').$type<string[]>().default([]),
    contentConfig: jsonb('content_config').$type<{
        voiceSeed?: {
            name: string;
            background: string;
            quirk: string;
            toneDial: number;
            tangents: string;
            petPhrase: string;
            formatting: string;
        };
        schedule?: {
            frequency: 'daily' | 'weekly' | 'sporadic';
            timeOfDay: 'morning' | 'evening' | 'random';
            wordCountRange: [number, number];
        };
        contentTypeMix?: {
            article: number;
            comparison: number;
            tool: number;
            guide: number;
        };
    }>().default({}),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    statusIdx: index('domain_status_idx').on(t.status),
    tierIdx: index('domain_tier_idx').on(t.tier),
    bucketIdx: index('domain_bucket_idx').on(t.bucket), // Note: This references operational bucket
    verticalIdx: index('domain_vertical_idx').on(t.vertical),
}));

// ===========================================
// KEYWORDS: Target keywords for each domain
// ===========================================
export const keywords = pgTable('keywords', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    keyword: text('keyword').notNull(),

    // Search metrics
    monthlyVolume: integer('monthly_volume'),
    cpc: real('cpc'),
    difficulty: integer('difficulty'),
    serpPosition: integer('serp_position'),

    // Content mapping
    articleId: uuid('article_id'),
    intent: text('intent', {
        enum: ['informational', 'transactional', 'navigational', 'commercial']
    }).default('informational'),

    // Status
    status: text('status', {
        enum: ['queued', 'assigned', 'ranking', 'abandoned']
    }).default('queued'),
    priority: integer('priority').default(5),

    // Timestamps
    lastCheckedAt: timestamp('last_checked_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    domainIdx: index('keyword_domain_idx').on(t.domainId),
    statusIdx: index('keyword_status_idx').on(t.status),
    priorityIdx: index('keyword_priority_idx').on(t.priority),
}));

// ===========================================
// ARTICLES: Every piece of content across all domains
// ===========================================
export const articles = pgTable('articles', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),

    // Content
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    metaDescription: text('meta_description'),
    contentMarkdown: text('content_markdown'),
    contentHtml: text('content_html'),
    wordCount: integer('word_count'),

    // SEO
    targetKeyword: text('target_keyword'),
    secondaryKeywords: jsonb('secondary_keywords').$type<string[]>().default([]),
    headerStructure: jsonb('header_structure'),
    internalLinks: jsonb('internal_links'),
    externalLinks: jsonb('external_links'),
    schemaMarkup: jsonb('schema_markup'),

    // Research
    researchData: jsonb('research_data').$type<{
        statistics: Array<{ stat: string; source: string; date: string }>;
        quotes: Array<{ quote: string; author: string; source: string }>;
        competitorHooks: string[];
        recentDevelopments: string[];
    }>(),

    // AI Generation metadata
    aiModel: text('ai_model'),
    aiPromptVersion: text('ai_prompt_version'),
    generationPasses: integer('generation_passes').default(0),
    generationCost: real('generation_cost'),
    humanizationScore: real('humanization_score'),

    // Content fingerprint for duplicate detection
    contentFingerprint: text('content_fingerprint'),

    // Monetization
    monetizationElements: jsonb('monetization_elements'),

    // Publishing
    status: text('status', {
        enum: ['generating', 'draft', 'review', 'approved', 'published', 'archived']
    }).default('draft'),
    publishedAt: timestamp('published_at'),
    isSeedArticle: boolean('is_seed_article').default(false),

    // Performance
    pageviews30d: integer('pageviews_30d').default(0),
    uniqueVisitors30d: integer('unique_visitors_30d').default(0),
    avgTimeOnPage: integer('avg_time_on_page'),
    bounceRate: real('bounce_rate'),
    revenue30d: real('revenue_30d').default(0),

    // Content freshness
    lastRefreshedAt: timestamp('last_refreshed_at'),
    stalenessScore: real('staleness_score'),

    // YMYL & Review
    ymylLevel: text('ymyl_level', {
        enum: ['none', 'low', 'medium', 'high']
    }).default('none'),
    lastReviewedAt: timestamp('last_reviewed_at'),
    lastReviewedBy: uuid('last_reviewed_by'),
    publishedBy: uuid('published_by'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    domainIdx: index('article_domain_idx').on(t.domainId),
    statusIdx: index('article_status_idx').on(t.status),
    createdIdx: index('article_created_idx').on(t.createdAt),
}));

// ===========================================
// MONETIZATION PROFILES: Per-domain monetization config
// ===========================================
export const monetizationProfiles = pgTable('monetization_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }).unique(),

    // Ad Networks
    adNetwork: text('ad_network', {
        enum: ['ezoic', 'mediavine', 'adsense', 'none']
    }).default('ezoic'),
    adNetworkId: text('ad_network_id'),
    adPlacements: jsonb('ad_placements').$type<Array<{ position: string; type: string }>>().default([]),

    // Affiliate Programs
    affiliates: jsonb('affiliates').$type<Array<{
        provider: string;
        programId: string;
        linkTemplate: string;
        commissionType: string;
        commissionValue: number;
    }>>().default([]),

    // CTA Templates
    ctaTemplates: jsonb('cta_templates').$type<Array<{
        name: string;
        html: string;
        placement: string;
        conditions?: Record<string, unknown>;
    }>>().default([]),

    // Lead Gen
    leadGenEnabled: boolean('lead_gen_enabled').default(false),
    leadGenFormType: text('lead_gen_form_type'),
    leadGenEndpoint: text('lead_gen_endpoint'),
    leadGenValue: real('lead_gen_value'),

    // Revenue tracking
    totalRevenue: real('total_revenue').default(0),
    revenueLast30d: real('revenue_last_30d').default(0),
    revenuePerArticle: real('revenue_per_article').default(0),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ===========================================
// CONTENT QUEUE: Async job processing for AI generation
// ===========================================
export const contentQueue = pgTable('content_queue', {
    id: uuid('id').primaryKey().defaultRandom(),

    // Job definition
    jobType: text('job_type', {
        enum: [
            'generate_outline', 'generate_draft', 'humanize',
            'seo_optimize', 'generate_meta', 'deploy',
            'fetch_analytics', 'keyword_research', 'bulk_seed',
            'research', 'evaluate', 'content_refresh',
            'fetch_gsc', 'check_backlinks', 'check_renewals'
        ]
    }).notNull(),

    // References
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'cascade' }),
    keywordId: uuid('keyword_id').references(() => keywords.id),

    // Job data
    payload: jsonb('payload').default({}),
    result: jsonb('result'),

    // Status
    status: text('status', {
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled']
    }).default('pending'),
    priority: integer('priority').default(0), // Higher is better
    attempts: integer('attempts').default(0),
    maxAttempts: integer('max_attempts').default(3),
    errorMessage: text('error_message'),

    // Cost tracking
    apiTokensUsed: integer('api_tokens_used').default(0),
    apiCost: real('api_cost').default(0),

    // Timing
    createdAt: timestamp('created_at').defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // Scheduling
    scheduledFor: timestamp('scheduled_for'), // For future scheduling
    lockedUntil: timestamp('locked_until'), // For worker locking
});

// ===========================================
// DOMAIN RESEARCH LOG: Track domains investigated
// ===========================================
export const domainResearch = pgTable('domain_research', {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain').notNull().unique(),
    tld: text('tld').notNull(),

    // Availability
    isAvailable: boolean('is_available'),
    registrationPrice: real('registration_price'),
    aftermarketPrice: real('aftermarket_price'),

    // Scoring
    keywordVolume: integer('keyword_volume'),
    keywordCpc: real('keyword_cpc'),
    estimatedRevenuePotential: real('estimated_revenue_potential'),
    domainScore: real('domain_score'),

    // Full evaluation data
    evaluationResult: jsonb('evaluation_result'),
    evaluationHistory: jsonb('evaluation_history').$type<Array<{
        evaluatedAt: string;
        compositeScore: number;
        recommendation: string;
        mode: string;
    }>>().default([]),
    evaluatedAt: timestamp('evaluated_at'),

    // Decision
    decision: text('decision', {
        enum: ['researching', 'buy', 'pass', 'watchlist', 'bought']
    }).default('researching'),
    decisionReason: text('decision_reason'),

    // If bought, link to domains table
    domainId: uuid('domain_id').references(() => domains.id),

    createdAt: timestamp('created_at').defaultNow(),
});

// ===========================================
// REVENUE SNAPSHOTS: Daily revenue tracking per domain
// ===========================================
export const revenueSnapshots = pgTable('revenue_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { mode: 'date' }).notNull(),

    // Revenue breakdown
    adRevenue: real('ad_revenue').default(0),
    affiliateRevenue: real('affiliate_revenue').default(0),
    leadGenRevenue: real('lead_gen_revenue').default(0),
    totalRevenue: real('total_revenue').default(0),

    // Traffic
    pageviews: integer('pageviews').default(0),
    uniqueVisitors: integer('unique_visitors').default(0),
    organicVisitors: integer('organic_visitors').default(0),

    // SEO
    avgPosition: real('avg_position'),
    impressions: integer('impressions').default(0),
    clicks: integer('clicks').default(0),
    ctr: real('ctr'),

    createdAt: timestamp('created_at').defaultNow(),
});

// ===========================================
// SITE TEMPLATES: Reusable site templates
// ===========================================
export const siteTemplates = pgTable('site_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    description: text('description'),

    // Template source
    githubTemplateRepo: text('github_template_repo'),

    // Configuration
    defaultConfig: jsonb('default_config').default({}),
    layoutComponents: jsonb('layout_components').$type<string[]>().default([]),
    colorSchemes: jsonb('color_schemes').default([]),

    // Monetization defaults
    defaultAdPlacements: jsonb('default_ad_placements').default([]),
    defaultCtaPositions: jsonb('default_cta_positions').$type<string[]>().default([]),

    createdAt: timestamp('created_at').defaultNow(),
});

// ===========================================
// API CALL LOGS: Track every AI API call for cost monitoring
// ===========================================
export const apiCallLogs = pgTable('api_call_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id').references(() => articles.id),
    domainId: uuid('domain_id').references(() => domains.id),

    stage: text('stage', {
        enum: ['keyword_research', 'outline', 'draft', 'humanize', 'seo', 'meta', 'classify', 'research', 'evaluate']
    }).notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cost: real('cost').notNull(),
    durationMs: integer('duration_ms'),

    createdAt: timestamp('created_at').defaultNow(),
});

// ===========================================
// EXPENSES: Track all portfolio costs for ROI calculations
// ===========================================
export const expenses = pgTable('expenses', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),

    category: text('category', {
        enum: ['domain_registration', 'domain_renewal', 'hosting', 'content', 'ai_api', 'tools', 'design', 'other']
    }).notNull(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('USD'),
    recurring: boolean('recurring').default(false),
    recurringInterval: text('recurring_interval', {
        enum: ['monthly', 'quarterly', 'yearly']
    }),

    expenseDate: timestamp('expense_date', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    recurring_check: check('recurring_check', sql`NOT ${t.recurring} OR ${t.recurringInterval} IS NOT NULL`),
    dateIdx: index('expense_date_idx').on(t.expenseDate),
    categoryIdx: index('expense_category_idx').on(t.category),
}));

// ===========================================
// NOTIFICATIONS: In-app notifications and alerts
// ===========================================
export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),

    type: text('type', {
        enum: ['renewal_warning', 'job_failed', 'deploy_failed', 'traffic_drop',
            'revenue_milestone', 'content_stale', 'domain_expiring', 'backlink_lost', 'info']
    }).notNull(),
    severity: text('severity', {
        enum: ['info', 'warning', 'critical']
    }).notNull().default('info'),

    title: text('title').notNull(),
    message: text('message').notNull(),
    actionUrl: text('action_url'),
    isRead: boolean('is_read').default(false),
    emailSent: boolean('email_sent').default(false),

    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    isReadIdx: index('notification_is_read_idx').on(t.isRead),
    domainIdx: index('notification_domain_idx').on(t.domainId),
    typeIdx: index('notification_type_idx').on(t.type),
}));

// ===========================================
// COMPETITORS: Track competitor domains and their performance
// ===========================================
export const competitors = pgTable('competitors', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    competitorDomain: text('competitor_domain').notNull(),

    // Tracked metrics
    estimatedTraffic: integer('estimated_traffic'),
    domainAuthority: integer('domain_authority'),
    totalKeywords: integer('total_keywords'),
    topKeywords: jsonb('top_keywords').$type<Array<{
        keyword: string;
        position: number;
        volume: number;
    }>>().default([]),

    // Content analysis
    totalPages: integer('total_pages'),
    avgContentLength: integer('avg_content_length'),
    publishFrequency: text('publish_frequency'),

    notes: text('notes'),

    lastCheckedAt: timestamp('last_checked_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    unq: unique().on(t.domainId, t.competitorDomain)
}));

// ===========================================
// BACKLINK SNAPSHOTS: Track backlink profile over time
// ===========================================
export const backlinkSnapshots = pgTable('backlink_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),

    totalBacklinks: integer('total_backlinks').default(0),
    referringDomains: integer('referring_domains').default(0),
    domainAuthority: integer('domain_authority'),

    topBacklinks: jsonb('top_backlinks').$type<Array<{
        source: string;
        target: string;
        anchor: string;
        authority: number;
        firstSeen: string;
    }>>().default([]),

    lostBacklinks: jsonb('lost_backlinks').$type<Array<{
        source: string;
        target: string;
        lostDate: string;
    }>>().default([]),

    snapshotDate: timestamp('snapshot_date', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// ===========================================
// USERS: Multi-user auth with roles
// ===========================================
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', {
        enum: ['admin', 'editor', 'reviewer', 'expert']
    }).notNull().default('editor'),
    expertise: jsonb('expertise').$type<string[]>().default([]),
    credentials: text('credentials'),
    isActive: boolean('is_active').default(true),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    emailIdx: index('user_email_idx').on(t.email),
    roleIdx: index('user_role_idx').on(t.role),
    activeIdx: index('user_active_idx').on(t.isActive),
}));

// ===========================================
// SESSIONS: Auth session tokens
// ===========================================
export const sessions = pgTable('sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    tokenIdx: index('session_token_idx').on(t.token),
    expiresIdx: index('session_expires_idx').on(t.expiresAt),
    userIdx: index('session_user_idx').on(t.userId),
}));

// ===========================================
// CONTENT REVISIONS: Immutable content snapshots
// ===========================================
export const contentRevisions = pgTable('content_revisions', {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    title: text('title'),
    contentMarkdown: text('content_markdown'),
    metaDescription: text('meta_description'),
    contentHash: text('content_hash'),
    wordCount: integer('word_count'),
    changeType: text('change_type', {
        enum: ['ai_generated', 'ai_refined', 'manual_edit', 'status_change', 'bulk_refresh']
    }).notNull(),
    changeSummary: text('change_summary'),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    articleRevIdx: unique('article_revision_unq').on(t.articleId, t.revisionNumber),
    articleIdx: index('revision_article_idx').on(t.articleId),
    createdIdx: index('revision_created_idx').on(t.createdAt),
}));

// ===========================================
// REVIEW EVENTS: Append-only audit log
// ===========================================
export const reviewEvents = pgTable('review_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    revisionId: uuid('revision_id').references(() => contentRevisions.id),
    actorId: uuid('actor_id').notNull().references(() => users.id),
    actorRole: text('actor_role').notNull(),
    eventType: text('event_type', {
        enum: [
            'created', 'edited', 'submitted_for_review', 'approved', 'rejected',
            'published', 'archived', 'reverted', 'comment', 'qa_completed', 'expert_signed'
        ]
    }).notNull(),
    reasonCode: text('reason_code'),
    rationale: text('rationale'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    articleIdx: index('review_event_article_idx').on(t.articleId),
    actorIdx: index('review_event_actor_idx').on(t.actorId),
    typeIdx: index('review_event_type_idx').on(t.eventType),
    createdIdx: index('review_event_created_idx').on(t.createdAt),
}));

// ===========================================
// QA CHECKLIST TEMPLATES: Configurable review checklists
// ===========================================
export const qaChecklistTemplates = pgTable('qa_checklist_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    contentType: text('content_type'),
    ymylLevel: text('ymyl_level', {
        enum: ['none', 'low', 'medium', 'high']
    }),
    items: jsonb('items').$type<Array<{
        id: string;
        category: string;
        label: string;
        required: boolean;
    }>>().default([]),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ===========================================
// QA CHECKLIST RESULTS: Completed checklist records
// ===========================================
export const qaChecklistResults = pgTable('qa_checklist_results', {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => qaChecklistTemplates.id),
    reviewerId: uuid('reviewer_id').notNull().references(() => users.id),
    results: jsonb('results').$type<Record<string, { checked: boolean; notes?: string }>>().default({}),
    allPassed: boolean('all_passed').default(false),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    articleIdx: index('qa_result_article_idx').on(t.articleId),
    reviewerIdx: index('qa_result_reviewer_idx').on(t.reviewerId),
}));

// ===========================================
// APPROVAL POLICIES: Per-domain/YMYL approval rules
// ===========================================
export const approvalPolicies = pgTable('approval_policies', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
    contentType: text('content_type'),
    ymylLevel: text('ymyl_level', {
        enum: ['none', 'low', 'medium', 'high']
    }).notNull(),
    requiredRole: text('required_role', {
        enum: ['editor', 'reviewer', 'expert', 'admin']
    }).notNull().default('reviewer'),
    requiresQaChecklist: boolean('requires_qa_checklist').default(true),
    requiresExpertSignoff: boolean('requires_expert_signoff').default(false),
    autoPublish: boolean('auto_publish').default(false),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    domainIdx: index('approval_policy_domain_idx').on(t.domainId),
    ymylIdx: index('approval_policy_ymyl_idx').on(t.ymylLevel),
}));

// ===========================================
// CITATIONS: Structured source citations per article
// ===========================================
export const citations = pgTable('citations', {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    claimText: text('claim_text'),
    sourceUrl: text('source_url').notNull(),
    sourceTitle: text('source_title'),
    retrievedAt: timestamp('retrieved_at').notNull(),
    quotedSnippet: text('quoted_snippet'),
    notes: text('notes'),
    position: integer('position').default(0),
    createdById: uuid('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    articleIdx: index('citation_article_idx').on(t.articleId),
}));

// ===========================================
// DISCLOSURE CONFIGS: Per-domain compliance settings
// ===========================================
export const disclosureConfigs = pgTable('disclosure_configs', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }).unique(),
    affiliateDisclosure: text('affiliate_disclosure'),
    adDisclosure: text('ad_disclosure'),
    notAdviceDisclaimer: text('not_advice_disclaimer'),
    howWeMoneyPage: text('how_we_money_page'),
    editorialPolicyPage: text('editorial_policy_page'),
    aboutPage: text('about_page'),
    showReviewedBy: boolean('show_reviewed_by').default(true),
    showLastUpdated: boolean('show_last_updated').default(true),
    showChangeLog: boolean('show_change_log').default(false),
    showMethodology: boolean('show_methodology').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// ===========================================
// COMPLIANCE SNAPSHOTS: Daily compliance metric tracking
// ===========================================
export const complianceSnapshots = pgTable('compliance_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { mode: 'date' }).notNull(),
    metrics: jsonb('metrics').$type<{
        ymylApprovalRate: number;
        citationCoverageRatio: number;
        avgTimeInReviewHours: number;
        articlesWithExpertReview: number;
        articlesWithQaPassed: number;
        disclosureComplianceRate: number;
        meaningfulEditRatio: number;
    }>().default({
        ymylApprovalRate: 0,
        citationCoverageRatio: 0,
        avgTimeInReviewHours: 0,
        articlesWithExpertReview: 0,
        articlesWithQaPassed: 0,
        disclosureComplianceRate: 0,
        meaningfulEditRatio: 0,
    }),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    domainIdx: index('compliance_snapshot_domain_idx').on(t.domainId),
    dateIdx: index('compliance_snapshot_date_idx').on(t.snapshotDate),
}));

// ===========================================
// RELATIONS
// ===========================================
export const domainsRelations = relations(domains, ({ many, one }) => ({
    keywords: many(keywords),
    articles: many(articles),
    monetizationProfile: one(monetizationProfiles),
    revenueSnapshots: many(revenueSnapshots),
    expenses: many(expenses),
    notifications: many(notifications),
    competitors: many(competitors),
    backlinkSnapshots: many(backlinkSnapshots),
    approvalPolicies: many(approvalPolicies),
    disclosureConfig: one(disclosureConfigs),
    complianceSnapshots: many(complianceSnapshots),
    redirectTarget: one(domains, {
        fields: [domains.redirectTargetId],
        references: [domains.id],
    }),
}));

export const keywordsRelations = relations(keywords, ({ one }) => ({
    domain: one(domains, {
        fields: [keywords.domainId],
        references: [domains.id],
    }),
    article: one(articles, {
        fields: [keywords.articleId],
        references: [articles.id],
    }),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
    domain: one(domains, {
        fields: [articles.domainId],
        references: [domains.id],
    }),
    revisions: many(contentRevisions),
    reviewEvents: many(reviewEvents),
    qaResults: many(qaChecklistResults),
    citations: many(citations),
}));

export const monetizationProfilesRelations = relations(monetizationProfiles, ({ one }) => ({
    domain: one(domains, {
        fields: [monetizationProfiles.domainId],
        references: [domains.id],
    }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
    domain: one(domains, {
        fields: [expenses.domainId],
        references: [domains.id],
    }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
    domain: one(domains, {
        fields: [notifications.domainId],
        references: [domains.id],
    }),
}));

export const competitorsRelations = relations(competitors, ({ one }) => ({
    domain: one(domains, {
        fields: [competitors.domainId],
        references: [domains.id],
    }),
}));

export const backlinkSnapshotsRelations = relations(backlinkSnapshots, ({ one }) => ({
    domain: one(domains, {
        fields: [backlinkSnapshots.domainId],
        references: [domains.id],
    }),
}));

export const usersRelations = relations(users, ({ many }) => ({
    sessions: many(sessions),
    reviewEvents: many(reviewEvents),
    revisions: many(contentRevisions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, {
        fields: [sessions.userId],
        references: [users.id],
    }),
}));

export const contentRevisionsRelations = relations(contentRevisions, ({ one }) => ({
    article: one(articles, {
        fields: [contentRevisions.articleId],
        references: [articles.id],
    }),
    createdBy: one(users, {
        fields: [contentRevisions.createdById],
        references: [users.id],
    }),
}));

export const reviewEventsRelations = relations(reviewEvents, ({ one }) => ({
    article: one(articles, {
        fields: [reviewEvents.articleId],
        references: [articles.id],
    }),
    revision: one(contentRevisions, {
        fields: [reviewEvents.revisionId],
        references: [contentRevisions.id],
    }),
    actor: one(users, {
        fields: [reviewEvents.actorId],
        references: [users.id],
    }),
}));

export const qaChecklistResultsRelations = relations(qaChecklistResults, ({ one }) => ({
    article: one(articles, {
        fields: [qaChecklistResults.articleId],
        references: [articles.id],
    }),
    template: one(qaChecklistTemplates, {
        fields: [qaChecklistResults.templateId],
        references: [qaChecklistTemplates.id],
    }),
    reviewer: one(users, {
        fields: [qaChecklistResults.reviewerId],
        references: [users.id],
    }),
}));

export const approvalPoliciesRelations = relations(approvalPolicies, ({ one }) => ({
    domain: one(domains, {
        fields: [approvalPolicies.domainId],
        references: [domains.id],
    }),
}));

export const citationsRelations = relations(citations, ({ one }) => ({
    article: one(articles, {
        fields: [citations.articleId],
        references: [articles.id],
    }),
    createdBy: one(users, {
        fields: [citations.createdById],
        references: [users.id],
    }),
}));

export const disclosureConfigsRelations = relations(disclosureConfigs, ({ one }) => ({
    domain: one(domains, {
        fields: [disclosureConfigs.domainId],
        references: [domains.id],
    }),
}));

export const complianceSnapshotsRelations = relations(complianceSnapshots, ({ one }) => ({
    domain: one(domains, {
        fields: [complianceSnapshots.domainId],
        references: [domains.id],
    }),
}));

// ===========================================
// TYPE EXPORTS
// ===========================================
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type MonetizationProfile = typeof monetizationProfiles.$inferSelect;
export type ContentQueueJob = typeof contentQueue.$inferSelect;
export type DomainResearch = typeof domainResearch.$inferSelect;
export type RevenueSnapshot = typeof revenueSnapshots.$inferSelect;
export type ApiCallLog = typeof apiCallLogs.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type BacklinkSnapshot = typeof backlinkSnapshots.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type ContentRevision = typeof contentRevisions.$inferSelect;
export type ReviewEvent = typeof reviewEvents.$inferSelect;
export type QaChecklistTemplate = typeof qaChecklistTemplates.$inferSelect;
export type QaChecklistResult = typeof qaChecklistResults.$inferSelect;
export type ApprovalPolicy = typeof approvalPolicies.$inferSelect;
export type Citation = typeof citations.$inferSelect;
export type DisclosureConfig = typeof disclosureConfigs.$inferSelect;
export type ComplianceSnapshot = typeof complianceSnapshots.$inferSelect;
