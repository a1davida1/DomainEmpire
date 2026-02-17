-- Enable pg_trgm extension for trigram-based fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for fast LIKE/ILIKE and similarity search
CREATE INDEX CONCURRENTLY IF NOT EXISTS domains_domain_trgm_idx ON domains USING gin (domain gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS domains_niche_trgm_idx ON domains USING gin (niche gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS domains_notes_trgm_idx ON domains USING gin (notes gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_title_trgm_idx ON articles USING gin (title gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_target_keyword_trgm_idx ON articles USING gin (target_keyword gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_slug_trgm_idx ON articles USING gin (slug gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS keywords_keyword_trgm_idx ON keywords USING gin (keyword gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS page_definitions_title_trgm_idx ON page_definitions USING gin (title gin_trgm_ops);
