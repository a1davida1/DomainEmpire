import { pgTable, pgEnum, text, integer, bigint, real, boolean, timestamp, jsonb, uuid, index, uniqueIndex, unique, check, numeric, type AnyPgColumn } from 'drizzle-orm/pg-core';
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
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2, mode: 'number' }),
    renewalDate: timestamp('renewal_date', { mode: 'date' }),
    renewalPrice: numeric('renewal_price', { precision: 12, scale: 2, mode: 'number' }),

    // Classification
    status: text('status', {
        enum: ['parked', 'active', 'redirect', 'forsale', 'defensive']
    }).notNull().default('parked'),
    lifecycleState: text('lifecycle_state', {
        enum: ['sourced', 'underwriting', 'approved', 'acquired', 'build', 'growth', 'monetized', 'hold', 'sell', 'sunset'],
    }).notNull().default('sourced'),
    bucket: text('bucket', {
        enum: ['build', 'redirect', 'park', 'defensive']
    }).notNull().default('build'),
    tier: integer('tier').default(3),
    niche: text('niche'),
    subNiche: text('sub_niche'),

    // Deployment wave & domain cluster
    wave: integer('wave'),
    cluster: text('cluster'),

    // Redirect config
    redirectTargetId: uuid('redirect_target_id').references((): AnyPgColumn => domains.id, { onDelete: 'set null' }),

    // Deployment
    githubRepo: text('github_repo'),
    cloudflareProject: text('cloudflare_project'),
    isDeployed: boolean('is_deployed').default(false),
    lastDeployedAt: timestamp('last_deployed_at'),
    siteTemplate: text('site_template', {
        enum: [
            'authority', 'comparison', 'calculator', 'review', 'tool', 'hub',
            'decision', 'cost_guide', 'niche', 'info', 'consumer', 'brand',
            'magazine', 'landing', 'docs', 'storefront', 'minimal', 'dashboard',
            'newsletter', 'community',
        ]
    }).default('authority'),
    // Organization & Infrastructure
    vertical: text('vertical'), // 'Legal', 'Insurance', 'Health', etc.
    cloudflareAccount: text('cloudflare_account'), // 'legal-content-1@...', etc.

    // Design & Strategy
    themeStyle: text('theme_style'), // 'navy-serif', 'green-modern', 'medical-clean'
    skin: text('skin').default('slate'), // v2 color skin: 'ocean', 'forest', 'ember', 'slate', 'midnight', 'coral'
    monetizationModel: text('monetization_model'), // 'Lead gen', 'Display + affiliate', etc.
    monetizationTier: integer('monetization_tier').default(3), // 1=Lead Gen Only, 2=Affiliate Pri, 3=Display Pri, 4=Brand

    // Valuation
    estimatedRevenueAtMaturityLow: real('estimated_revenue_at_maturity_low'),
    estimatedRevenueAtMaturityHigh: real('estimated_revenue_at_maturity_high'),
    estimatedFlipValueLow: real('estimated_flip_value_low'),
    estimatedFlipValueHigh: real('estimated_flip_value_high'),
    estimatedMonthlyRevenueLow: real('estimated_monthly_revenue_low'),
    estimatedMonthlyRevenueHigh: real('estimated_monthly_revenue_high'),

    // Health
    healthScore: real('health_score'),
    healthUpdatedAt: timestamp('health_updated_at'),

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
        contentTypeMix?: Record<string, number>;
        writingWorkflow?: {
            outlineTemplate?: string;
            draftTemplate?: string;
            humanizeTemplate?: string;
            seoTemplate?: string;
            metaTemplate?: string;
            reviewTemplate?: string;
        };
        branding?: {
            colorScheme?: string;
            primaryColor?: string;
            secondaryColor?: string;
            accentColor?: string;
            typographyPreset?: string;
        };
        quickDeploySeed?: number;
    }>().default({}),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
}, (t) => ({
    statusIdx: index('domain_status_idx').on(t.status),
    lifecycleStateIdx: index('domain_lifecycle_state_idx').on(t.lifecycleState),
    tierIdx: index('domain_tier_idx').on(t.tier),
    bucketIdx: index('domain_bucket_idx').on(t.bucket), // Note: This references operational bucket
    verticalIdx: index('domain_vertical_idx').on(t.vertical),
}));

// ===========================================
// PAGE DEFINITIONS: Block-based page composition for Template System v2
// ===========================================
export const pageStatusEnum = pgEnum('page_status', [
    'draft', 'review', 'approved', 'published', 'archived',
]);

export const PAGE_STATUSES = pageStatusEnum.enumValues;
export type PageStatus = (typeof PAGE_STATUSES)[number];

export const pageDefinitions = pgTable('page_definitions', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    route: text('route').notNull().default('/'),
    title: text('title'),
    metaDescription: text('meta_description'),
    theme: text('theme').notNull().default('clean'),
    skin: text('skin').notNull().default('slate'),
    blocks: jsonb('blocks').$type<Array<{
        id: string;
        type: string;
        variant?: string;
        content?: Record<string, unknown>;
        config?: Record<string, unknown>;
    }>>().notNull().default([]),
    isPublished: boolean('is_published').notNull().default(false),
    status: pageStatusEnum('status').notNull().default('draft'),
    reviewRequestedAt: timestamp('review_requested_at'),
    lastReviewedAt: timestamp('last_reviewed_at'),
    lastReviewedBy: uuid('last_reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    domainRouteUnq: uniqueIndex('page_def_domain_route_uidx').on(t.domainId, t.route),
    domainIdx: index('page_def_domain_idx').on(t.domainId),
    publishedIdx: index('page_def_published_idx').on(t.isPublished),
    statusIdx: index('page_def_status_idx').on(t.status),
}));
export type PageDefinition = typeof pageDefinitions.$inferSelect;
export type NewPageDefinition = typeof pageDefinitions.$inferInsert;

// ===========================================
// PAGE VARIANTS: A/B test compositions with split block sequences
// ===========================================
export const pageVariants = pgTable('page_variants', {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id').notNull().references(() => pageDefinitions.id, { onDelete: 'cascade' }),
    variantKey: text('variant_key').notNull().default('control'),
    weight: integer('weight').notNull().default(50),
    blocks: jsonb('blocks').$type<Array<{
        id: string;
        type: string;
        variant?: string;
        content?: Record<string, unknown>;
        config?: Record<string, unknown>;
    }>>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
    conversions: bigint('conversions', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    weightCheck: check('ab_page_variants_weight_check', sql`${t.weight} > 0`),
    pageVariantUnq: uniqueIndex('page_variant_page_key_uidx').on(t.pageId, t.variantKey),
    pageIdx: index('page_variant_page_idx').on(t.pageId),
    activeIdx: index('page_variant_active_idx').on(t.isActive),
}));

export type PageVariant = typeof pageVariants.$inferSelect;
export type NewPageVariant = typeof pageVariants.$inferInsert;

// ===========================================
// BLOCK TEMPLATES: Cross-domain reusable block library
// ===========================================
export const blockTemplates = pgTable('block_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    blockType: text('block_type').notNull(),
    variant: text('variant'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),
    tags: text('tags').array().notNull().default([]),
    sourceDomainId: uuid('source_domain_id').references(() => domains.id, { onDelete: 'set null' }),
    sourceBlockId: text('source_block_id'),
    usageCount: integer('usage_count').notNull().default(0),
    isGlobal: boolean('is_global').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    typeIdx: index('block_tpl_type_idx').on(t.blockType),
    globalIdx: index('block_tpl_global_idx').on(t.isGlobal),
}));

export type BlockTemplate = typeof blockTemplates.$inferSelect;
export type NewBlockTemplate = typeof blockTemplates.$inferInsert;

// ===========================================
// DOMAIN LIFECYCLE EVENTS: Canonical lifecycle transition audit trail
// ===========================================
export const domainLifecycleEvents = pgTable('domain_lifecycle_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    fromState: text('from_state', {
        enum: ['sourced', 'underwriting', 'approved', 'acquired', 'build', 'growth', 'monetized', 'hold', 'sell', 'sunset'],
    }).notNull(),
    toState: text('to_state', {
        enum: ['sourced', 'underwriting', 'approved', 'acquired', 'build', 'growth', 'monetized', 'hold', 'sell', 'sunset'],
    }).notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
    domainIdx: index('domain_lifecycle_event_domain_idx').on(t.domainId),
    actorIdx: index('domain_lifecycle_event_actor_idx').on(t.actorId),
    createdIdx: index('domain_lifecycle_event_created_idx').on(t.createdAt),
}));

// ===========================================
// DOMAIN REGISTRAR PROFILES: Registrar and ownership operations control plane
// ===========================================
export const domainRegistrarProfiles = pgTable('domain_registrar_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => integrationConnections.id, { onDelete: 'set null' }),
    ownershipStatus: text('ownership_status', {
        enum: ['unknown', 'unverified', 'verified', 'pending_transfer', 'transferred'],
    }).notNull().default('unknown'),
    transferStatus: text('transfer_status', {
        enum: ['none', 'initiated', 'pending', 'completed', 'failed'],
    }).notNull().default('none'),
    transferTargetRegistrar: text('transfer_target_registrar'),
    transferRequestedAt: timestamp('transfer_requested_at'),
    transferCompletedAt: timestamp('transfer_completed_at'),
    autoRenewEnabled: boolean('auto_renew_enabled').notNull().default(true),
    lockStatus: text('lock_status', {
        enum: ['unknown', 'locked', 'unlocked'],
    }).notNull().default('unknown'),
    dnssecStatus: text('dnssec_status', {
        enum: ['unknown', 'enabled', 'disabled'],
    }).notNull().default('unknown'),
    expirationRisk: text('expiration_risk', {
        enum: ['unknown', 'none', 'low', 'medium', 'high', 'critical', 'expired'],
    }).notNull().default('unknown'),
    expirationRiskScore: integer('expiration_risk_score').notNull().default(0),
    expirationRiskUpdatedAt: timestamp('expiration_risk_updated_at'),
    ownershipLastChangedAt: timestamp('ownership_last_changed_at'),
    ownershipChangedBy: uuid('ownership_changed_by').references(() => users.id, { onDelete: 'set null' }),
    ownerHandle: text('owner_handle'),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    domainUidx: uniqueIndex('domain_registrar_profile_domain_uidx').on(t.domainId),
    connectionIdx: index('domain_registrar_profile_connection_idx').on(t.connectionId),
    transferStatusIdx: index('domain_registrar_profile_transfer_status_idx').on(t.transferStatus),
    expirationRiskIdx: index('domain_registrar_profile_expiration_risk_idx').on(t.expirationRisk),
    updatedAtIdx: index('domain_registrar_profile_updated_at_idx').on(t.updatedAt),
    riskScoreCheck: check(
        'domain_registrar_profile_risk_score_check',
        sql`${t.expirationRiskScore} >= 0 AND ${t.expirationRiskScore} <= 100`,
    ),
    transferTimelineCheck: check(
        'domain_registrar_profile_transfer_timeline_check',
        sql`${t.transferCompletedAt} IS NULL OR ${t.transferRequestedAt} IS NULL OR ${t.transferCompletedAt} >= ${t.transferRequestedAt}`,
    ),
}));

