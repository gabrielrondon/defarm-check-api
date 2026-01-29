CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"rate_limit" integer DEFAULT 100 NOT NULL,
	"permissions" jsonb DEFAULT '["read"]'::jsonb,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE INDEX "idx_api_keys_key_hash" ON "api_keys" ("key_hash");
--> statement-breakpoint
CREATE INDEX "idx_api_keys_is_active" ON "api_keys" ("is_active");
