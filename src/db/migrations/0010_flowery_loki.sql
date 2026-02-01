CREATE TABLE "cgu_sancoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document" varchar(20) NOT NULL,
	"document_formatted" varchar(25),
	"type" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"sanction_type" varchar(10) NOT NULL,
	"category" varchar(100),
	"start_date" date,
	"end_date" date,
	"description" text,
	"sanctioning_organ" varchar(255),
	"process_number" varchar(100),
	"status" varchar(50),
	"federative_unit" varchar(2),
	"municipality" varchar(255),
	"source" varchar(50) DEFAULT 'CGU',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices para performance
CREATE INDEX idx_cgu_sancoes_document ON cgu_sancoes(document);
CREATE INDEX idx_cgu_sancoes_type ON cgu_sancoes(type);
CREATE INDEX idx_cgu_sancoes_sanction_type ON cgu_sancoes(sanction_type);
CREATE INDEX idx_cgu_sancoes_status ON cgu_sancoes(status);