// ===========================================
// DOMAIN OWNERSHIP EVENTS: Append-only ownership and registrar operations audit trail
// ===========================================
export const domainOwnershipEvents = pgTable('domain_ownership_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => domainRegistrarProfiles.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type', {
        enum: [
            'ownership_verified',
            'ownership_changed',
            'registrar_changed',
            'transfer_initiated',
            'transfer_completed',
            'transfer_failed',
            'lock_changed',
            'dnssec_changed',
            'auto_renew_changed',
            'risk_recomputed',
        ],
    }).notNull(),
    source: text('source', {
        enum: ['manual', 'integration_sync', 'system'],
    }).notNull().default('manual'),
    summary: text('summary').notNull(),
    previousState: jsonb('previous_state').$type<Record<string, unknown>>().default({}).notNull(),
    nextState: jsonb('next_state').$type<Record<string, unknown>>().default({}).notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
    domainIdx: index('domain_ownership_event_domain_idx').on(t.domainId),
    profileIdx: index('domain_ownership_event_profile_idx').on(t.profileId),
    actorIdx: index('domain_ownership_event_actor_idx').on(t.actorId),
    typeIdx: index('domain_ownership_event_type_idx').on(t.eventType),
    createdIdx: index('domain_ownership_event_created_idx').on(t.createdAt),
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
    cpc: numeric('cpc', { precision: 12, scale: 2, mode: 'number' }),
    difficulty: integer('difficulty'),
    serpPosition: integer('serp_position'),

    // Content mapping
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
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
    articleIdx: index('keyword_article_idx').on(t.articleId),
    domainKeywordUnq: unique('keyword_domain_keyword_unq').on(t.domainId, t.keyword),
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
    generationCost: numeric('generation_cost', { precision: 12, scale: 2 }),
    humanizationScore: numeric('humanization_score', { precision: 5, scale: 2 }),

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
    bounceRate: numeric('bounce_rate', { precision: 5, scale: 2, mode: 'number' }),
    revenue30d: numeric('revenue_30d', { precision: 12, scale: 2, mode: 'number' }).default(0),

    // Content freshness
    lastRefreshedAt: timestamp('last_refreshed_at'),
    stalenessScore: numeric('staleness_score', { precision: 5, scale: 2, mode: 'number' }),

    // YMYL & Review
    ymylLevel: text('ymyl_level', {
        enum: ['none', 'low', 'medium', 'high']
    }).default('none'),
    lastReviewedAt: timestamp('last_reviewed_at'),
    reviewRequestedAt: timestamp('review_requested_at'),
    lastReviewedBy: uuid('last_reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),

    // Content Type & Structured Config
    contentType: text('content_type', {
        enum: [
            'article',
            'comparison',
            'calculator',
            'cost_guide',
            'lead_capture',
            'health_decision',
            'checklist',
            'faq',
            'review',
            'wizard',
            'configurator',
            'quiz',
            'survey',
            'assessment',
            'interactive_infographic',
            'interactive_map',
        ]
    }).default('article'),
    calculatorConfig: jsonb('calculator_config').$type<{
        inputs: Array<{ id: string; label: string; type: 'number' | 'select' | 'range'; default?: number; min?: number; max?: number; step?: number; options?: Array<{ label: string; value: number }> }>;
        outputs: Array<{ id: string; label: string; format: 'currency' | 'percent' | 'number'; decimals?: number }>;
        formula?: string;
        assumptions?: string[];
        methodology?: string;
    }>(),
    comparisonData: jsonb('comparison_data').$type<{
        options: Array<{ name: string; url?: string; badge?: string; scores: Record<string, number | string> }>;
        columns: Array<{ key: string; label: string; type: 'number' | 'text' | 'rating'; sortable?: boolean }>;
        defaultSort?: string;
        verdict?: string;
    }>(),
    leadGenConfig: jsonb('lead_gen_config').$type<{
        fields: Array<{ name: string; label: string; type: 'text' | 'email' | 'tel' | 'select' | 'number'; required?: boolean; options?: string[] }>;
        consentText: string;
        endpoint: string;
        successMessage: string;
        disclosureAboveFold?: string;
        privacyPolicyUrl?: string;
    }>(),
    costGuideData: jsonb('cost_guide_data').$type<{
        ranges?: Array<{ label?: string; low: number; high: number; average?: number; dataPoints?: number[] }>;
        factors?: Array<{ name: string; impact: 'low' | 'medium' | 'high'; description: string }>;
    }>(),

    // Wizard config
    wizardConfig: jsonb('wizard_config').$type<{
        steps: Array<{
            id: string;
            title: string;
            description?: string;
            fields: Array<{
                id: string;
                type: 'radio' | 'checkbox' | 'select' | 'number' | 'text';
                label: string;
                options?: Array<{ value: string; label: string }>;
                required?: boolean;
            }>;
            nextStep?: string;
            branches?: Array<{ condition: string; goTo: string }>;
        }>;
        resultRules: Array<{
            condition: string;
            title: string;
            body: string;
            cta?: { text: string; url: string };
        }>;
        resultTemplate: 'summary' | 'recommendation' | 'score' | 'eligibility';
        collectLead?: {
            fields: string[];
            consentText: string;
            endpoint: string;
        };
        scoring?: {
            method?: 'completion' | 'weighted';
            weights?: Record<string, number>;
            valueMap?: Record<string, Record<string, number>>;
            bands?: Array<{
                min: number;
                max: number;
                label: string;
                description?: string;
            }>;
            outcomes?: Array<{
                min: number;
                max: number;
                title: string;
                body: string;
                cta?: { text: string; url: string };
            }>;
        };
    }>(),

    // Geo-adaptive content data
    geoData: jsonb('geo_data').$type<{
        regions: Record<string, { content: string; label?: string }>;
        fallback: string;
    }>(),

    // Scroll-triggered CTA config
    ctaConfig: jsonb('cta_config').$type<{
        text: string;
        buttonLabel: string;
        buttonUrl: string;
        style: 'bar' | 'card' | 'banner';
    }>(),

    // AI Detection
    aiDetectionScore: numeric('ai_detection_score', { precision: 5, scale: 4, mode: 'number' }),
    aiDetectionResult: jsonb('ai_detection_result'),
    aiDetectionCheckedAt: timestamp('ai_detection_checked_at'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
}, (t) => ({
    domainIdx: index('article_domain_idx').on(t.domainId),
    statusIdx: index('article_status_idx').on(t.status),
    createdIdx: index('article_created_idx').on(t.createdAt),
    publishedIdx: index('article_published_idx').on(t.publishedAt),
    contentTypeIdx: index('article_content_type_idx').on(t.contentType),
    unq: uniqueIndex('article_domain_slug_uidx').on(t.domainId, t.slug),
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
            'seo_optimize', 'resolve_external_links', 'generate_meta', 'deploy',
            'fetch_analytics', 'keyword_research', 'bulk_seed',
            'research', 'evaluate', 'content_refresh',
            'fetch_gsc', 'check_backlinks', 'check_renewals',
            'check_datasets',
            // Acquisition underwriting pipeline
            'ingest_listings', 'enrich_candidate', 'score_candidate', 'create_bid_plan',
            // Research cache maintenance
            'refresh_research_cache',
            // Growth channel pipeline
            'create_promotion_plan', 'generate_short_script', 'render_short_video',
            'publish_pinterest_pin', 'publish_youtube_short', 'sync_campaign_metrics',
            'run_media_review_escalations',
            // Integration marketplace sync automation
            'run_integration_connection_sync',
            // Launch freeze recovery
            'campaign_launch_recovery',
            // Template System v2 block content generation
            'generate_block_content',
            // AI detection pipeline stage
            'ai_detection_check',
        ]
    }).notNull(),

    // References
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'cascade' }),
    keywordId: uuid('keyword_id').references(() => keywords.id, { onDelete: 'set null' }),

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
    apiCost: numeric('api_cost', { precision: 12, scale: 2 }).default('0'),

    // Timing
    createdAt: timestamp('created_at').defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),

    // Scheduling
    scheduledFor: timestamp('scheduled_for'), // For future scheduling
    lockedUntil: timestamp('locked_until'), // For worker locking
}, (t) => ({
    scheduledForIdx: index('content_queue_scheduled_for_idx').on(t.scheduledFor),
    statusIdx: index('content_queue_status_idx').on(t.status),
    priorityIdx: index('content_queue_priority_idx').on(t.priority),
    lockedUntilIdx: index('content_queue_locked_until_idx').on(t.lockedUntil),
    jobTypeIdx: index('content_queue_job_type_idx').on(t.jobType),
}));

