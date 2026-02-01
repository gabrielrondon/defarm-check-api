CREATE TABLE "mapa_organicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document" varchar(20) NOT NULL,
	"document_formatted" varchar(25),
	"type" varchar(10) NOT NULL,
	"producer_name" text NOT NULL,
	"entity_type" varchar(50),
	"entity_name" text,
	"country" varchar(100),
	"state" varchar(50),
	"city" varchar(255),
	"status" varchar(20) NOT NULL,
	"scope" text,
	"activities" text,
	"contact" varchar(255),
	"source" varchar(50) DEFAULT 'MAPA/CNPO',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_mapa_organicos_document ON mapa_organicos(document);
CREATE INDEX idx_mapa_organicos_status ON mapa_organicos(status);
CREATE INDEX idx_mapa_organicos_state ON mapa_organicos(state);
CREATE INDEX idx_mapa_organicos_entity_type ON mapa_organicos(entity_type);
