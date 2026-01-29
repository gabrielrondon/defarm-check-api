CREATE TABLE "terras_indigenas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"etnia" varchar(100),
	"phase" varchar(50),
	"area_ha" integer,
	"state" varchar(2),
	"municipality" varchar(255),
	"modalidade" varchar(50),
	"source" varchar(50) DEFAULT 'FUNAI',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Adicionar coluna de geometria (PostGIS)
ALTER TABLE "terras_indigenas" ADD COLUMN geometry geometry(MULTIPOLYGON, 4326);

-- Criar índice espacial GIST para queries rápidas
CREATE INDEX idx_terras_indigenas_geometry ON "terras_indigenas" USING GIST(geometry);

-- Criar índices adicionais
CREATE INDEX idx_terras_indigenas_name ON "terras_indigenas"(name);
CREATE INDEX idx_terras_indigenas_state ON "terras_indigenas"(state);
CREATE INDEX idx_terras_indigenas_phase ON "terras_indigenas"(phase);