// ===========================================
// DOMAIN RESEARCH LOG: Track domains investigated
// ===========================================
export const domainResearch = pgTable('domain_research', {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain').notNull().unique(),
    tld: text('tld').notNull(),

    // Marketplace listing context
    listingSource: text('listing_source'), // godaddy_auctions | namejet | dropcatch | dynadot | handreg
    listingId: text('listing_id'),
    listingType: text('listing_type'), // auction | closeout | pending_delete | buy_now
    currentBid: numeric('current_bid', { precision: 18, scale: 2, mode: 'number' }),
    buyNowPrice: numeric('buy_now_price', { precision: 18, scale: 2, mode: 'number' }),
    auctionEndsAt: timestamp('auction_ends_at'),

    // Availability
    isAvailable: boolean('is_available'),
    registrationPrice: numeric('registration_price', { precision: 12, scale: 2, mode: 'number' }),
    aftermarketPrice: numeric('aftermarket_price', { precision: 12, scale: 2, mode: 'number' }),

    // Scoring
    keywordVolume: integer('keyword_volume'),
    keywordCpc: numeric('keyword_cpc', { precision: 12, scale: 2, mode: 'number' }),
    estimatedRevenuePotential: numeric('estimated_revenue_potential', { precision: 12, scale: 2, mode: 'number' }),
    domainScore: numeric('domain_score', { precision: 5, scale: 2, mode: 'number' }),
    demandScore: real('demand_score'),
    compsScore: real('comps_score'),
    tmRiskScore: real('tm_risk_score'),
    historyRiskScore: real('history_risk_score'),
    backlinkRiskScore: real('backlink_risk_score'),

    // Underwriting economics
    compLow: numeric('comp_low', { precision: 18, scale: 2, mode: 'number' }),
    compHigh: numeric('comp_high', { precision: 18, scale: 2, mode: 'number' }),
    recommendedMaxBid: numeric('recommended_max_bid', { precision: 18, scale: 2, mode: 'number' }),
    expected12mRevenueLow: numeric('expected_12m_revenue_low', { precision: 18, scale: 2, mode: 'number' }),
    expected12mRevenueHigh: numeric('expected_12m_revenue_high', { precision: 18, scale: 2, mode: 'number' }),
    confidenceScore: real('confidence_score'),
    hardFailReason: text('hard_fail_reason'),
    underwritingVersion: text('underwriting_version'),

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
// ACQUISITION EVENTS: Candidate lifecycle audit trail
// ===========================================
export const acquisitionEvents = pgTable('acquisition_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainResearchId: uuid('domain_research_id').notNull().references(() => domainResearch.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(), // ingested | enriched | hard_fail | scored | watchlist | approved | bought | passed
    payload: jsonb('payload').default({}),
    createdBy: text('created_by').default('system'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    domainResearchIdx: index('acquisition_events_domain_research_idx').on(t.domainResearchId),
    eventTypeIdx: index('acquisition_events_event_type_idx').on(t.eventType),
    createdIdx: index('acquisition_events_created_idx').on(t.createdAt),
}));

// ===========================================
// RESEARCH CACHE: Local fallback for online research jobs
// ===========================================
export const researchCache = pgTable('research_cache', {
    id: uuid('id').primaryKey().defaultRandom(),
    queryHash: text('query_hash').notNull(),
    queryText: text('query_text').notNull(),
    resultJson: jsonb('result_json').default({}).notNull(),
    sourceModel: text('source_model'),
    fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    domainPriority: integer('domain_priority').default(0).notNull(),
}, (t) => ({
    queryHashUidx: uniqueIndex('research_cache_query_hash_uidx').on(t.queryHash),
    fetchedIdx: index('research_cache_fetched_idx').on(t.fetchedAt),
    expiresIdx: index('research_cache_expires_idx').on(t.expiresAt),
    domainPriorityIdx: index('research_cache_domain_priority_idx').on(t.domainPriority),
}));

// ===========================================
// DOMAIN KNOWLEDGE: Persistent per-domain fact accumulation
// ===========================================
export const domainKnowledge = pgTable('domain_knowledge', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    category: text('category', {
        enum: ['statistic', 'fact', 'quote', 'development', 'source'],
    }).notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(),
    sourceUrl: text('source_url'),
    sourceTitle: text('source_title'),
    confidence: numeric('confidence', { precision: 3, scale: 2, mode: 'number' }).default(0.7).notNull(),
    firstSeenArticleId: uuid('first_seen_article_id').references(() => articles.id, { onDelete: 'set null' }),
    lastUsedAt: timestamp('last_used_at').defaultNow(),
    useCount: integer('use_count').default(1).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    domainIdx: index('domain_knowledge_domain_idx').on(t.domainId),
    categoryIdx: index('domain_knowledge_category_idx').on(t.domainId, t.category),
    contentHashUidx: uniqueIndex('domain_knowledge_content_hash_uidx').on(t.domainId, t.contentHash),
    lastUsedIdx: index('domain_knowledge_last_used_idx').on(t.lastUsedAt),
}));

// ===========================================
// PROMOTION CAMPAIGNS: Growth channel orchestration
// ===========================================
export const promotionCampaigns = pgTable('promotion_campaigns', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainResearchId: uuid('domain_research_id').notNull().references(() => domainResearch.id, { onDelete: 'cascade' }),
    channels: jsonb('channels').$type<string[]>().default([]).notNull(), // e.g. ["pinterest", "youtube_shorts"]
    budget: numeric('budget', { precision: 12, scale: 2, mode: 'number' }).default(0).notNull(),
    status: text('status', {
        enum: ['draft', 'active', 'paused', 'completed', 'cancelled'],
    }).default('draft').notNull(),
    dailyCap: integer('daily_cap').default(0).notNull(),
    metrics: jsonb('metrics').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    domainResearchIdx: index('promotion_campaign_domain_research_idx').on(t.domainResearchId),
    statusIdx: index('promotion_campaign_status_idx').on(t.status),
    createdIdx: index('promotion_campaign_created_idx').on(t.createdAt),
}));

export const promotionJobs = pgTable('promotion_jobs', {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => promotionCampaigns.id, { onDelete: 'cascade' }),
    jobType: text('job_type').notNull(), // e.g. generate_short_script, publish_pin
    status: text('status', {
        enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    }).default('pending').notNull(),
    payload: jsonb('payload').default({}).notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
}, (t) => ({
    campaignIdx: index('promotion_job_campaign_idx').on(t.campaignId),
    statusIdx: index('promotion_job_status_idx').on(t.status),
    createdIdx: index('promotion_job_created_idx').on(t.createdAt),
}));

export const promotionEvents = pgTable('promotion_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => promotionCampaigns.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(), // impression, click, lead, conversion
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
    attributes: jsonb('attributes').default({}).notNull(),
}, (t) => ({
    campaignIdx: index('promotion_event_campaign_idx').on(t.campaignId),
    typeIdx: index('promotion_event_type_idx').on(t.eventType),
    occurredIdx: index('promotion_event_occurred_idx').on(t.occurredAt),
}));

export const growthChannelCredentials = pgTable('growth_channel_credentials', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel', {
        enum: ['pinterest', 'youtube_shorts'],
    }).notNull(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),
    providerAccountId: text('provider_account_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    lastValidatedAt: timestamp('last_validated_at'),
    lastRefreshAt: timestamp('last_refresh_at'),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    userChannelUidx: uniqueIndex('growth_credential_user_channel_uidx').on(t.userId, t.channel),
    userIdx: index('growth_credential_user_idx').on(t.userId),
    channelIdx: index('growth_credential_channel_idx').on(t.channel),
    expiresIdx: index('growth_credential_access_expires_idx').on(t.accessTokenExpiresAt),
    revokedIdx: index('growth_credential_revoked_idx').on(t.revokedAt),
}));

export const growthCredentialDrillRuns = pgTable('growth_credential_drill_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    initiatedBy: uuid('initiated_by').references(() => users.id, { onDelete: 'set null' }),
    scope: text('scope', {
        enum: ['all', 'pinterest', 'youtube_shorts'],
    }).notNull().default('all'),
    mode: text('mode', {
        enum: ['dry_run', 'rotation_reconnect'],
    }).notNull().default('rotation_reconnect'),
    status: text('status', {
        enum: ['success', 'failed', 'partial'],
    }).notNull(),
    checklist: jsonb('checklist').$type<Record<string, unknown>>().default({}).notNull(),
    results: jsonb('results').$type<Record<string, unknown>>().default({}).notNull(),
    notes: text('notes'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    userIdx: index('growth_credential_drill_run_user_idx').on(t.userId),
    statusIdx: index('growth_credential_drill_run_status_idx').on(t.status),
    startedAtIdx: index('growth_credential_drill_run_started_at_idx').on(t.startedAt),
    userStartedAtIdx: index('growth_credential_drill_run_user_started_at_idx').on(t.userId, t.startedAt),
}));

export const integrationConnections = pgTable('integration_connections', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    provider: text('provider', {
        enum: [
            'godaddy',
            'namecheap',
            'sedo',
            'bodis',
            'cloudflare',
            'cpanel',
            'google_analytics',
            'google_search_console',
            'semrush',
            'mailchimp',
            'convertkit',
            'figma',
            'impact',
            'cj',
            'awin',
            'rakuten',
            'custom',
        ],
    }).notNull(),
    category: text('category', {
        enum: ['registrar', 'parking', 'affiliate_network', 'analytics', 'email', 'design', 'hosting', 'seo', 'other'],
    }).notNull(),
    displayName: text('display_name'),
    status: text('status', {
        enum: ['pending', 'connected', 'error', 'disabled'],
    }).notNull().default('pending'),
    encryptedCredential: text('encrypted_credential'),
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
    lastSyncAt: timestamp('last_sync_at'),
    lastSyncStatus: text('last_sync_status', {
        enum: ['never', 'success', 'failed', 'partial'],
    }).notNull().default('never'),
    lastSyncError: text('last_sync_error'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    userProviderDomainUidx: uniqueIndex('integration_connection_user_provider_domain_uidx').on(t.userId, t.provider, t.domainId),
    userIdx: index('integration_connection_user_idx').on(t.userId),
    domainIdx: index('integration_connection_domain_idx').on(t.domainId),
    providerIdx: index('integration_connection_provider_idx').on(t.provider),
    categoryIdx: index('integration_connection_category_idx').on(t.category),
    statusIdx: index('integration_connection_status_idx').on(t.status),
    createdAtIdx: index('integration_connection_created_at_idx').on(t.createdAt),
}));

