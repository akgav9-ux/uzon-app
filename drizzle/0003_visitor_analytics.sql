CREATE TABLE IF NOT EXISTS "visitor_analytics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "visitor_id" text NOT NULL,
  "session_id" text NOT NULL,
  "user_id" uuid,
  "path" text NOT NULL,
  "source" text DEFAULT 'direct' NOT NULL,
  "referrer_host" text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "country_code" text,
  "device_type" text,
  "browser" text,
  "os" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "visitor_analytics_user_id_profiles_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "visitor_analytics_created_idx" ON "visitor_analytics" ("created_at");
CREATE INDEX IF NOT EXISTS "visitor_analytics_visitor_created_idx" ON "visitor_analytics" ("visitor_id", "created_at");
CREATE INDEX IF NOT EXISTS "visitor_analytics_source_created_idx" ON "visitor_analytics" ("source", "created_at");
CREATE INDEX IF NOT EXISTS "visitor_analytics_user_created_idx" ON "visitor_analytics" ("user_id", "created_at");
