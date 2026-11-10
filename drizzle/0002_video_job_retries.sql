ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "video_jobs" SET "attempts" = 0 WHERE "attempts" IS NULL;
