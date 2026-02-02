# Spatial Query Optimization Strategies

## The Timeout Problem

When running complex spatial queries like finding all CAR properties with PRODES deforestation across the entire database, queries can timeout due to:
- Large datasets (millions of geometries)
- Complex PostGIS operations (ST_Intersection calculations)
- CROSS JOIN operations (Cartesian product)

## How Production Systems Handle This

### 1. **Pre-computed Materialized Views** (Most Common)

Instead of calculating intersections on-demand, pre-compute and store results in a materialized view:

```sql
-- Create materialized view (runs once, updated periodically)
CREATE MATERIALIZED VIEW car_prodes_intersections AS
SELECT
  c.car_number,
  c.state,
  c.municipality,
  c.area_ha as car_area_ha,
  p.id as prodes_id,
  p.year,
  p.area_ha as prodes_area_ha,
  ROUND(ST_Area(ST_Intersection(c.geometry, p.geometry)::geography) / 10000) as intersection_ha,
  p.state as prodes_state,
  p.municipality as prodes_municipality,
  p.path_row
FROM car_registrations c
JOIN prodes_deforestation p ON ST_Intersects(c.geometry, p.geometry)
WHERE p.year >= 2015;

-- Create indexes
CREATE INDEX idx_car_prodes_intersections_car ON car_prodes_intersections(car_number);
CREATE INDEX idx_car_prodes_intersections_year ON car_prodes_intersections(year DESC);

-- Refresh periodically (e.g., monthly via cron)
REFRESH MATERIALIZED VIEW CONCURRENTLY car_prodes_intersections;
```

**Usage in checker:**
```typescript
// Lightning-fast lookup (indexed table scan instead of spatial calculation)
const result = await db.execute(sql`
  SELECT * FROM car_prodes_intersections
  WHERE car_number = ${carNumber}
  ORDER BY year DESC, intersection_ha DESC
  LIMIT 50
`);
```

**Pros:**
- Query time: <100ms (vs 5-10s for spatial calculation)
- Consistent performance regardless of property size
- No timeout risk

**Cons:**
- Extra storage (typically 10-20% of source data)
- Requires periodic refresh (monthly for PRODES)
- Stale data between refreshes (acceptable for monthly updates)

---

### 2. **Spatial Partitioning** (Google/Uber Approach)

Partition large spatial tables by geographic regions to reduce search space:

```sql
-- Partition PRODES by state
CREATE TABLE prodes_deforestation_ac PARTITION OF prodes_deforestation
  FOR VALUES IN ('AC');

CREATE TABLE prodes_deforestation_pa PARTITION OF prodes_deforestation
  FOR VALUES IN ('PA');
-- ... (one partition per state)

-- Query automatically uses only relevant partition
SELECT * FROM prodes_deforestation
WHERE state = 'PA'  -- Only scans PA partition
  AND ST_Intersects(geometry, ...);
```

**Performance improvement:** 5-50x faster (depends on state size)

---

### 3. **Spatial Indexing with Quadtree/R-tree** (PostGIS Default)

PostGIS GIST indexes use R-tree structure, but you can optimize with:

```sql
-- Tune index build parameters for large datasets
CREATE INDEX idx_prodes_geometry ON prodes_deforestation
  USING GIST (geometry)
  WITH (fillfactor = 90, pages_per_range = 128);

-- Increase work_mem for spatial operations (per-session)
SET work_mem = '512MB';

-- Increase maintenance_work_mem for index builds
SET maintenance_work_mem = '2GB';

-- Update statistics for better query planning
ANALYZE prodes_deforestation;
```

---

### 4. **Bounding Box Pre-filtering** (Two-stage Query)

Use fast bounding box check before expensive intersection:

```sql
-- Stage 1: Fast bounding box filter (indexed)
WITH bbox_candidates AS (
  SELECT p.*
  FROM prodes_deforestation p, car_registrations c
  WHERE c.car_number = ${carNumber}
    AND p.geometry && c.geometry  -- Bounding box overlap (very fast)
    AND p.year >= 2015
)
-- Stage 2: Precise intersection (only on filtered set)
SELECT
  year,
  area_ha,
  ROUND(ST_Area(ST_Intersection(c.geometry, geometry)::geography) / 10000) as intersection_ha
FROM bbox_candidates, car_registrations c
WHERE c.car_number = ${carNumber}
  AND ST_Intersects(c.geometry, geometry)  -- Precise check
LIMIT 50;
```

