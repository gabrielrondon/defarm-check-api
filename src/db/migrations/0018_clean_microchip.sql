-- Create DICOSE registrations table for Uruguay livestock/rural property registry
CREATE TABLE "dicose_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"establishment_id" varchar(50) NOT NULL,
	"producer_document" varchar(20),
	"producer_name" text,
	"year" integer NOT NULL,
	"area_ha" integer,
	"department" varchar(100) NOT NULL,
	"section" varchar(50),
	"activity" varchar(100),
	"livestock_count" jsonb,
	"land_use" jsonb,
	"declaration_status" varchar(50) DEFAULT 'DECLARED',
	"country" varchar(2) DEFAULT 'UY' NOT NULL,
	"source" varchar(50) DEFAULT 'DICOSE',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Create indexes for efficient queries
CREATE INDEX idx_dicose_establishment_id ON dicose_registrations(establishment_id);
--> statement-breakpoint
CREATE INDEX idx_dicose_producer_document ON dicose_registrations(producer_document);
--> statement-breakpoint
CREATE INDEX idx_dicose_department ON dicose_registrations(department);
--> statement-breakpoint
CREATE INDEX idx_dicose_year ON dicose_registrations(year);
--> statement-breakpoint
CREATE INDEX idx_dicose_producer_year ON dicose_registrations(producer_document, year);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_dicose_establishment_year ON dicose_registrations(establishment_id, year);
