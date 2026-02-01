CREATE TABLE "queimadas_focos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"latitude" varchar(20) NOT NULL,
	"longitude" varchar(20) NOT NULL,
	"date_time" timestamp with time zone NOT NULL,
	"satellite" varchar(50),
	"municipality" varchar(255),
	"state" varchar(2),
	"biome" varchar(50),
	"frp" integer,
	"risk_level" varchar(20),
	"source" varchar(50) DEFAULT 'INPE',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add PostGIS geometry column for spatial queries
ALTER TABLE queimadas_focos ADD COLUMN geom geometry(POINT, 4326);

-- Create indexes for performance
CREATE INDEX idx_queimadas_focos_date_time ON queimadas_focos(date_time);
CREATE INDEX idx_queimadas_focos_state ON queimadas_focos(state);
CREATE INDEX idx_queimadas_focos_biome ON queimadas_focos(biome);
CREATE INDEX idx_queimadas_focos_satellite ON queimadas_focos(satellite);
CREATE INDEX idx_queimadas_focos_geom ON queimadas_focos USING GIST(geom);