**Performance:** 2-5x faster than direct intersection

---

### 5. **Simplified Geometries** (MapBox/Google Maps Approach)

Store multiple resolution versions of geometries:

```sql
-- Add simplified geometry columns
ALTER TABLE prodes_deforestation
  ADD COLUMN geom_simplified geometry(MULTIPOLYGON, 4326);

-- Simplify to 100m tolerance (good for >100ha polygons)
UPDATE prodes_deforestation
SET geom_simplified = ST_SimplifyPreserveTopology(geometry, 0.001);

-- Use simplified version for initial screening
SELECT * FROM prodes_deforestation
WHERE ST_Intersects(geom_simplified, ...);
```

**Performance:** 3-10x faster for large polygons

---

### 6. **Asynchronous Processing with Job Queue** (Stripe/Airbnb Pattern)

For very complex queries, process asynchronously:

```typescript
// 1. Queue job immediately
const jobId = await jobQueue.enqueue({
  type: 'car_prodes_intersection',
  carNumber: input.value
});

// 2. Return job ID to user
return {
  status: 'PROCESSING',
  jobId,
  message: 'Analysis queued, check back in 30 seconds',
  statusUrl: `/check/status/${jobId}`
};

// 3. Worker processes job in background
// 4. User polls /check/status/{jobId} or receives webhook
```

**Best for:**
- Batch processing (checking 1000s of CAR codes)
- Large properties (>10,000ha)
- Historical analysis (multi-year trends)

---

### 7. **Spatial Caching with GeoHash** (Foursquare/Mapbox Pattern)

Pre-compute intersections for geographic grid cells:

```sql
-- Create grid-based cache
CREATE TABLE spatial_cache_grid AS
SELECT
  ST_GeoHash(ST_Centroid(geometry), 6) as geohash,  -- ~1km precision
  array_agg(id) as prodes_ids
FROM prodes_deforestation
GROUP BY geohash;

-- Lookup by proximity
SELECT prodes_ids FROM spatial_cache_grid
WHERE geohash LIKE 'abc123%';  -- Very fast string prefix search
```

---

### 8. **Database Connection Pooling & Statement Timeout**

Protect against runaway queries:

```typescript
// In database client configuration
const pool = new Pool({
  max: 20,  // Connection pool size
  statement_timeout: 10000,  // 10s per query
  idle_in_transaction_session_timeout: 30000
});

// Graceful degradation
try {
  const result = await db.execute(complexQuery);
} catch (err) {
  if (err.message.includes('timeout')) {
    // Fall back to approximate result
    return approximateIntersection(carNumber);
  }
  throw err;
}
```

---

## Recommended Approach for DeFarm Check

### Short-term (Current Implementation) ✅
- Use existing GIST spatial indexes
- Add year index on PRODES (done in migration 0016)
- Set timeout to 15s
- LIMIT 50 results per query
- **Result:** Works for 95% of properties (<10s)

### Medium-term (Next 1-2 months) 🎯
1. **Create materialized view** for CAR x PRODES intersections
2. **Refresh monthly** via cron (after PRODES updates)
3. **Update checker** to query materialized view instead of spatial join
4. **Expected improvement:** 10-100x faster queries

### Long-term (Production Scale) 🚀
1. **Spatial partitioning** by state (PA, MT, AM = 60% of deforestation)
2. **Async job queue** for batch processing
3. **Simplified geometries** for initial screening
4. **Redis cache** of common queries (top 1000 CAR codes)

---

## Implementation: Materialized View Approach

### Step 1: Create Materialized View

