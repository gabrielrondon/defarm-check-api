CREATE TABLE "mapbiomas_alerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_code" varchar(50) NOT NULL,
	"area_ha" integer NOT NULL,
	"detected_at" date NOT NULL,
	"published_at" date NOT NULL,
	"state" varchar(2),
	"municipality" varchar(255),
	"biome" varchar(50),
	"deforestation_class" varchar(100),
	"deforestation_speed" varchar(20),
	"source" varchar(50),
	"status_name" varchar(50) DEFAULT 'published',
	"indigenous_land" boolean DEFAULT false,
	"conservation_unit" boolean DEFAULT false,
	"embargoed_area" boolean DEFAULT false,
	"authorized_area" boolean DEFAULT false,
	"car_codes" jsonb,
	"car_intersection_count" integer DEFAULT 0,
	"source_data" varchar(50) DEFAULT 'MapBiomas Alerta',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mapbiomas_alerta_alert_code_unique" UNIQUE("alert_code")
);

-- Add PostGIS geometry column for spatial queries
ALTER TABLE mapbiomas_alerta ADD COLUMN geom geometry(MULTIPOLYGON, 4326);

-- Create indexes for performance
CREATE INDEX idx_mapbiomas_alerta_alert_code ON mapbiomas_alerta(alert_code);
CREATE INDEX idx_mapbiomas_alerta_detected_at ON mapbiomas_alerta(detected_at);
CREATE INDEX idx_mapbiomas_alerta_published_at ON mapbiomas_alerta(published_at);
CREATE INDEX idx_mapbiomas_alerta_state ON mapbiomas_alerta(state);
CREATE INDEX idx_mapbiomas_alerta_biome ON mapbiomas_alerta(biome);
CREATE INDEX idx_mapbiomas_alerta_deforestation_class ON mapbiomas_alerta(deforestation_class);
CREATE INDEX idx_mapbiomas_alerta_embargoed_area ON mapbiomas_alerta(embargoed_area);

-- Create spatial index for geom column (GIST)
CREATE INDEX idx_mapbiomas_alerta_geom ON mapbiomas_alerta USING GIST (geom);
