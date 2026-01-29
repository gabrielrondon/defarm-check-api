CREATE TABLE "car_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_number" varchar(50) NOT NULL,
	"status" varchar(50),
	"owner_document" varchar(20),
	"owner_name" text,
	"property_name" text,
	"area_ha" integer,
	"state" varchar(2) NOT NULL,
	"municipality" varchar(255),
	"source" varchar(50) DEFAULT 'SICAR',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "car_registrations_car_number_unique" UNIQUE("car_number")
);

-- Add PostGIS geometry column for spatial queries
ALTER TABLE "car_registrations" ADD COLUMN geometry geometry(MULTIPOLYGON, 4326);

-- Create spatial index for fast ST_Intersects queries
CREATE INDEX idx_car_registrations_geometry ON "car_registrations" USING GIST(geometry);

-- Create additional indexes for common queries
CREATE INDEX idx_car_registrations_car_number ON "car_registrations" (car_number);
CREATE INDEX idx_car_registrations_state ON "car_registrations" (state);
CREATE INDEX idx_car_registrations_status ON "car_registrations" (status);
CREATE INDEX idx_car_registrations_owner_document ON "car_registrations" (owner_document);