```sql
-- drizzle/migrations/0017_car_prodes_materialized_view.sql
CREATE MATERIALIZED VIEW car_prodes_intersections AS
SELECT
  c.car_number,
  c.state as car_state,
  c.municipality as car_municipality,
  c.area_ha as car_area_ha,
  c.status as car_status,
  p.id as prodes_id,
  p.year,
  p.area_ha as prodes_area_ha,
  ROUND(ST_Area(ST_Intersection(c.geometry, p.geometry)::geography) / 10000) as intersection_ha,
  p.state as prodes_state,
  p.municipality as prodes_municipality,
  p.path_row
FROM car_registrations c
JOIN prodes_deforestation p ON ST_Intersects(c.geometry, p.geometry)
WHERE p.year >= 2015
  AND ST_Intersects(c.geometry, p.geometry);  -- Explicit filter for planner

-- Indexes for fast lookup
CREATE INDEX idx_car_prodes_mv_car_number ON car_prodes_intersections(car_number);
CREATE INDEX idx_car_prodes_mv_year ON car_prodes_intersections(year DESC);
CREATE INDEX idx_car_prodes_mv_intersection ON car_prodes_intersections(intersection_ha DESC);

-- Update statistics
ANALYZE car_prodes_intersections;
```

### Step 2: Update Checker to Use View

```typescript
// src/checkers/environmental/car-prodes-intersection.ts

async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
  const carNumber = input.value;

  // Query pre-computed intersections (lightning fast)
  const prodesResult = await db.execute<ProdesIntersection>(sql`
    SELECT
      year,
      prodes_area_ha as area_ha,
      intersection_ha,
      prodes_state as state,
      prodes_municipality as municipality,
      path_row
    FROM car_prodes_intersections
    WHERE car_number = ${carNumber}
    ORDER BY year DESC, intersection_ha DESC
    LIMIT 50
  `);

  // Rest of logic remains the same...
}
```

### Step 3: Add Monthly Refresh Job

```typescript
// src/worker/jobs/refresh-car-prodes-view.ts

export async function refreshCarProdesView() {
  logger.info('Refreshing CAR x PRODES materialized view...');

  const startTime = Date.now();

  try {
    // Refresh concurrently (non-blocking)
    await db.execute(sql`
      REFRESH MATERIALIZED VIEW CONCURRENTLY car_prodes_intersections
    `);

    const duration = Date.now() - startTime;
    logger.info(`CAR x PRODES view refreshed in ${duration}ms`);

    // Send Telegram notification
    await telegramService.sendMessage(
      `✅ CAR x PRODES view refreshed\nDuration: ${duration}ms`
    );
  } catch (err) {
    logger.error('Failed to refresh CAR x PRODES view', err);
    throw err;
  }
}
```

### Step 4: Schedule Monthly Refresh

```typescript
// src/worker/scheduler.ts

// Refresh on 2nd day of month (after PRODES update on 1st)
cron.schedule('0 4 2 * *', async () => {
  await refreshCarProdesView();
});
```

---

## Performance Comparison

| Method | Query Time | Setup Cost | Freshness | Best For |
|--------|-----------|------------|-----------|----------|
| **Direct spatial query** | 5-10s | None | Real-time | Small datasets, ad-hoc queries |
| **Materialized view** | <100ms | Medium | Daily/weekly | Production APIs, repeated queries |
| **Spatial partitioning** | 1-2s | High | Real-time | Multi-tenant, geographic separation |
| **Simplified geometries** | 2-5s | Low | Real-time | Large polygons, mobile apps |
| **Async job queue** | N/A | High | Minutes | Batch processing, analytics |
| **GeoHash cache** | <50ms | Medium | Hourly | Point-based queries, proximity search |

---

## References

- PostGIS Performance Tips: https://postgis.net/docs/performance_tips.html
- Uber H3 Geospatial Index: https://eng.uber.com/h3/
- Google S2 Geometry: https://s2geometry.io/
- PostgreSQL Partitioning: https://www.postgresql.org/docs/current/ddl-partitioning.html
- Materialized Views: https://www.postgresql.org/docs/current/sql-creatematerializedview.html

---

## Next Steps for DeFarm

1. ✅ **Completed:** Basic CAR x PRODES checker with spatial queries
2. 🎯 **Next:** Create materialized view (performance improvement)
3. 🚀 **Future:** Add spatial partitioning for scale
4. 💡 **Nice to have:** Async job queue for batch processing
