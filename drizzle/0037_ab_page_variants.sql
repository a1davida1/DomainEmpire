-- A/B page composition variants: split block sequences per page definition
CREATE TABLE "page_variants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "page_id" uuid NOT NULL REFERENCES "page_definitions"("id") ON DELETE CASCADE,
    "variant_key" text NOT NULL DEFAULT 'control',
    "weight" integer NOT NULL DEFAULT 50,
    "blocks" jsonb NOT NULL DEFAULT '[]',
    "is_active" boolean NOT NULL DEFAULT true,
    "impressions" integer NOT NULL DEFAULT 0,
    "conversions" integer NOT NULL DEFAULT 0,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    UNIQUE("page_id", "variant_key")
);

CREATE INDEX "page_variant_page_idx" ON "page_variants" ("page_id");
CREATE INDEX "page_variant_active_idx" ON "page_variants" ("is_active");
