# CAR x PRODES Intersection Checker

## Overview

The CAR x PRODES Intersection Checker verifies if a CAR-registered property has PRODES deforestation within its boundaries using PostGIS spatial intersection queries.

**Status:** ✅ Implemented (February 2026)

## Implementation

### Files Created

1. **`src/checkers/environmental/car-prodes-intersection.ts`** - Main checker class (303 lines)
2. **`src/db/migrations/0016_add_prodes_year_index.sql`** - Performance index on PRODES year
3. **`scripts/test-car-prodes-query.ts`** - Test script for query performance

### Files Modified

1. **`src/checkers/index.ts`** - Added import and registration (2 lines)

## How It Works

### Input
- **Type:** CAR number (e.g., `BA-2909703-F05433B5497742CB8FB37AE31C2C4463`)
- **Source:** SICAR CAR registration code

### Query Pattern

```sql
SELECT
  p.year,
  p.area_ha,
  ROUND(ST_Area(ST_Intersection(c.geometry, p.geometry)::geography) / 10000) AS intersection_ha,
  p.state,
  p.municipality,
  p.path_row
FROM car_registrations c
CROSS JOIN prodes_deforestation p
WHERE c.car_number = ${carNumber}
  AND p.year >= 2015
  AND ST_Intersects(c.geometry, p.geometry)
ORDER BY p.year DESC, intersection_ha DESC
LIMIT 50
```

**Key Features:**
- `ST_Intersects(c.geometry, p.geometry)` - Fast indexed check for overlap
- `ST_Intersection(...))` - Precise area calculation of overlapping region
- `p.year >= 2015` - Filters to last 10 years (uses new index)
- `LIMIT 50` - Prevents timeout on very large properties

### Output

#### PASS (No Deforestation)
```json
{
  "status": "PASS",
  "message": "No PRODES deforestation detected in CAR property (2015-2024)",
  "details": {
    "car_number": "PA-1234567-...",
    "car_status": "AT",
    "car_area_ha": 450,
    "checked_years": "2015-2024",
    "deforestation_found": false
  },
  "executionTimeMs": 396,
  "cached": false
}
```

#### FAIL (Deforestation Detected)
```json
{
  "status": "FAIL",
  "severity": "CRITICAL",
  "message": "Deforestation detected: 156ha in 5 polygon(s) (recent: 2024)",
  "details": {
    "car_number": "BA-2909703-...",
    "summary": {
      "total_polygons": 5,
      "total_deforested_ha": 156,
      "deforested_percentage": 12,
      "newest_year": 2024,
      "oldest_year": 2020,
      "recent_deforestation_ha": 120,
      "recent_deforestation_count": 3
    },
    "deforestation_by_year": {
      "2024": 2,
      "2022": 1,
      "2020": 2
    },
    "top_polygons": [
      {
        "year": 2024,
        "intersection_ha": 85,
        "municipality": "Altamira",
        "state": "PA",
        "path_row": "227/063"
      }
    ]
  },
  "executionTimeMs": 1250
}
```

## Severity Calculation

| Severity | Conditions |
|----------|-----------|
| **CRITICAL** | Recent deforestation (last 2 years) OR large area (≥100ha) |
| **HIGH** | Recent (last 5 years) OR medium area (≥25ha) OR many polygons (≥5) |
| **MEDIUM** | Older deforestation and small area |

## Performance

### Query Performance
- **Small properties** (<100ha): <2 seconds
- **Medium properties** (100-1000ha): 2-5 seconds
- **Large properties** (>1000ha): 5-10 seconds
- **Timeout threshold:** 15 seconds

### Database Optimization
- **Spatial indexes:** GIST indexes on both `car_registrations.geometry` and `prodes_deforestation.geometry`
- **Year index:** B-tree index on `prodes_deforestation.year DESC` (added in migration 0016)
- **Query planner:** ANALYZE run on both tables after migration

### Sample Query Performance
```
Planning Time: 16.816 ms
Execution Time: 1.014 ms (with index scan)
Total API Response: 396ms (including network, cache lookup, result formatting)
```

## Configuration

```typescript
readonly config: CheckerConfig = {
  enabled: true,
  cacheTTL: 1209600, // 14 days (PRODES updates monthly)
  timeout: 15000     // 15 seconds
};

readonly metadata: CheckerMetadata = {
  priority: 10,  // Highest priority for environmental checkers
  supportedInputTypes: [InputType.CAR]
};
```

## Testing

### Test Query Performance
```bash
npm run test:car-prodes
# or
npx tsx scripts/test-car-prodes-query.ts
```

### Test API Endpoint
```bash
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "CAR",
      "value": "BA-2909703-F05433B5497742CB8FB37AE31C2C4463"
    }
  }'
```

## Data Sources

| Source | Provider | Records | Coverage |
|--------|----------|---------|----------|
| **CAR** | SICAR | 3.5M+ | 20/27 Brazilian states (partial) |
| **PRODES** | INPE | 216K | 6 biomes (2015-2024) |

## Known Limitations

1. **Spatial Coverage:** CAR and PRODES data may not overlap in all regions
2. **Large Properties:** Very large properties (>10,000ha) may approach timeout limit
3. **Data Freshness:** PRODES updates monthly, cache is 14 days
4. **Polygon Limit:** Returns top 50 deforestation polygons (performance trade-off)

## Future Enhancements

1. **Add DETER integration:** Real-time alerts (faster updates than PRODES)
2. **Property subdivision analysis:** Detect if deforestation is concentrated in specific areas
3. **Temporal analysis:** Track deforestation progression over time
4. **CAR status correlation:** Cross-reference with CAR compliance status
5. **Recovery area detection:** Identify if deforestation has been recovered

## Related Checkers

- **MapBiomas Alerta Checker** - Validated deforestation (also supports CAR input)
- **PRODES Deforestation Checker** - Coordinates-based deforestation check
- **DETER Alerts Checker** - Real-time deforestation alerts
- **CAR Checker** - CAR registration status and validity

## References

- INPE PRODES: http://terrabrasilis.dpi.inpe.br/
- SICAR CAR: https://consultapublica.car.gov.br/
- PostGIS Documentation: https://postgis.net/docs/

## Deployment

Deployed to Railway production on commit `5c6dd9d`:
- ✅ Migration applied automatically
- ✅ Index created on `prodes_deforestation.year`
- ✅ Checker registered in registry
- ✅ API endpoint tested successfully

**Production URL:** https://defarm-check-api-production.up.railway.app/check
