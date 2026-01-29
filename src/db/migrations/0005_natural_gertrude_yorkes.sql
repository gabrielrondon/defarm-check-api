-- Adicionar coluna como nullable primeiro
ALTER TABLE "api_keys" ADD COLUMN "key_prefix" varchar(16);
--> statement-breakpoint
-- Popular valores existentes (se houver)
UPDATE "api_keys" SET "key_prefix" = 'temp_' || substring(id::text from 1 for 8) WHERE "key_prefix" IS NULL;
--> statement-breakpoint
-- Tornar NOT NULL
ALTER TABLE "api_keys" ALTER COLUMN "key_prefix" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "idx_api_keys_key_prefix" ON "api_keys" ("key_prefix");