export const integrationSyncRuns = pgTable('integration_sync_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id').notNull().references(() => integrationConnections.id, { onDelete: 'cascade' }),
    runType: text('run_type', {
        enum: ['manual', 'scheduled', 'webhook'],
    }).notNull().default('manual'),
    status: text('status', {
        enum: ['running', 'success', 'failed', 'partial'],
    }).notNull().default('running'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    recordsProcessed: integer('records_processed').notNull().default(0),
    recordsUpserted: integer('records_upserted').notNull().default(0),
    recordsFailed: integer('records_failed').notNull().default(0),
    errorMessage: text('error_message'),
    details: jsonb('details').$type<Record<string, unknown>>().default({}).notNull(),
    triggeredBy: uuid('triggered_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
    nonNegativeCountsCheck: check(
        'integration_sync_runs_non_negative_counts_check',
        sql`${t.recordsProcessed} >= 0 AND ${t.recordsUpserted} >= 0 AND ${t.recordsFailed} >= 0`,
    ),
    connectionIdx: index('integration_sync_run_connection_idx').on(t.connectionId),
    statusIdx: index('integration_sync_run_status_idx').on(t.status),
    startedAtIdx: index('integration_sync_run_started_at_idx').on(t.startedAt),
    completedAtIdx: index('integration_sync_run_completed_at_idx').on(t.completedAt),
    createdAtIdx: index('integration_sync_run_created_at_idx').on(t.createdAt),
}));

export const cloudflareShardHealth = pgTable('cloudflare_shard_health', {
    id: uuid('id').primaryKey().defaultRandom(),
    shardKey: text('shard_key').notNull(),
    accountId: text('account_id').notNull(),
    sourceConnectionId: uuid('source_connection_id').references(() => integrationConnections.id, { onDelete: 'set null' }),
    penalty: integer('penalty').notNull().default(0),
    cooldownUntil: timestamp('cooldown_until'),
    successCount: integer('success_count').notNull().default(0),
    rateLimitCount: integer('rate_limit_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    lastOutcome: text('last_outcome', {
        enum: ['success', 'rate_limited', 'failure'],
    }).notNull().default('success'),
    lastOutcomeAt: timestamp('last_outcome_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    shardAccountUidx: uniqueIndex('cloudflare_shard_health_shard_account_uidx').on(t.shardKey, t.accountId),
    accountIdx: index('cloudflare_shard_health_account_idx').on(t.accountId),
    cooldownIdx: index('cloudflare_shard_health_cooldown_idx').on(t.cooldownUntil),
    updatedIdx: index('cloudflare_shard_health_updated_idx').on(t.updatedAt),
    penaltyCheck: check(
        'cloudflare_shard_health_penalty_check',
        sql`${t.penalty} >= 0 AND ${t.penalty} <= 100`,
    ),
    successCountCheck: check(
        'cloudflare_shard_health_success_count_check',
        sql`${t.successCount} >= 0`,
    ),
    rateLimitCountCheck: check(
        'cloudflare_shard_health_rate_limit_count_check',
        sql`${t.rateLimitCount} >= 0`,
    ),
    failureCountCheck: check(
        'cloudflare_shard_health_failure_count_check',
        sql`${t.failureCount} >= 0`,
    ),
}));

export const domainChannelProfiles = pgTable('domain_channel_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    channel: text('channel', {
        enum: ['pinterest', 'youtube_shorts'],
    }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    compatibility: text('compatibility', {
        enum: ['supported', 'limited', 'blocked'],
    }).notNull().default('supported'),
    accountRef: text('account_ref'),
    dailyCap: integer('daily_cap'),
    quietHoursStart: integer('quiet_hours_start'),
    quietHoursEnd: integer('quiet_hours_end'),
    minJitterMinutes: integer('min_jitter_minutes').notNull().default(15),
    maxJitterMinutes: integer('max_jitter_minutes').notNull().default(90),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    domainChannelUidx: uniqueIndex('domain_channel_profile_domain_channel_uidx').on(t.domainId, t.channel),
    domainIdx: index('domain_channel_profile_domain_idx').on(t.domainId),
    channelIdx: index('domain_channel_profile_channel_idx').on(t.channel),
    jitterCheck: check(
        'domain_channel_profile_jitter_check',
        sql`${t.minJitterMinutes} >= 0 AND ${t.maxJitterMinutes} >= ${t.minJitterMinutes}`,
    ),
    quietHoursStartCheck: check(
        'domain_channel_profile_quiet_start_check',
        sql`${t.quietHoursStart} IS NULL OR (${t.quietHoursStart} >= 0 AND ${t.quietHoursStart} <= 23)`,
    ),
    quietHoursEndCheck: check(
        'domain_channel_profile_quiet_end_check',
        sql`${t.quietHoursEnd} IS NULL OR (${t.quietHoursEnd} >= 0 AND ${t.quietHoursEnd} <= 23)`,
    ),
}));

export const mediaAssets = pgTable('media_assets', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type', {
        enum: ['image', 'video', 'script', 'voiceover'],
    }).notNull(),
    url: text('url').notNull(),
    folder: text('folder').default('inbox').notNull(),
    tags: jsonb('tags').$type<string[]>().default([]).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    usageCount: integer('usage_count').default(0).notNull(),
    deletedAt: timestamp('deleted_at'),
    purgeAfterAt: timestamp('purge_after_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    userIdx: index('media_asset_user_idx').on(t.userId),
    typeIdx: index('media_asset_type_idx').on(t.type),
    folderIdx: index('media_asset_folder_idx').on(t.folder),
    urlUidx: uniqueIndex('media_asset_url_uidx').on(t.url).where(sql`${t.deletedAt} IS NULL`),
    usageCountIdx: index('media_asset_usage_count_idx').on(t.usageCount),
    deletedAtIdx: index('media_asset_deleted_at_idx').on(t.deletedAt),
    purgeAfterIdx: index('media_asset_purge_after_idx').on(t.purgeAfterAt),
    createdIdx: index('media_asset_created_idx').on(t.createdAt),
}));

export const mediaAssetUsage = pgTable('media_asset_usage', {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id').notNull().references(() => mediaAssets.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').notNull().references(() => promotionCampaigns.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => promotionJobs.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    assetIdx: index('media_asset_usage_asset_idx').on(t.assetId),
    campaignIdx: index('media_asset_usage_campaign_idx').on(t.campaignId),
    jobIdx: index('media_asset_usage_job_idx').on(t.jobId),
    createdIdx: index('media_asset_usage_created_idx').on(t.createdAt),
}));

export const mediaModerationTasks = pgTable('media_moderation_tasks', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().references(() => mediaAssets.id, { onDelete: 'cascade' }),
    status: text('status', {
        enum: ['pending', 'approved', 'rejected', 'needs_changes', 'cancelled'],
    }).notNull().default('pending'),
    slaHours: integer('sla_hours').notNull().default(24),
    escalateAfterHours: integer('escalate_after_hours').notNull().default(48),
    dueAt: timestamp('due_at'),
    reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    backupReviewerId: uuid('backup_reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    reviewNotes: text('review_notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    slaWindowCheck: check(
        'media_moderation_tasks_sla_window_check',
        sql`${t.escalateAfterHours} >= ${t.slaHours}`,
    ),
    userIdx: index('media_moderation_task_user_idx').on(t.userId),
    assetIdx: index('media_moderation_task_asset_idx').on(t.assetId),
    statusIdx: index('media_moderation_task_status_idx').on(t.status),
    reviewerIdx: index('media_moderation_task_reviewer_idx').on(t.reviewerId),
    dueAtIdx: index('media_moderation_task_due_at_idx').on(t.dueAt),
    createdIdx: index('media_moderation_task_created_idx').on(t.createdAt),
}));

export const mediaModerationEvents = pgTable('media_moderation_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').notNull().references(() => mediaModerationTasks.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().references(() => mediaAssets.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type', {
        enum: ['created', 'assigned', 'escalated', 'approved', 'rejected', 'needs_changes', 'cancelled', 'exported'],
    }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    prevEventHash: text('prev_event_hash'),
    eventHash: text('event_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    eventHashUidx: uniqueIndex('media_moderation_event_hash_uidx').on(t.eventHash),
    taskPrevHashUidx: uniqueIndex('media_moderation_event_task_prev_hash_uidx').on(t.taskId, t.prevEventHash),
    userIdx: index('media_moderation_event_user_idx').on(t.userId),
    taskIdx: index('media_moderation_event_task_idx').on(t.taskId),
    assetIdx: index('media_moderation_event_asset_idx').on(t.assetId),
    typeIdx: index('media_moderation_event_type_idx').on(t.eventType),
    createdIdx: index('media_moderation_event_created_idx').on(t.createdAt),
}));

export const mediaReviewPolicyDailySnapshots = pgTable('media_review_policy_daily_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { mode: 'date' }).notNull(),
    assignments: integer('assignments').notNull().default(0),
    overrides: integer('overrides').notNull().default(0),
    alertEvents: integer('alert_events').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    nonNegativeCheck: check(
        'media_review_policy_daily_non_negative_check',
        sql`${t.assignments} >= 0 AND ${t.overrides} >= 0 AND ${t.alertEvents} >= 0`,
    ),
    userDateUidx: uniqueIndex('media_review_policy_daily_user_date_uidx').on(t.userId, t.snapshotDate),
    userIdx: index('media_review_policy_daily_user_idx').on(t.userId),
    dateIdx: index('media_review_policy_daily_date_idx').on(t.snapshotDate),
}));

export const mediaReviewPolicyAlertCodeDailySnapshots = pgTable('media_review_policy_alert_code_daily_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { mode: 'date' }).notNull(),
    alertCode: text('alert_code').notNull(),
    count: integer('count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    nonNegativeCheck: check(
        'media_review_policy_alert_daily_non_negative_check',
        sql`${t.count} >= 0`,
    ),
    userDateCodeUidx: uniqueIndex('media_review_policy_alert_daily_user_code_uidx').on(
        t.userId,
        t.snapshotDate,
        t.alertCode,
    ),
    userDateIdx: index('media_review_policy_alert_daily_user_date_idx').on(t.userId, t.snapshotDate),
    codeIdx: index('media_review_policy_alert_daily_code_idx').on(t.alertCode),
}));

