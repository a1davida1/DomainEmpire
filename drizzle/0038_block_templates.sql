-- Cross-domain block sharing: reusable block templates
CREATE TABLE "block_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "description" text,
    "block_type" text NOT NULL,
    "variant" text,
    "config" jsonb NOT NULL DEFAULT '{}',
    "content" jsonb NOT NULL DEFAULT '{}',
    "tags" text[] NOT NULL DEFAULT '{}',
    "source_domain_id" uuid REFERENCES "domains"("id") ON DELETE SET NULL,
    "source_block_id" text,
    "usage_count" integer NOT NULL DEFAULT 0,
    "is_global" boolean NOT NULL DEFAULT false,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now()
);

CREATE INDEX "block_tpl_type_idx" ON "block_templates" ("block_type");
CREATE INDEX "block_tpl_tags_idx" ON "block_templates" USING gin ("tags");
CREATE INDEX "block_tpl_global_idx" ON "block_templates" ("is_global");
