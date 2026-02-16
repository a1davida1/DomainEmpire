-- Page Definitions: Block-based page composition for Template System v2
-- Each row defines a page (route) for a domain as an ordered sequence of typed blocks.

CREATE TABLE IF NOT EXISTS "page_definitions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "domain_id" uuid NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
    "route" text NOT NULL DEFAULT '/',
    "title" text,
    "meta_description" text,
    "theme" text NOT NULL DEFAULT 'clean',
    "skin" text NOT NULL DEFAULT 'slate',
    "blocks" jsonb NOT NULL DEFAULT '[]',
    "is_published" boolean NOT NULL DEFAULT false,
    "version" integer NOT NULL DEFAULT 1,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

-- Each domain can have at most one page definition per route
CREATE UNIQUE INDEX "page_def_domain_route_uidx" ON "page_definitions" ("domain_id", "route");
CREATE INDEX "page_def_domain_idx" ON "page_definitions" ("domain_id");
CREATE INDEX "page_def_published_idx" ON "page_definitions" ("is_published");

-- Add skin column to domains for default domain-level skin
ALTER TABLE "domains" ADD COLUMN IF NOT EXISTS "skin" text DEFAULT 'slate';
