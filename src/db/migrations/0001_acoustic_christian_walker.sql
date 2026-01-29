CREATE TABLE "prodes_deforestation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"area_ha" integer NOT NULL,
	"state" varchar(2),
	"municipality" varchar(255),
	"path_row" varchar(10),
	"source" varchar(50) DEFAULT 'PRODES',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Adicionar coluna de geometria (PostGIS)
ALTER TABLE "prodes_deforestation"
ADD COLUMN geometry geometry(MULTIPOLYGON, 4326);

-- Criar índice espacial GIST para performance
CREATE INDEX idx_prodes_deforestation_geometry
ON "prodes_deforestation" USING GIST(geometry);