export const mediaReviewPolicyPlaybookDailySnapshots = pgTable('media_review_policy_playbook_daily_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { mode: 'date' }).notNull(),
    playbookId: text('playbook_id').notNull(),
    count: integer('count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    nonNegativeCheck: check(
        'media_review_policy_playbook_daily_non_negative_check',
        sql`${t.count} >= 0`,
    ),
    userDatePlaybookUidx: uniqueIndex('media_review_policy_playbook_daily_user_playbook_uidx').on(
        t.userId,
        t.snapshotDate,
        t.playbookId,
    ),
    userDateIdx: index('media_review_policy_playbook_daily_user_date_idx').on(t.userId, t.snapshotDate),
    playbookIdx: index('media_review_policy_playbook_daily_id_idx').on(t.playbookId),
}));

// ===========================================
// REVENUE SNAPSHOTS: Daily revenue tracking per domain
// ===========================================
export const revenueSnapshots = pgTable('revenue_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { mode: 'date' }).notNull(),

    // Revenue breakdown
    adRevenue: numeric('ad_revenue', { precision: 12, scale: 2 }).default('0'),
    affiliateRevenue: numeric('affiliate_revenue', { precision: 12, scale: 2 }).default('0'),
    leadGenRevenue: numeric('lead_gen_revenue', { precision: 12, scale: 2 }).default('0'),
    totalRevenue: numeric('total_revenue', { precision: 12, scale: 2 }).default('0'),

    // Traffic
    pageviews: integer('pageviews').default(0),
    uniqueVisitors: integer('unique_visitors').default(0),
    organicVisitors: integer('organic_visitors').default(0),

    // SEO
    avgPosition: numeric('avg_position', { precision: 8, scale: 2 }),
    impressions: integer('impressions').default(0),
    clicks: integer('clicks').default(0),
    ctr: numeric('ctr', { precision: 8, scale: 4 }),

    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    domainIdx: index('revenue_snapshot_domain_idx').on(t.domainId),
    dateIdx: index('revenue_snapshot_date_idx').on(t.snapshotDate),
    unq: uniqueIndex('revenue_snapshot_domain_date_uidx').on(t.domainId, t.snapshotDate),
}));

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
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),

    stage: text('stage', {
        enum: ['keyword_research', 'outline', 'draft', 'humanize', 'seo', 'resolve_links', 'meta', 'classify', 'research', 'evaluate', 'ai_review', 'ai_detection', 'vision']
    }).notNull(),
    modelKey: text('model_key').notNull().default('legacy'),
    model: text('model').notNull(),
    resolvedModel: text('resolved_model').notNull().default('legacy'),
    promptVersion: text('prompt_version').notNull().default('legacy.v1'),
    routingVersion: text('routing_version').notNull().default('legacy'),
    promptHash: text('prompt_hash'),
    promptBodyRedacted: text('prompt_body_redacted'),
    fallbackUsed: boolean('fallback_used').notNull().default(false),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cost: numeric('cost', { precision: 12, scale: 4, mode: 'number' }).notNull(),
    durationMs: integer('duration_ms'),

    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    articleIdx: index('api_call_article_idx').on(t.articleId),
    domainIdx: index('api_call_domain_idx').on(t.domainId),
    stageIdx: index('api_call_stage_idx').on(t.stage),
    promptHashIdx: index('api_call_prompt_hash_idx').on(t.promptHash),
    createdIdx: index('api_call_created_idx').on(t.createdAt),
}));

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
// DOMAIN FINANCE LEDGER: Canonical domain-level financial transactions
// ===========================================
export const domainFinanceLedgerEntries = pgTable('domain_finance_ledger_entries', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    entryDate: timestamp('entry_date', { mode: 'date' }).notNull(),
    entryType: text('entry_type', {
        enum: ['acquisition_cost', 'build_cost', 'operating_cost', 'channel_spend', 'revenue', 'adjustment'],
    }).notNull(),
    impact: text('impact', {
        enum: ['revenue', 'cost'],
    }).notNull().default('cost'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('USD'),
    source: text('source'),
    sourceRef: text('source_ref'),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    domainIdx: index('domain_finance_ledger_domain_idx').on(t.domainId),
    dateIdx: index('domain_finance_ledger_date_idx').on(t.entryDate),
    typeIdx: index('domain_finance_ledger_type_idx').on(t.entryType),
    impactIdx: index('domain_finance_ledger_impact_idx').on(t.impact),
    sourceIdentityUidx: uniqueIndex('domain_finance_ledger_source_identity_uidx').on(
        t.domainId,
        t.entryDate,
        t.source,
        t.sourceRef,
    ),
    sourceRefIdx: index('domain_finance_ledger_source_ref_idx').on(t.sourceRef),
    creatorIdx: index('domain_finance_ledger_created_by_idx').on(t.createdBy),
}));

// ===========================================
// DOMAIN FINANCE MONTHLY CLOSES: Per-domain P&L close snapshots
// ===========================================
export const domainFinanceMonthlyCloses = pgTable('domain_finance_monthly_closes', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    monthStart: timestamp('month_start', { mode: 'date' }).notNull(),
    monthEnd: timestamp('month_end', { mode: 'date' }).notNull(),
    revenueTotal: numeric('revenue_total', { precision: 12, scale: 2 }).notNull().default('0'),
    costTotal: numeric('cost_total', { precision: 12, scale: 2 }).notNull().default('0'),
    netTotal: numeric('net_total', { precision: 12, scale: 2 }).notNull().default('0'),
    marginPct: numeric('margin_pct', { precision: 7, scale: 4 }),
    entryCount: integer('entry_count').notNull().default(0),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at').defaultNow().notNull(),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
    domainIdx: index('domain_finance_close_domain_idx').on(t.domainId),
    monthStartIdx: index('domain_finance_close_month_start_idx').on(t.monthStart),
    closedAtIdx: index('domain_finance_close_closed_at_idx').on(t.closedAt),
    domainMonthUidx: uniqueIndex('domain_finance_close_domain_month_uidx').on(t.domainId, t.monthStart),
}));

// ===========================================
// NOTIFICATIONS: In-app notifications and alerts
// ===========================================
export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),

    type: text('type', {
        enum: ['renewal_warning', 'job_failed', 'deploy_failed', 'traffic_drop',
            'revenue_milestone', 'content_stale', 'domain_expiring', 'backlink_lost', 'search_quality',
            'ssl_expiring', 'dns_failure', 'info']
    }).notNull(),
    severity: text('severity', {
        enum: ['info', 'warning', 'critical']
    }).notNull().default('info'),

    title: text('title').notNull(),
    message: text('message').notNull(),
    actionUrl: text('action_url'),
    isRead: boolean('is_read').default(false),
    emailSent: boolean('email_sent').default(false),
    metadata: jsonb('metadata').$type<{ datasetId?: string;[key: string]: unknown }>().default({}),
    fingerprint: text('fingerprint'),

    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    isReadIdx: index('notification_is_read_idx').on(t.isRead),
    domainIdx: index('notification_domain_idx').on(t.domainId),
    typeIdx: index('notification_type_idx').on(t.type),
    fingerprintIdx: uniqueIndex('notification_fingerprint_idx').on(t.fingerprint),
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
    unq: unique().on(t.domainId, t.competitorDomain),
    domainIdx: index('competitor_domain_idx').on(t.domainId),
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
}, (t) => ({
    domainIdx: index('backlink_snapshot_domain_idx').on(t.domainId),
    dateIdx: index('backlink_snapshot_date_idx').on(t.snapshotDate),
    domainDateUnq: unique('backlink_snapshot_domain_date_unq').on(t.domainId, t.snapshotDate),
}));

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
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    tokenHashIdx: index('session_token_hash_idx').on(t.tokenHash),
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
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'cascade' }),
    pageDefinitionId: uuid('page_definition_id').references(() => pageDefinitions.id, { onDelete: 'set null' }),
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
    pageDefIdx: index('review_event_page_def_idx').on(t.pageDefinitionId),
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
    unitTestPassId: text('unit_test_pass_id'),
    calculationConfigHash: text('calculation_config_hash'),
    calculationHarnessVersion: text('calculation_harness_version'),
    allPassed: boolean('all_passed').default(false),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    articleIdx: index('qa_result_article_idx').on(t.articleId),
    reviewerIdx: index('qa_result_reviewer_idx').on(t.reviewerId),
    unitTestPassIdx: index('qa_result_unit_test_pass_idx').on(t.unitTestPassId),
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
// REVIEW TASKS: Human-in-loop approval queue
// ===========================================
export const reviewTasks = pgTable('review_tasks', {
    id: uuid('id').primaryKey().defaultRandom(),
    taskType: text('task_type', {
        enum: ['domain_buy', 'content_publish', 'campaign_launch']
    }).notNull(),
    entityId: uuid('entity_id').notNull(),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
    domainResearchId: uuid('domain_research_id').references(() => domainResearch.id, { onDelete: 'set null' }),
    checklistJson: jsonb('checklist_json').$type<Record<string, unknown>>().default({}),
    status: text('status', {
        enum: ['pending', 'approved', 'rejected', 'cancelled']
    }).notNull().default('pending'),
    slaHours: integer('sla_hours').notNull().default(24),
    escalateAfterHours: integer('escalate_after_hours').notNull().default(48),
    autoApproveAfterHours: integer('auto_approve_after_hours'),
    autoRejectAfterHours: integer('auto_reject_after_hours'),
    confidenceThresholds: jsonb('confidence_thresholds').$type<Record<string, unknown>>().default({}),
    reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    backupReviewerId: uuid('backup_reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at'),
    reviewNotes: text('review_notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    autoActionCheck: check(
        'review_tasks_auto_action_check',
        sql`${t.autoApproveAfterHours} IS NULL OR ${t.autoRejectAfterHours} IS NULL`,
    ),
    taskTypeIdx: index('review_task_type_idx').on(t.taskType),
    taskStatusIdx: index('review_task_status_idx').on(t.status),
    entityIdx: index('review_task_entity_idx').on(t.entityId),
    domainIdx: index('review_task_domain_idx').on(t.domainId),
    articleIdx: index('review_task_article_idx').on(t.articleId),
    domainResearchIdx: index('review_task_domain_research_idx').on(t.domainResearchId),
    reviewedAtIdx: index('review_task_reviewed_at_idx').on(t.reviewedAt),
    reviewerIdx: index('review_task_reviewer_idx').on(t.reviewerId),
    backupReviewerIdx: index('review_task_backup_reviewer_idx').on(t.backupReviewerId),
}));

