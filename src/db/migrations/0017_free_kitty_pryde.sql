-- Create SNAP protected areas table for Uruguay
CREATE TABLE "snap_areas_uruguay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(100),
	"area_ha" integer,
	"department" varchar(100),
	"municipality" varchar(255),
	"legal_status" varchar(100),
	"established_date" date,
	"country" varchar(2) DEFAULT 'UY' NOT NULL,
	"source" varchar(50) DEFAULT 'SNAP',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add PostGIS geometry column for SNAP areas
ALTER TABLE "snap_areas_uruguay" ADD COLUMN geometry geometry(MULTIPOLYGON, 4326);
--> statement-breakpoint
CREATE INDEX idx_snap_areas_uruguay_geom ON snap_areas_uruguay USING GIST (geometry);
--> statement-breakpoint
CREATE INDEX idx_snap_areas_uruguay_name ON snap_areas_uruguay(name);
--> statement-breakpoint
CREATE INDEX idx_snap_areas_uruguay_department ON snap_areas_uruguay(department);
--> statement-breakpoint

-- Add country column to existing conservation units table
ALTER TABLE "unidades_conservacao" ADD COLUMN "country" varchar(2) DEFAULT 'BR' NOT NULL;