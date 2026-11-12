CREATE TABLE IF NOT EXISTS "legal_acceptances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "document_version" text NOT NULL,
  "locale" text NOT NULL,
  "accepted_at" timestamptz NOT NULL DEFAULT now(),
  "ip" text,
  "user_agent" text
);
CREATE INDEX IF NOT EXISTS "legal_acceptances_user_idx" ON "legal_acceptances" ("user_id");
