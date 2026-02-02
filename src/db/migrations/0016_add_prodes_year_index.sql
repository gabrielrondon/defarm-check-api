-- Add performance index on PRODES year column for faster CAR x PRODES intersection queries
-- This index speeds up the "WHERE p.year >= 2015" filter in spatial queries

CREATE INDEX IF NOT EXISTS idx_prodes_deforestation_year
ON prodes_deforestation(year DESC);

-- Update table statistics for query planner optimization
ANALYZE prodes_deforestation;
ANALYZE car_registrations;
