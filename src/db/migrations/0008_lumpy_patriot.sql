CREATE TABLE "unidades_conservacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100),
	"group" varchar(50),
	"area_ha" integer,
	"state" varchar(2),
	"municipality" varchar(255),
	"sphere" varchar(50),
	"source" varchar(50) DEFAULT 'ICMBio',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add PostGIS geometry column for spatial queries
ALTER TABLE "unidades_conservacao" ADD COLUMN geometry geometry(MULTIPOLYGON, 4326);

-- Create spatial index for fast ST_Intersects queries
CREATE INDEX idx_unidades_conservacao_geometry ON "unidades_conservacao" USING GIST(geometry);

-- Create additional indexes for common queries
CREATE INDEX idx_unidades_conservacao_name ON "unidades_conservacao" (name);
CREATE INDEX idx_unidades_conservacao_state ON "unidades_conservacao" (state);
CREATE INDEX idx_unidades_conservacao_group ON "unidades_conservacao" ("group");
CREATE INDEX idx_unidades_conservacao_category ON "unidades_conservacao" (category);
