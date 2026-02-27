CREATE TABLE IF NOT EXISTS "ie_registry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ie" varchar(30) NOT NULL,
  "state" varchar(2) NOT NULL,
  "document" varchar(20),
  "document_type" varchar(10),
  "legal_name" text,
  "registration_status" varchar(50),
  "municipality" varchar(255),
  "source" varchar(100) DEFAULT 'SEFAZ/SINTEGRA',
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ie_registry_ie_unique" UNIQUE("ie")
);

CREATE INDEX IF NOT EXISTS "idx_ie_registry_document" ON "ie_registry" ("document");
CREATE INDEX IF NOT EXISTS "idx_ie_registry_state" ON "ie_registry" ("state");
