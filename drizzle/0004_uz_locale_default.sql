UPDATE "user_settings" SET "locale" = 'uz' WHERE lower("locale") LIKE 'uz-%';
ALTER TABLE "user_settings" ALTER COLUMN "locale" SET DEFAULT 'uz';
