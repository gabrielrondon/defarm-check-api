CREATE TABLE "check_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_type" varchar(50) NOT NULL,
	"input_value" varchar(255) NOT NULL,
	"input_normalized" varchar(255),
	"verdict" varchar(50),
	"score" integer,
	"sources_checked" jsonb,
	"results" jsonb,
	"summary" jsonb,
	"metadata" jsonb,
	"processing_time_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "checker_cache_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checker_name" varchar(100) NOT NULL,
	"date" date NOT NULL,
	"total_requests" integer DEFAULT 0,
	"cache_hits" integer DEFAULT 0,
	"cache_misses" integer DEFAULT 0,
	"avg_execution_time_ms" integer
);
--> statement-breakpoint
CREATE TABLE "checker_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"data_source_url" varchar(500),
	"last_updated" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 5,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checker_sources_name_unique" UNIQUE("name")
);
