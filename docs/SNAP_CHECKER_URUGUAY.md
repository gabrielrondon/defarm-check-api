# SNAP Protected Areas Checker - Uruguay

**Status:** ✅ Implemented
**Priority:** HIGH
**Last Updated:** 2026-02-16

## Overview

The SNAP (Sistema Nacional de Áreas Protegidas) checker verifies if coordinates fall within protected areas in Uruguay. This is critical for environmental compliance as activities in protected areas require special authorization.

## Data Source

- **Provider:** Ministerio de Ambiente - DINABISE (Uruguay)
- **URL:** https://www.ambiente.gub.uy/snap
- **Metadata:** https://www.ambiente.gub.uy/metadatos/index.php/metadata/md_iframe/18
- **Coverage:** 22 protected areas (367,683 hectares / 1.16% of territory)
- **Last Update:** August 2025
- **Legal Framework:** Ley 17.234 (2000)

## Protected Area Categories

1. **Parque Nacional** (National Park)
2. **Monumento Natural** (Natural Monument)
3. **Área de Manejo de Habitat y/o Especie** (Species/Habitat Management Area)
4. **Paisaje Protegido** (Protected Landscape)
5. **Área Protegida con Recursos Manejados** (Protected Area with Managed Resources)

## Checker Implementation

### Files Created

```
src/
├── checkers/
│   └── uruguay/
│       └── snap-protected-areas.ts  # Checker implementation
├── db/
│   ├── schema.ts                     # Added snapAreasUruguay table
│   └── migrations/
│       └── 0017_free_kitty_pryde.sql # Migration with PostGIS
scripts/
├── download-snap-areas.ts            # Download/validation script
└── seed-snap-areas.ts                # Seed script
```

### Database Schema

```sql
CREATE TABLE snap_areas_uruguay (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  area_ha INTEGER,
  department VARCHAR(100),      -- Uruguay uses "departamentos" (like states)
  municipality VARCHAR(255),
  legal_status VARCHAR(100),
  established_date DATE,
  country VARCHAR(2) DEFAULT 'UY' NOT NULL,
  source VARCHAR(50) DEFAULT 'SNAP',
  geometry geometry(MULTIPOLYGON, 4326),  -- PostGIS
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_snap_areas_uruguay_geom ON snap_areas_uruguay USING GIST (geometry);
CREATE INDEX idx_snap_areas_uruguay_name ON snap_areas_uruguay(name);
CREATE INDEX idx_snap_areas_uruguay_department ON snap_areas_uruguay(department);
```

### Checker Configuration

```typescript
metadata: {
  name: 'SNAP Protected Areas',
  category: CheckerCategory.ENVIRONMENTAL,
  description: 'Verifica se coordenadas sobrepõem áreas protegidas do SNAP (Uruguay)',
  priority: 8,
  supportedInputTypes: [InputType.COORDINATES, InputType.ADDRESS],
  supportedCountries: [Country.URUGUAY]
}

config: {
  enabled: true,
  cacheTTL: 2592000,  // 30 days (protected areas change infrequently)
  timeout: 5000       // 5 seconds
}
```

### Query Logic

```sql
SELECT name, category, area_ha, department, municipality, legal_status
FROM snap_areas_uruguay
WHERE ST_Intersects(
  geometry,
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
)
LIMIT 1;
```

## Coordinate Validation

Uruguay bounds (approximate):
- **Latitude:** -35.8° (south) to -30.0° (north)
- **Longitude:** -58.6° (west) to -53.0° (east)

Invalid coordinates outside these bounds will throw an error before querying the database.

## Check Results

### FAIL (Overlap Detected)

```json
{
  "status": "FAIL",
  "severity": "HIGH",
  "message": "Coordinates fall within SNAP protected area: Parque Nacional Santa Teresa",
  "details": {
    "areaName": "Parque Nacional Santa Teresa",
    "category": "Parque Nacional",
    "areaHa": 1100,
    "department": "Rocha",
    "municipality": "La Paloma",
    "legalStatus": "Homologada",
    "establishedDate": "2005-08-10",
    "coordinates": { "lat": -34.0, "lon": -53.5 },
    "source": "SNAP - Sistema Nacional de Áreas Protegidas",
    "recommendation": "HIGH RISK: Property/activity overlaps with protected area...",
    "legalFramework": "Ley 17.234 (2000)",
    "regulatoryBody": "DINABISE - Ministerio de Ambiente"
  },
  "evidence": {
    "dataSource": "SNAP (Uruguay)",
    "url": "https://www.ambiente.gub.uy/snap",
    "lastUpdate": "2025-08"
  }
}
```

