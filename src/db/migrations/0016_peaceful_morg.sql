-- Multi-country support: Add country column to all document-based tables
-- This allows the same document number to exist in different countries

ALTER TABLE "lista_suja" DROP CONSTRAINT "lista_suja_document_unique";--> statement-breakpoint
ALTER TABLE "mapa_organicos" ALTER COLUMN "country" SET DATA TYPE varchar(2);--> statement-breakpoint
ALTER TABLE "mapa_organicos" ALTER COLUMN "country" SET DEFAULT 'BR';--> statement-breakpoint
ALTER TABLE "mapa_organicos" ALTER COLUMN "country" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cgu_sancoes" ADD COLUMN "country" varchar(2) DEFAULT 'BR' NOT NULL;--> statement-breakpoint
ALTER TABLE "check_requests" ADD COLUMN "country" varchar(2) DEFAULT 'BR' NOT NULL;--> statement-breakpoint
ALTER TABLE "ibama_embargoes" ADD COLUMN "country" varchar(2) DEFAULT 'BR' NOT NULL;--> statement-breakpoint
ALTER TABLE "lista_suja" ADD COLUMN "country" varchar(2) DEFAULT 'BR' NOT NULL;--> statement-breakpoint
ALTER TABLE "mapa_organicos" ADD COLUMN "country_name" varchar(100);--> statement-breakpoint

-- Create composite unique indexes for document + country
CREATE UNIQUE INDEX idx_lista_suja_document_country ON lista_suja(document, country);--> statement-breakpoint
CREATE INDEX idx_ibama_embargoes_document_country ON ibama_embargoes(document, country);--> statement-breakpoint
CREATE INDEX idx_cgu_sancoes_document_country ON cgu_sancoes(document, country);--> statement-breakpoint
CREATE INDEX idx_mapa_organicos_document_country ON mapa_organicos(document, country);--> statement-breakpoint

-- Create index for check_requests by country
CREATE INDEX idx_check_requests_country ON check_requests(country);--> statement-breakpoint
CREATE INDEX idx_check_requests_input_country ON check_requests(input_type, country);