CREATE TABLE "ibama_embargoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document" varchar(20) NOT NULL,
	"document_formatted" varchar(25),
	"type" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"embargo_count" integer NOT NULL,
	"total_area_ha" integer NOT NULL,
	"embargos" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lista_suja" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document" varchar(20) NOT NULL,
	"document_formatted" varchar(25),
	"type" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"state" varchar(2),
	"address" text,
	"workers_affected" integer,
	"cnae" varchar(20),
	"inclusion_date" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lista_suja_document_unique" UNIQUE("document")
);
--> statement-breakpoint
CREATE INDEX "idx_lista_suja_document" ON "lista_suja" ("document");
--> statement-breakpoint
CREATE INDEX "idx_lista_suja_type" ON "lista_suja" ("type");
--> statement-breakpoint
CREATE INDEX "idx_ibama_embargoes_document" ON "ibama_embargoes" ("document");
--> statement-breakpoint
CREATE INDEX "idx_ibama_embargoes_type" ON "ibama_embargoes" ("type");
