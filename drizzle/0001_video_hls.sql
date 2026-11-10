ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "hls_key" text;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "quality_levels" jsonb DEFAULT '[]'::jsonb NOT NULL;