// ===========================================
// PREVIEW BUILDS: Ephemeral reviewer preview artifacts
// ===========================================
export const previewBuilds = pgTable('preview_builds', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
    domainResearchId: uuid('domain_research_id').references(() => domainResearch.id, { onDelete: 'set null' }),
    previewUrl: text('preview_url').notNull(),
    expiresAt: timestamp('expires_at'),
    buildStatus: text('build_status', {
        enum: ['queued', 'building', 'ready', 'failed', 'expired']
    }).notNull().default('queued'),
    buildLog: text('build_log'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    domainIdx: index('preview_build_domain_idx').on(t.domainId),
    articleIdx: index('preview_build_article_idx').on(t.articleId),
    domainResearchIdx: index('preview_build_domain_research_idx').on(t.domainResearchId),
    statusIdx: index('preview_build_status_idx').on(t.buildStatus),
    expiresIdx: index('preview_build_expires_idx').on(t.expiresAt),
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
        totalPublished: number;
        totalInReview: number;
    }>().default({
        ymylApprovalRate: 0,
        citationCoverageRatio: 0,
        avgTimeInReviewHours: 0,
        articlesWithExpertReview: 0,
        articlesWithQaPassed: 0,
        disclosureComplianceRate: 0,
        meaningfulEditRatio: 0,
        totalPublished: 0,
        totalInReview: 0,
    }),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    domainIdx: index('compliance_snapshot_domain_idx').on(t.domainId),
    dateIdx: index('compliance_snapshot_date_idx').on(t.snapshotDate),
    unq: uniqueIndex('compliance_snapshot_domain_date_uidx').on(t.domainId, t.snapshotDate),
}));

// ===========================================
// DATASETS: External data sources with provenance tracking
// ===========================================
export const datasets = pgTable('datasets', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    sourceUrl: text('source_url'),
    sourceTitle: text('source_title'),
    publisher: text('publisher'),

    // Freshness tracking
    retrievedAt: timestamp('retrieved_at').defaultNow(),
    effectiveDate: timestamp('effective_date', { mode: 'date' }),
    expiresAt: timestamp('expires_at'),
    freshnessClass: text('freshness_class', {
        enum: ['realtime', 'weekly', 'monthly', 'quarterly', 'annual']
    }).default('monthly'),

    // Data storage
    data: jsonb('data').default({}),
    dataHash: text('data_hash'),
    version: integer('version').default(1),

    // Scope
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    nameIdx: index('dataset_name_idx').on(t.name),
    expiresIdx: index('dataset_expires_idx').on(t.expiresAt),
    domainIdx: index('dataset_domain_idx').on(t.domainId),
}));

// ===========================================
// ARTICLE DATASETS: Join table linking articles to data sources
// ===========================================
export const articleDatasets = pgTable('article_datasets', {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    datasetId: uuid('dataset_id').notNull().references(() => datasets.id, { onDelete: 'cascade' }),
    usage: text('usage'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    unq: unique('article_dataset_unq').on(t.articleId, t.datasetId),
    articleIdx: index('article_dataset_article_idx').on(t.articleId),
    datasetIdx: index('article_dataset_dataset_idx').on(t.datasetId),
}));

// ===========================================
// CLICK EVENTS: Campaign click attribution
// ===========================================
export const clickEvents = pgTable('click_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').references(() => promotionCampaigns.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
    visitorId: text('visitor_id'),
    fullUrl: text('full_url').notNull(),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmTerm: text('utm_term'),
    utmContent: text('utm_content'),
    referrer: text('referrer'),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
    campaignIdx: index('click_event_campaign_idx').on(t.campaignId),
    occurredIdx: index('click_event_occurred_idx').on(t.occurredAt),
    visitorIdx: index('click_event_visitor_idx').on(t.visitorId),
    utmCampaignIdx: index('click_event_utm_campaign_idx').on(t.utmCampaign),
}));

// ===========================================
// SUBSCRIBERS: Email captures from deployed sites
// ===========================================
export const subscribers = pgTable('subscribers', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),

    // Contact info
    email: text('email').notNull(),
    emailHash: text('email_hash').notNull(),
    name: text('name'),
    // Legacy plaintext phone column retained for compatibility; new writes should keep this null.
    phone: text('phone'),
    phoneHash: text('phone_hash'),

    // Source tracking
    source: text('source', {
        enum: ['lead_form', 'newsletter', 'wizard', 'popup', 'scroll_cta']
    }).notNull().default('lead_form'),
    sourceCampaignId: uuid('source_campaign_id').references(() => promotionCampaigns.id, { onDelete: 'set null' }),
    sourceClickId: uuid('source_click_id').references(() => clickEvents.id, { onDelete: 'set null' }),
    originalUtm: jsonb('original_utm').$type<Record<string, string>>().default({}),

    // Custom form data (arbitrary fields from leadGenConfig)
    formData: jsonb('form_data').$type<Record<string, string>>().default({}),

    // Status
    status: text('status', {
        enum: ['active', 'unsubscribed', 'bounced', 'archived']
    }).notNull().default('active'),

    // Value tracking
    estimatedValue: numeric('estimated_value', { precision: 12, scale: 2, mode: 'number' }),
    convertedAt: timestamp('converted_at'),

    // Metadata
    // Pseudonymized metadata only (no raw IP / user-agent storage).
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
    userAgentFingerprint: text('user_agent_fingerprint'),
    referrer: text('referrer'),
    referrerFingerprint: text('referrer_fingerprint'),
    retentionExpiresAt: timestamp('retention_expires_at'),
    retentionPolicyVersion: text('retention_policy_version').notNull().default('subscriber-v1'),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    domainIdx: index('subscriber_domain_idx').on(t.domainId),
    emailIdx: index('subscriber_email_idx').on(t.email),
    emailHashIdx: index('subscriber_email_hash_idx').on(t.emailHash),
    sourceIdx: index('subscriber_source_idx').on(t.source),
    statusIdx: index('subscriber_status_idx').on(t.status),
    ipHashIdx: index('subscriber_ip_hash_idx').on(t.ipHash),
    userAgentHashIdx: index('subscriber_user_agent_hash_idx').on(t.userAgentHash),
    retentionExpiresIdx: index('subscriber_retention_expires_idx').on(t.retentionExpiresAt),
    sourceCampaignIdx: index('subscriber_source_campaign_idx').on(t.sourceCampaignId),
    sourceClickIdx: index('subscriber_source_click_idx').on(t.sourceClickId),
    domainEmailUnq: unique('subscriber_domain_email_unq').on(t.domainId, t.email),
}));

// ===========================================
// A/B TESTS: Title and CTA testing
// ===========================================
export const abTests = pgTable('ab_tests', {
    id: uuid('id').primaryKey().defaultRandom(),
    articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
    testType: text('test_type', {
        enum: ['title', 'meta_description', 'cta']
    }).notNull(),
    status: text('status', {
        enum: ['active', 'completed', 'cancelled']
    }).notNull().default('active'),
    variants: jsonb('variants').$type<Array<{
        id: string;
        value: string;
        impressions: number;
        clicks: number;
        conversions: number;
        allocationPct?: number;
    }>>().notNull(),
    winnerId: text('winner_id'),
    confidenceLevel: real('confidence_level'),
    startedAt: timestamp('started_at').defaultNow(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    articleIdx: index('ab_test_article_idx').on(t.articleId),
    statusIdx: index('ab_test_status_idx').on(t.status),
}));

// ===========================================
// COMPETITOR SNAPSHOTS: Historical SERP tracking
// ===========================================
export const competitorSnapshots = pgTable('competitor_snapshots', {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id').notNull().references(() => competitors.id, { onDelete: 'cascade' }),
    snapshotDate: timestamp('snapshot_date', { mode: 'date' }).notNull(),
    estimatedTraffic: integer('estimated_traffic'),
    domainAuthority: integer('domain_authority'),
    topKeywords: jsonb('top_keywords').$type<Array<{
        keyword: string;
        position: number;
        volume: number;
    }>>().default([]),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    competitorIdx: index('comp_snapshot_competitor_idx').on(t.competitorId),
    dateIdx: index('comp_snapshot_date_idx').on(t.snapshotDate),
    competitorDateUnq: unique('comp_snapshot_competitor_date_unq').on(t.competitorId, t.snapshotDate),
}));

