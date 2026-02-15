export type IntegrationProviderCategory =
    | 'registrar'
    | 'parking'
    | 'affiliate_network'
    | 'analytics'
    | 'email'
    | 'design'
    | 'hosting'
    | 'seo'
    | 'other';

export type IntegrationProviderScope = 'domain' | 'portfolio' | 'both';

export interface IntegrationProviderDefinition {
    provider: string;
    displayName: string;
    category: IntegrationProviderCategory;
    scope: IntegrationProviderScope;
    executableSync: boolean;
    supportsScheduledSync: boolean;
    defaultSyncIntervalMinutes: number | null;
    defaultLookbackDays: number | null;
    notes?: string;
}

export const INTEGRATION_PROVIDER_CATALOG: IntegrationProviderDefinition[] = [
    {
        provider: 'godaddy',
        displayName: 'GoDaddy',
        category: 'registrar',
        scope: 'both',
        executableSync: true,
        supportsScheduledSync: true,
        defaultSyncIntervalMinutes: 24 * 60,
        defaultLookbackDays: 90,
    },
    {
        provider: 'namecheap',
        displayName: 'Namecheap',
        category: 'registrar',
        scope: 'both',
        executableSync: true,
        supportsScheduledSync: true,
        defaultSyncIntervalMinutes: 24 * 60,
        defaultLookbackDays: 90,
        notes: 'Uses renewal sync fallback path pending dedicated API adapter.',
    },
    {
        provider: 'sedo',
        displayName: 'Sedo',
        category: 'parking',
        scope: 'both',
        executableSync: true,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
        notes: 'Revenue sync reads connection.config.revenueRecords baseline payload.',
    },
    {
        provider: 'bodis',
        displayName: 'Bodis',
        category: 'parking',
        scope: 'both',
        executableSync: true,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
        notes: 'Revenue sync reads connection.config.revenueRecords baseline payload.',
    },
    {
        provider: 'cloudflare',
        displayName: 'Cloudflare',
        category: 'hosting',
        scope: 'domain',
        executableSync: true,
        supportsScheduledSync: true,
        defaultSyncIntervalMinutes: 6 * 60,
        defaultLookbackDays: 7,
        notes: 'Analytics sync supported for domain-scoped connections.',
    },
    {
        provider: 'cpanel',
        displayName: 'cPanel',
        category: 'hosting',
        scope: 'domain',
        executableSync: false,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
    },
    {
        provider: 'google_analytics',
        displayName: 'Google Analytics',
        category: 'analytics',
        scope: 'domain',
        executableSync: false,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
    },
    {
        provider: 'google_search_console',
        displayName: 'Google Search Console',
        category: 'seo',
        scope: 'domain',
        executableSync: true,
        supportsScheduledSync: true,
        defaultSyncIntervalMinutes: 24 * 60,
        defaultLookbackDays: 30,
    },
    {
        provider: 'semrush',
        displayName: 'SEMrush',
        category: 'seo',
        scope: 'domain',
        executableSync: false,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
    },
    {
        provider: 'mailchimp',
        displayName: 'Mailchimp',
        category: 'email',
        scope: 'portfolio',
        executableSync: false,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
    },
    {
        provider: 'convertkit',
        displayName: 'ConvertKit',
        category: 'email',
        scope: 'portfolio',
        executableSync: false,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
    },
    {
        provider: 'figma',
        displayName: 'Figma',
        category: 'design',
        scope: 'portfolio',
        executableSync: false,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
    },
    {
        provider: 'impact',
        displayName: 'Impact',
        category: 'affiliate_network',
        scope: 'both',
        executableSync: true,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
        notes: 'Revenue sync reads connection.config.revenueRecords baseline payload.',
    },
    {
        provider: 'cj',
        displayName: 'CJ Affiliate',
        category: 'affiliate_network',
        scope: 'both',
        executableSync: true,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
        notes: 'Revenue sync reads connection.config.revenueRecords baseline payload.',
    },
    {
        provider: 'awin',
        displayName: 'Awin',
        category: 'affiliate_network',
        scope: 'both',
        executableSync: true,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
        notes: 'Revenue sync reads connection.config.revenueRecords baseline payload.',
    },
    {
        provider: 'rakuten',
        displayName: 'Rakuten Advertising',
        category: 'affiliate_network',
        scope: 'both',
        executableSync: true,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
        notes: 'Revenue sync reads connection.config.revenueRecords baseline payload.',
    },
    {
        provider: 'custom',
        displayName: 'Custom',
        category: 'other',
        scope: 'both',
        executableSync: false,
        supportsScheduledSync: false,
        defaultSyncIntervalMinutes: null,
        defaultLookbackDays: null,
    },
];

const providerIndex = new Map(
    INTEGRATION_PROVIDER_CATALOG.map((provider) => [provider.provider, provider] as const),
);

export function getIntegrationProviderDefinition(provider: string): IntegrationProviderDefinition | null {
    return providerIndex.get(provider) ?? null;
}

export const EXECUTABLE_SYNC_PROVIDERS = INTEGRATION_PROVIDER_CATALOG
    .filter((provider) => provider.executableSync)
    .map((provider) => provider.provider);

export const SCHEDULED_SYNC_PROVIDERS = INTEGRATION_PROVIDER_CATALOG
    .filter((provider) => provider.executableSync && provider.supportsScheduledSync)
    .map((provider) => provider.provider);
