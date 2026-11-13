UPDATE "user_settings" SET "locale" = 'uz-Latn' WHERE lower("locale") LIKE 'uz-%' OR lower("locale") = 'uz';
ALTER TABLE "user_settings" ALTER COLUMN "locale" SET DEFAULT 'uz-Latn';