// ===========================================
// IDEMPOTENCY KEYS: Prevent duplicate mutations from retries
// ===========================================
export const idempotencyKeys = pgTable('idempotency_keys', {
    key: text('key').primaryKey(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    statusCode: integer('status_code').notNull(),
    responseBody: text('response_body').notNull(),
    status: text('status', { enum: ['started', 'completed'] }).notNull().default('completed'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
}, (t) => ({
    expiresIdx: index('idempotency_expires_idx').on(t.expiresAt),
}));

// ===========================================
// RELATIONS
// ===========================================
export const domainsRelations = relations(domains, ({ many, one }) => ({
    keywords: many(keywords),
    articles: many(articles),
    lifecycleEvents: many(domainLifecycleEvents),
    registrarProfile: one(domainRegistrarProfiles),
    ownershipEvents: many(domainOwnershipEvents),
    financeLedgerEntries: many(domainFinanceLedgerEntries),
    financeMonthlyCloses: many(domainFinanceMonthlyCloses),
    monetizationProfile: one(monetizationProfiles),
    revenueSnapshots: many(revenueSnapshots),
    expenses: many(expenses),
    notifications: many(notifications),
    competitors: many(competitors),
    backlinkSnapshots: many(backlinkSnapshots),
    approvalPolicies: many(approvalPolicies),
    reviewTasks: many(reviewTasks),
    previewBuilds: many(previewBuilds),
    disclosureConfig: one(disclosureConfigs),
    complianceSnapshots: many(complianceSnapshots),
    datasets: many(datasets),
    subscribers: many(subscribers),
    channelProfiles: many(domainChannelProfiles),
    integrationConnections: many(integrationConnections),
    redirectTarget: one(domains, {
        fields: [domains.redirectTargetId],
        references: [domains.id],
    }),
}));

export const pageDefinitionsRelations = relations(pageDefinitions, ({ one, many }) => ({
    domain: one(domains, {
        fields: [pageDefinitions.domainId],
        references: [domains.id],
    }),
    lastReviewedByUser: one(users, {
        fields: [pageDefinitions.lastReviewedBy],
        references: [users.id],
    }),
    variants: many(pageVariants),
}));

export const pageVariantsRelations = relations(pageVariants, ({ one }) => ({
    page: one(pageDefinitions, {
        fields: [pageVariants.pageId],
        references: [pageDefinitions.id],
    }),
}));

export const blockTemplatesRelations = relations(blockTemplates, ({ one }) => ({
    sourceDomain: one(domains, {
        fields: [blockTemplates.sourceDomainId],
        references: [domains.id],
    }),
    creator: one(users, {
        fields: [blockTemplates.createdBy],
        references: [users.id],
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
    reviewTasks: many(reviewTasks),
    previewBuilds: many(previewBuilds),
    citations: many(citations),
    articleDatasets: many(articleDatasets),
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

export const domainFinanceLedgerEntriesRelations = relations(domainFinanceLedgerEntries, ({ one }) => ({
    domain: one(domains, {
        fields: [domainFinanceLedgerEntries.domainId],
        references: [domains.id],
    }),
    creator: one(users, {
        fields: [domainFinanceLedgerEntries.createdBy],
        references: [users.id],
    }),
}));

export const domainFinanceMonthlyClosesRelations = relations(domainFinanceMonthlyCloses, ({ one }) => ({
    domain: one(domains, {
        fields: [domainFinanceMonthlyCloses.domainId],
        references: [domains.id],
    }),
    closedByUser: one(users, {
        fields: [domainFinanceMonthlyCloses.closedBy],
        references: [users.id],
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
    createdReviewTasks: many(reviewTasks, { relationName: 'review_task_creator' }),
    reviewedTasks: many(reviewTasks, { relationName: 'review_task_reviewer' }),
    backupReviewTasks: many(reviewTasks, { relationName: 'review_task_backup_reviewer' }),
    createdPreviewBuilds: many(previewBuilds, { relationName: 'preview_build_creator' }),
    growthChannelCredentials: many(growthChannelCredentials),
    growthCredentialDrillRunsOwned: many(growthCredentialDrillRuns, { relationName: 'growth_credential_drill_run_owner' }),
    growthCredentialDrillRunsInitiated: many(growthCredentialDrillRuns, { relationName: 'growth_credential_drill_run_initiator' }),
    mediaAssets: many(mediaAssets),
    mediaModerationTasksOwned: many(mediaModerationTasks, { relationName: 'media_moderation_task_owner' }),
    mediaModerationTasksCreated: many(mediaModerationTasks, { relationName: 'media_moderation_task_creator' }),
    mediaModerationTasksReviewer: many(mediaModerationTasks, { relationName: 'media_moderation_task_reviewer' }),
    mediaModerationTasksBackupReviewer: many(mediaModerationTasks, { relationName: 'media_moderation_task_backup_reviewer' }),
    mediaModerationTasksReviewedBy: many(mediaModerationTasks, { relationName: 'media_moderation_task_reviewed_by' }),
    mediaModerationEventsOwned: many(mediaModerationEvents, { relationName: 'media_moderation_event_owner' }),
    mediaModerationEventsActor: many(mediaModerationEvents, { relationName: 'media_moderation_event_actor' }),
    domainLifecycleEventsActor: many(domainLifecycleEvents),
    domainRegistrarProfilesOwnershipChanged: many(domainRegistrarProfiles),
    domainOwnershipEventsActor: many(domainOwnershipEvents),
    domainFinanceLedgerEntriesCreated: many(domainFinanceLedgerEntries),
    domainFinanceMonthlyClosesClosed: many(domainFinanceMonthlyCloses),
    integrationConnectionsOwned: many(integrationConnections, { relationName: 'integration_connection_owner' }),
    integrationConnectionsCreated: many(integrationConnections, { relationName: 'integration_connection_creator' }),
    integrationSyncRunsTriggered: many(integrationSyncRuns, { relationName: 'integration_sync_run_triggered_by' }),
}));

export const domainLifecycleEventsRelations = relations(domainLifecycleEvents, ({ one }) => ({
    domain: one(domains, {
        fields: [domainLifecycleEvents.domainId],
        references: [domains.id],
    }),
    actor: one(users, {
        fields: [domainLifecycleEvents.actorId],
        references: [users.id],
    }),
}));

export const domainRegistrarProfilesRelations = relations(domainRegistrarProfiles, ({ one, many }) => ({
    domain: one(domains, {
        fields: [domainRegistrarProfiles.domainId],
        references: [domains.id],
    }),
    connection: one(integrationConnections, {
        fields: [domainRegistrarProfiles.connectionId],
        references: [integrationConnections.id],
    }),
    ownershipChangedByUser: one(users, {
        fields: [domainRegistrarProfiles.ownershipChangedBy],
        references: [users.id],
    }),
    events: many(domainOwnershipEvents),
}));

export const domainOwnershipEventsRelations = relations(domainOwnershipEvents, ({ one }) => ({
    domain: one(domains, {
        fields: [domainOwnershipEvents.domainId],
        references: [domains.id],
    }),
    profile: one(domainRegistrarProfiles, {
        fields: [domainOwnershipEvents.profileId],
        references: [domainRegistrarProfiles.id],
    }),
    actor: one(users, {
        fields: [domainOwnershipEvents.actorId],
        references: [users.id],
    }),
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
    pageDefinition: one(pageDefinitions, {
        fields: [reviewEvents.pageDefinitionId],
        references: [pageDefinitions.id],
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

export const domainResearchRelations = relations(domainResearch, ({ one, many }) => ({
    domain: one(domains, {
        fields: [domainResearch.domainId],
        references: [domains.id],
    }),
    acquisitionEvents: many(acquisitionEvents),
    reviewTasks: many(reviewTasks),
    previewBuilds: many(previewBuilds),
    promotionCampaigns: many(promotionCampaigns),
}));

export const acquisitionEventsRelations = relations(acquisitionEvents, ({ one }) => ({
    domainResearch: one(domainResearch, {
        fields: [acquisitionEvents.domainResearchId],
        references: [domainResearch.id],
    }),
}));

export const reviewTasksRelations = relations(reviewTasks, ({ one }) => ({
    domain: one(domains, {
        fields: [reviewTasks.domainId],
        references: [domains.id],
    }),
    article: one(articles, {
        fields: [reviewTasks.articleId],
        references: [articles.id],
    }),
    domainResearch: one(domainResearch, {
        fields: [reviewTasks.domainResearchId],
        references: [domainResearch.id],
    }),
    createdByUser: one(users, {
        fields: [reviewTasks.createdBy],
        references: [users.id],
        relationName: 'review_task_creator',
    }),
    reviewer: one(users, {
        fields: [reviewTasks.reviewerId],
        references: [users.id],
        relationName: 'review_task_reviewer',
    }),
    backupReviewer: one(users, {
        fields: [reviewTasks.backupReviewerId],
        references: [users.id],
        relationName: 'review_task_backup_reviewer',
    }),
}));

export const previewBuildsRelations = relations(previewBuilds, ({ one }) => ({
    domain: one(domains, {
        fields: [previewBuilds.domainId],
        references: [domains.id],
    }),
    article: one(articles, {
        fields: [previewBuilds.articleId],
        references: [articles.id],
    }),
    domainResearch: one(domainResearch, {
        fields: [previewBuilds.domainResearchId],
        references: [domainResearch.id],
    }),
    createdByUser: one(users, {
        fields: [previewBuilds.createdBy],
        references: [users.id],
        relationName: 'preview_build_creator',
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

export const datasetsRelations = relations(datasets, ({ one, many }) => ({
    domain: one(domains, {
        fields: [datasets.domainId],
        references: [domains.id],
    }),
    articleDatasets: many(articleDatasets),
}));

export const articleDatasetsRelations = relations(articleDatasets, ({ one }) => ({
    article: one(articles, {
        fields: [articleDatasets.articleId],
        references: [articles.id],
    }),
    dataset: one(datasets, {
        fields: [articleDatasets.datasetId],
        references: [datasets.id],
    }),
}));

export const promotionCampaignsRelations = relations(promotionCampaigns, ({ one, many }) => ({
    domainResearch: one(domainResearch, {
        fields: [promotionCampaigns.domainResearchId],
        references: [domainResearch.id],
    }),
    promotionJobs: many(promotionJobs),
    promotionEvents: many(promotionEvents),
}));

export const promotionJobsRelations = relations(promotionJobs, ({ one }) => ({
    campaign: one(promotionCampaigns, {
        fields: [promotionJobs.campaignId],
        references: [promotionCampaigns.id],
    }),
}));

export const promotionEventsRelations = relations(promotionEvents, ({ one }) => ({
    campaign: one(promotionCampaigns, {
        fields: [promotionEvents.campaignId],
        references: [promotionCampaigns.id],
    }),
}));

export const clickEventsRelations = relations(clickEvents, ({ one, many }) => ({
    campaign: one(promotionCampaigns, {
        fields: [clickEvents.campaignId],
        references: [promotionCampaigns.id],
    }),
    subscribers: many(subscribers),
}));

export const subscribersRelations = relations(subscribers, ({ one }) => ({
    domain: one(domains, {
        fields: [subscribers.domainId],
        references: [domains.id],
    }),
    article: one(articles, {
        fields: [subscribers.articleId],
        references: [articles.id],
    }),
    sourceCampaign: one(promotionCampaigns, {
        fields: [subscribers.sourceCampaignId],
        references: [promotionCampaigns.id],
    }),
    sourceClick: one(clickEvents, {
        fields: [subscribers.sourceClickId],
        references: [clickEvents.id],
    }),
}));

export const growthChannelCredentialsRelations = relations(growthChannelCredentials, ({ one }) => ({
    user: one(users, {
        fields: [growthChannelCredentials.userId],
        references: [users.id],
    }),
}));

export const growthCredentialDrillRunsRelations = relations(growthCredentialDrillRuns, ({ one }) => ({
    user: one(users, {
        fields: [growthCredentialDrillRuns.userId],
        references: [users.id],
        relationName: 'growth_credential_drill_run_owner',
    }),
    initiatedByUser: one(users, {
        fields: [growthCredentialDrillRuns.initiatedBy],
        references: [users.id],
        relationName: 'growth_credential_drill_run_initiator',
    }),
}));

export const integrationConnectionsRelations = relations(integrationConnections, ({ one, many }) => ({
    user: one(users, {
        fields: [integrationConnections.userId],
        references: [users.id],
        relationName: 'integration_connection_owner',
    }),
    domain: one(domains, {
        fields: [integrationConnections.domainId],
        references: [domains.id],
    }),
    creator: one(users, {
        fields: [integrationConnections.createdBy],
        references: [users.id],
        relationName: 'integration_connection_creator',
    }),
    registrarProfiles: many(domainRegistrarProfiles),
    syncRuns: many(integrationSyncRuns),
    cloudflareShardHealth: many(cloudflareShardHealth),
}));

export const integrationSyncRunsRelations = relations(integrationSyncRuns, ({ one }) => ({
    connection: one(integrationConnections, {
        fields: [integrationSyncRuns.connectionId],
        references: [integrationConnections.id],
    }),
    triggeredByUser: one(users, {
        fields: [integrationSyncRuns.triggeredBy],
        references: [users.id],
        relationName: 'integration_sync_run_triggered_by',
    }),
}));

export const cloudflareShardHealthRelations = relations(cloudflareShardHealth, ({ one }) => ({
    sourceConnection: one(integrationConnections, {
        fields: [cloudflareShardHealth.sourceConnectionId],
        references: [integrationConnections.id],
    }),
}));

export const domainChannelProfilesRelations = relations(domainChannelProfiles, ({ one }) => ({
    domain: one(domains, {
        fields: [domainChannelProfiles.domainId],
        references: [domains.id],
    }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
    user: one(users, {
        fields: [mediaAssets.userId],
        references: [users.id],
    }),
    usages: many(mediaAssetUsage),
    moderationTasks: many(mediaModerationTasks),
    moderationEvents: many(mediaModerationEvents),
}));

export const mediaAssetUsageRelations = relations(mediaAssetUsage, ({ one }) => ({
    asset: one(mediaAssets, {
        fields: [mediaAssetUsage.assetId],
        references: [mediaAssets.id],
    }),
    campaign: one(promotionCampaigns, {
        fields: [mediaAssetUsage.campaignId],
        references: [promotionCampaigns.id],
    }),
    job: one(promotionJobs, {
        fields: [mediaAssetUsage.jobId],
        references: [promotionJobs.id],
    }),
}));

export const mediaModerationTasksRelations = relations(mediaModerationTasks, ({ one, many }) => ({
    user: one(users, {
        fields: [mediaModerationTasks.userId],
        references: [users.id],
        relationName: 'media_moderation_task_owner',
    }),
    asset: one(mediaAssets, {
        fields: [mediaModerationTasks.assetId],
        references: [mediaAssets.id],
    }),
    creator: one(users, {
        fields: [mediaModerationTasks.createdBy],
        references: [users.id],
        relationName: 'media_moderation_task_creator',
    }),
    reviewer: one(users, {
        fields: [mediaModerationTasks.reviewerId],
        references: [users.id],
        relationName: 'media_moderation_task_reviewer',
    }),
    backupReviewer: one(users, {
        fields: [mediaModerationTasks.backupReviewerId],
        references: [users.id],
        relationName: 'media_moderation_task_backup_reviewer',
    }),
    reviewedByUser: one(users, {
        fields: [mediaModerationTasks.reviewedBy],
        references: [users.id],
        relationName: 'media_moderation_task_reviewed_by',
    }),
    events: many(mediaModerationEvents),
}));

export const mediaModerationEventsRelations = relations(mediaModerationEvents, ({ one }) => ({
    user: one(users, {
        fields: [mediaModerationEvents.userId],
        references: [users.id],
        relationName: 'media_moderation_event_owner',
    }),
    task: one(mediaModerationTasks, {
        fields: [mediaModerationEvents.taskId],
        references: [mediaModerationTasks.id],
    }),
    asset: one(mediaAssets, {
        fields: [mediaModerationEvents.assetId],
        references: [mediaAssets.id],
    }),
    actor: one(users, {
        fields: [mediaModerationEvents.actorId],
        references: [users.id],
        relationName: 'media_moderation_event_actor',
    }),
}));

export const abTestsRelations = relations(abTests, ({ one }) => ({
    article: one(articles, {
        fields: [abTests.articleId],
        references: [articles.id],
    }),
}));

export const competitorSnapshotsRelations = relations(competitorSnapshots, ({ one }) => ({
    competitor: one(competitors, {
        fields: [competitorSnapshots.competitorId],
        references: [competitors.id],
    }),
}));

// ===========================================
// TYPE EXPORTS
// ===========================================
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type DomainLifecycleEvent = typeof domainLifecycleEvents.$inferSelect;
export type NewDomainLifecycleEvent = typeof domainLifecycleEvents.$inferInsert;
export type DomainRegistrarProfile = typeof domainRegistrarProfiles.$inferSelect;
export type NewDomainRegistrarProfile = typeof domainRegistrarProfiles.$inferInsert;
export type DomainOwnershipEvent = typeof domainOwnershipEvents.$inferSelect;
export type NewDomainOwnershipEvent = typeof domainOwnershipEvents.$inferInsert;
export type DomainFinanceLedgerEntry = typeof domainFinanceLedgerEntries.$inferSelect;
export type NewDomainFinanceLedgerEntry = typeof domainFinanceLedgerEntries.$inferInsert;
export type DomainFinanceMonthlyClose = typeof domainFinanceMonthlyCloses.$inferSelect;
export type NewDomainFinanceMonthlyClose = typeof domainFinanceMonthlyCloses.$inferInsert;
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type MonetizationProfile = typeof monetizationProfiles.$inferSelect;
export type ContentQueueJob = typeof contentQueue.$inferSelect;
export type DomainResearch = typeof domainResearch.$inferSelect;
export type AcquisitionEvent = typeof acquisitionEvents.$inferSelect;
export type ResearchCache = typeof researchCache.$inferSelect;
export type DomainKnowledge = typeof domainKnowledge.$inferSelect;
export type NewDomainKnowledge = typeof domainKnowledge.$inferInsert;
export type PromotionCampaign = typeof promotionCampaigns.$inferSelect;
export type DomainChannelProfile = typeof domainChannelProfiles.$inferSelect;
export type PromotionJob = typeof promotionJobs.$inferSelect;
export type PromotionEvent = typeof promotionEvents.$inferSelect;
export type GrowthChannelCredential = typeof growthChannelCredentials.$inferSelect;
export type GrowthCredentialDrillRun = typeof growthCredentialDrillRuns.$inferSelect;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type NewIntegrationConnection = typeof integrationConnections.$inferInsert;
export type IntegrationSyncRun = typeof integrationSyncRuns.$inferSelect;
export type NewIntegrationSyncRun = typeof integrationSyncRuns.$inferInsert;
export type CloudflareShardHealth = typeof cloudflareShardHealth.$inferSelect;
export type NewCloudflareShardHealth = typeof cloudflareShardHealth.$inferInsert;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type MediaAssetUsage = typeof mediaAssetUsage.$inferSelect;
export type MediaModerationTask = typeof mediaModerationTasks.$inferSelect;
export type MediaModerationEvent = typeof mediaModerationEvents.$inferSelect;
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
export type ReviewTask = typeof reviewTasks.$inferSelect;
export type PreviewBuild = typeof previewBuilds.$inferSelect;
export type Citation = typeof citations.$inferSelect;
export type DisclosureConfig = typeof disclosureConfigs.$inferSelect;
export type ComplianceSnapshot = typeof complianceSnapshots.$inferSelect;
export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;
export type ArticleDataset = typeof articleDatasets.$inferSelect;
export type NewArticleDataset = typeof articleDatasets.$inferInsert;
export type ClickEvent = typeof clickEvents.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type AbTest = typeof abTests.$inferSelect;
export type NewAbTest = typeof abTests.$inferInsert;
export type CompetitorSnapshot = typeof competitorSnapshots.$inferSelect;

// ===========================================
// FORM SUBMISSIONS: Data collected from deployed site forms
// ===========================================
export const formSubmissions = pgTable('form_submissions', {
    id: uuid('id').primaryKey().defaultRandom(),
    domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
    domain: text('domain').notNull(),
    formType: text('form_type', {
        enum: ['lead', 'newsletter', 'contact', 'calculator', 'quiz', 'survey'],
    }).notNull().default('lead'),
    route: text('route').notNull().default('/'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    email: text('email'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    referrer: text('referrer'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    domainIdx: index('form_sub_domain_idx').on(t.domain),
    domainIdIdx: index('form_sub_domain_id_idx').on(t.domainId),
    formTypeIdx: index('form_sub_type_idx').on(t.formType),
    emailIdx: index('form_sub_email_idx').on(t.email),
    createdAtIdx: index('form_sub_created_idx').on(t.createdAt),
}));

export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