### PASS (No Overlap)

```json
{
  "status": "PASS",
  "message": "Coordinates do not overlap with any SNAP protected area",
  "details": {
    "coordinates": { "lat": -34.9, "lon": -56.2 },
    "totalAreasChecked": 22,
    "source": "SNAP - Sistema Nacional de Áreas Protegidas"
  }
}
```

## Usage

### 1. Download SNAP Data (Manual)

```bash
# SNAP data must be downloaded manually (Shapefile format)
# Visit: https://www.ambiente.gub.uy/metadatos/index.php/metadata/md_iframe/18
# Download Shapefile and convert to GeoJSON:

ogr2ogr -f GeoJSON data/uruguay/snap_areas.json snap_areas.shp

# Validate data
npm run data:snap-areas
```

### 2. Seed Database

```bash
# Run migration first
npm run db:migrate

# Seed SNAP areas
npm run seed:snap-areas

# Or with custom file path
npm run seed:snap-areas -- /path/to/snap_areas.json

# Clean existing data before seeding
npm run seed:snap-areas -- --clean
```

### 3. API Request

```bash
# Check coordinates in Montevideo (should PASS)
curl -X POST http://localhost:3000/check \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": { "lat": -34.9, "lon": -56.2 },
      "country": "UY"
    }
  }'

# Check coordinates in protected area (should FAIL)
curl -X POST http://localhost:3000/check \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": { "lat": -34.0, "lon": -53.5 },
      "country": "UY"
    }
  }'
```

## Performance

- **Query Time:** Expected < 50ms (similar to Brazil indigenous lands checker)
- **Cache:** 30 days (protected areas rarely change)
- **Database Size:** ~22 records (small dataset)
- **Index:** GIST spatial index on geometry column

## Legal Implications

Activities in SNAP protected areas require:
- Special authorization from Ministry of Environment (DINABISE)
- Environmental impact assessment
- Compliance with specific regulations per area category

**Legal Framework:**
- Ley 17.234 (2000) - Sistema Nacional de Áreas Protegidas
- Decreto 52/005 - Reglamentación de la Ley 17.234

## Data Freshness

- **Update Frequency:** Annual (protected areas change infrequently)
- **Last Official Update:** August 2025
- **Contact for Updates:** secretaria.snap@ambiente.gub.uy

## Alternative Data Sources

If shapefile download fails, try:
1. **IDE Uruguay WFS Service:**
   ```
   https://mapas.ide.uy/geoserver-vectorial/ideuy/ows?
     service=WFS&
     version=2.0.0&
     request=GetFeature&
     typename=ideuy:snap_areas&
     outputFormat=application/json
   ```
   (Note: Layer name may vary - check GetCapabilities first)

2. **Ministry of Environment Visualizer:**
   - https://www.ambiente.gub.uy/visualizador/

## Integration with Other Checkers

This checker works alongside:
- ✅ **DICOSE Rural Registry** (Task #5) - Property validation
- ✅ **Environmental Complaints** (future) - Risk assessment
- ✅ **Fire Alerts** (NASA FIRMS) - Environmental monitoring

## Testing

```bash
# Build project
npm run build

# Run checker (requires seeded data)
npm run test -- snap

# Manual test with coordinates
npm run dev
# Then POST to /check endpoint
```

## Known Issues

1. **Manual Download Required:**
   - SNAP portal has no direct API
   - Shapefile must be downloaded manually
   - Consider automating via IDE Uruguay WFS in future

2. **Field Name Variations:**
   - Shapefile field names may vary by export
   - Seed script normalizes common variations
   - Check `props` in GeoJSON if seeding fails

## Future Enhancements

- [ ] Automated download via IDE Uruguay WFS
- [ ] Add buffer zone checks (5km, 10km)
- [ ] Cross-reference with environmental complaints
- [ ] Add historical data (areas removed/modified)
- [ ] Monthly update cron job

## Related Documentation

- [DATA_SOURCES_URUGUAY.md](./DATA_SOURCES_URUGUAY.md) - All Uruguay data sources
- [MULTI_COUNTRY.md](./MULTI_COUNTRY.md) - Multi-country architecture
- [CAR_ENDPOINTS.md](./CAR_ENDPOINTS.md) - Similar geometry endpoint examples

---

**Status:** ✅ Ready for production (pending data seeding)
**Next Step:** Seed SNAP data in Railway/production database
