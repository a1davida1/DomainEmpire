import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock drizzle-orm
const mockIsNull = vi.fn().mockReturnValue({ type: 'is_null' });
const mockEq = vi.fn().mockReturnValue({ type: 'eq' });
const mockAnd = vi.fn().mockReturnValue({ type: 'and' });

vi.mock('drizzle-orm', () => ({
    isNull: (...args: unknown[]) => mockIsNull(...args),
    eq: (...args: unknown[]) => mockEq(...args),
    and: (...args: unknown[]) => mockAnd(...args),
}));

// Isolated mocks for each stage
const mockUpdateReturning = vi.fn();
const mockSelectReturning = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockSelectWhere = vi.fn();
const mockSelectFrom = vi.fn();
const mockSelectLimit = vi.fn();

const mockDb = {
    update: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
};

// Setup chainable behaviors
const setupMocks = () => {
    vi.clearAllMocks();

    // Default Update chain
    mockDb.update.mockReturnValue({
        set: mockUpdateSet.mockReturnValue({
            where: mockUpdateWhere.mockReturnValue({
                returning: mockUpdateReturning,
            }),
        }),
    });

    // Default Select chain
    mockDb.select.mockReturnValue({
        from: mockSelectFrom.mockReturnValue({
            where: mockSelectWhere.mockReturnValue({
                limit: mockSelectLimit.mockImplementation(() => mockSelectReturning()),
                returning: mockSelectReturning, // for queries without limit
            }),
        }),
    });

    // Transaction mock
    mockDb.transaction.mockImplementation((cb) => cb(mockDb));
};

const mockDomains = {
    id: { name: 'id' },
    domain: { name: 'domain' },
    deletedAt: { name: 'deleted_at' },
};

const mockArticles = {
    id: { name: 'id' },
    domainId: { name: 'domain_id' },
    deletedAt: { name: 'deleted_at' },
};

vi.mock('@/lib/db', () => ({
    db: mockDb,
    domains: mockDomains,
    articles: mockArticles,
}));

// Import after mocks are set up
const { notDeleted, softDeleteDomain, softDeleteArticle, restoreDomain, restoreArticle } = await import('@/lib/db/soft-delete');

describe('notDeleted', () => {
    it('calls isNull on the deletedAt column', () => {
        const table = { deletedAt: { name: 'deleted_at' } };
        notDeleted(table as any);
        expect(mockIsNull).toHaveBeenCalledWith(table.deletedAt);
    });
});

describe('softDeleteDomain', () => {
    beforeEach(() => {
        setupMocks();
        mockUpdateReturning.mockResolvedValue([{ domain: 'example.com' }]);
    });

    it('sets deletedAt to current timestamp on domain', async () => {
        const result = await softDeleteDomain('test-uuid');
        expect(mockDb.update).toHaveBeenCalledWith(mockDomains);
        expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
            deletedAt: expect.any(Date),
        }));
        expect(result).toEqual({ domain: 'example.com' });
    });

    it('cascades soft delete to articles', async () => {
        await softDeleteDomain('test-uuid');
        expect(mockDb.update).toHaveBeenCalledWith(mockArticles);
    });
});

describe('softDeleteArticle', () => {
    beforeEach(() => {
        setupMocks();
        mockUpdateReturning.mockResolvedValue([{ id: 'article-1' }]);
    });

    it('returns true when article exists', async () => {
        const result = await softDeleteArticle('article-1');
        expect(result).toBe(true);
    });
});

describe('restoreDomain', () => {
    beforeEach(() => {
        setupMocks();
        // Setup select to find the record first
        mockSelectReturning.mockResolvedValueOnce([{ deletedAt: new Date(), domain: 'example.com' }]);
        // Setup update to return the restored record
        mockUpdateReturning.mockResolvedValue([{ domain: 'example.com' }]);
    });

    it('sets deletedAt to null on domain and cascades to articles', async () => {
        const result = await restoreDomain('test-uuid');
        expect(mockUpdateSet).toHaveBeenCalledWith({ deletedAt: null });
        expect(result).toEqual({ domain: 'example.com' });
    });

    it('returns null when domain not found', async () => {
        mockSelectReturning.mockResolvedValueOnce([]);
        const result = await restoreDomain('nonexistent');
        expect(result).toEqual({ domain: null });
    });
});

describe('restoreArticle', () => {
    beforeEach(() => {
        setupMocks();
        mockUpdateReturning.mockResolvedValue([{ id: 'article-1' }]);
    });

    it('returns true when article restored', async () => {
        const result = await restoreArticle('article-1');
        expect(result).toBe(true);
        expect(mockUpdateSet).toHaveBeenCalledWith({ deletedAt: null });
    });
});
