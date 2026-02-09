import { pgTable, text, integer, real, boolean, timestamp, jsonb, uuid, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

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
    siteTemplate: text('site_template', {
        enum: ['authority', 'comparison', 'calculator', 'review']
    }).default('authority'),
    isDeployed: boolean('is_deployed').default(false),
    lastDeployedAt: timestamp('last_deployed_at'),

    // Valuation
    estimatedFlipValueLow: real('estimated_flip_value_low'),
    estimatedFlipValueHigh: real('estimated_flip_value_high'),
    estimatedMonthlyRevenueLow: real('estimated_monthly_revenue_low'),
    estimatedMonthlyRevenueHigh: real('estimated_monthly_revenue_high'),

    // Notes
    notes: text('notes'),
    tags: jsonb('tags').$type<string[]>().default([]),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    statusIdx: index('domain_status_idx').on(t.status),
    tierIdx: index('domain_tier_idx').on(t.tier),
    bucketIdx: index('domain_bucket_idx').on(t.bucket),
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
            'fetch_analytics', 'keyword_research', 'bulk_seed'
        ]
    }).notNull(),

    // References
    domainId: uuid('domain_id').references(() => domains.id),
    articleId: uuid('article_id').references(() => articles.id),
    keywordId: uuid('keyword_id').references(() => keywords.id),

    // Job data
    payload: jsonb('payload').default({}),
    result: jsonb('result'),

    // Status
    status: text('status', {
        enum: ['pending', 'processing', 'completed', 'failed', 'cancelled']
    }).default('pending'),
    priority: integer('priority').default(5),
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
    scheduledFor: timestamp('scheduled_for').defaultNow(),
    lockedUntil: timestamp('locked_until'),
});

// ===========================================
// DOMAIN RESEARCH LOG: Track domains investigated
// ===========================================
export const domainResearch = pgTable('domain_research', {
    id: uuid('id').primaryKey().defaultRandom(),
    domain: text('domain').notNull(),
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

    stage: text('stage', {
        enum: ['keyword_research', 'outline', 'draft', 'humanize', 'seo', 'meta', 'classify']
    }).notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cost: real('cost').notNull(),
    durationMs: integer('duration_ms'),

    createdAt: timestamp('created_at').defaultNow(),
});

// ===========================================
// RELATIONS
// ===========================================
export const domainsRelations = relations(domains, ({ many, one }) => ({
    keywords: many(keywords),
    articles: many(articles),
    monetizationProfile: one(monetizationProfiles),
    revenueSnapshots: many(revenueSnapshots),
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

export const articlesRelations = relations(articles, ({ one }) => ({
    domain: one(domains, {
        fields: [articles.domainId],
        references: [domains.id],
    }),
}));

export const monetizationProfilesRelations = relations(monetizationProfiles, ({ one }) => ({
    domain: one(domains, {
        fields: [monetizationProfiles.domainId],
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
