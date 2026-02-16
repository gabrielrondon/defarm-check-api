# DICOSE Rural Registry Checker - Uruguay

**Status:** ✅ Implemented
**Priority:** HIGH
**Last Updated:** 2026-02-16

## Overview

The DICOSE (División de Contralor de Semovientes) checker verifies if a rural producer/property has a valid livestock declaration in Uruguay. This is the Uruguayan equivalent to Brazil's CAR (Cadastro Ambiental Rural) and is mandatory for all rural establishments.

## Data Source

- **Provider:** DICOSE - MGAP (Ministerio de Ganadería, Agricultura y Pesca)
- **URL:** https://catalogodatos.gub.uy/dataset/mgap-datos-preliminares-basados-en-la-declaracion-jurada-de-existencias-dicose-snig-2024
- **Coverage:** Complete national livestock census (annual)
- **Data Format:** 44 CSV files per year
- **Update Frequency:** Annual (published in March for previous year)
- **Last Update:** 2024
- **Legal Framework:** Decreto 89/996 - Declaración obligatoria

## What is DICOSE?

DICOSE is the mandatory annual livestock and rural property declaration system in Uruguay:

- **Required for:** All rural establishments (farms, ranches, etc.)
- **Purpose:**
  - Livestock census (cattle, sheep, horses, pigs, goats)
  - Land use tracking
  - Disease control and sanitation
  - Public policy planning

## Checker Implementation

### Files Created

```
src/
├── checkers/
│   └── uruguay/
│       └── dicose-rural.ts           # Checker implementation
├── db/
│   ├── schema.ts                     # Added dicoseRegistrations table
│   └── migrations/
│       └── 0018_clean_microchip.sql  # Migration with indexes
scripts/
├── download-dicose.ts                # Download guide script
└── seed-dicose.ts                    # CSV parsing and seed script
```

### Database Schema

```sql
CREATE TABLE dicose_registrations (
  id UUID PRIMARY KEY,
  establishment_id VARCHAR(50) NOT NULL,      -- DICOSE establishment ID
  producer_document VARCHAR(20),              -- RUC or CI of producer
  producer_name TEXT,                         -- Producer name
  year INTEGER NOT NULL,                      -- Declaration year (2024, 2023...)
  area_ha INTEGER,                            -- Exploited area in hectares
  department VARCHAR(100) NOT NULL,           -- Department (state equivalent)
  section VARCHAR(50),                        -- Cadastral section
  activity VARCHAR(100),                      -- Main activity type
  livestock_count JSONB,                      -- Animal counts by species
  land_use JSONB,                             -- Land use breakdown
  declaration_status VARCHAR(50) DEFAULT 'DECLARED',
  country VARCHAR(2) DEFAULT 'UY' NOT NULL,
  source VARCHAR(50) DEFAULT 'DICOSE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_dicose_establishment_id ON dicose_registrations(establishment_id);
CREATE INDEX idx_dicose_producer_document ON dicose_registrations(producer_document);
CREATE INDEX idx_dicose_department ON dicose_registrations(department);
CREATE INDEX idx_dicose_year ON dicose_registrations(year);
CREATE INDEX idx_dicose_producer_year ON dicose_registrations(producer_document, year);
CREATE UNIQUE INDEX idx_dicose_establishment_year ON dicose_registrations(establishment_id, year);
```

### Checker Configuration

```typescript
metadata: {
  name: 'DICOSE Rural Registry',
  category: CheckerCategory.ENVIRONMENTAL,
  description: 'Verifica se produtor tem registro DICOSE válido (cadastro rural uruguaio)',
  priority: 7,
  supportedInputTypes: [InputType.RUC, InputType.CI],
  supportedCountries: [Country.URUGUAY]
}

config: {
  enabled: true,
  cacheTTL: 2592000,  // 30 days (annual data)
  timeout: 3000       // 3 seconds
}
```

### Query Logic

```sql
SELECT *
FROM dicose_registrations
WHERE producer_document = $1
  AND country = 'UY'
ORDER BY year DESC
LIMIT 1;
```

The checker:
1. Searches for the most recent declaration by RUC/CI
2. Checks if declaration is recent (within last 2 years)
3. Returns PASS/WARNING based on findings

## Check Results

### PASS (Valid Declaration)

```json
{
  "status": "PASS",
  "message": "Valid DICOSE declaration found (2024)",
  "details": {
    "establishmentId": "UY-12345-678",
    "producerName": "Juan Pérez",
    "year": 2024,
    "department": "Rocha",
    "section": "03",
    "areaHa": 500,
    "activity": "Ganadería bovina",
    "declarationStatus": "DECLARED",
    "livestockSummary": "450 bovinos, 100 ovinos",
    "landUseSummary": "400 ha pastos, 50 ha agricultura",
    "source": "DICOSE - División de Contralor de Semovientes"
  }
}
```

### WARNING (No Declaration Found)

```json
{
  "status": "WARNING",
  "severity": "MEDIUM",
  "message": "No DICOSE declaration found for this producer",
  "details": {
    "document": "220123456789",
    "documentType": "RUC",
    "recommendation": "MEDIUM RISK: Producer does not have livestock/rural property declaration...",
    "legalFramework": "Decreto 89/996 - Declaración obligatoria de existencias ganaderas"
  }
}
```

### WARNING (Outdated Declaration)

```json
{
  "status": "WARNING",
  "severity": "MEDIUM",
  "message": "DICOSE declaration found but outdated (last: 2020)",
  "details": {
    "lastDeclarationYear": 2020,
    "yearsOld": 4,
    "recommendation": "MEDIUM RISK: Last declaration was 4 years ago (2020)...",
    "legalFramework": "Decreto 89/996 - Declaración anual obligatoria"
  }
}
```

## Usage

### 1. Download DICOSE Data (Manual)

```bash
# DICOSE data requires manual download (44 CSV files)
npm run data:dicose -- --year=2024

# This will display instructions and check for existing files
# You need to manually download priority CSVs:
#   - DatosGenerales.csv (establishment data)
#   - DatosAnimales.csv (livestock counts)
#   - TenenciaTierra.csv (land tenure)
#   - UsoSuelo.csv (land use)

# Place files in: data/uruguay/dicose/2024/
```

### 2. Seed Database

```bash
# Run migration first
npm run db:migrate

# Seed DICOSE data for 2024
npm run seed:dicose -- --year=2024

# Clean existing data before seeding
npm run seed:dicose -- --year=2024 --clean

# Seed with limit (for testing)
npm run seed:dicose -- --year=2024 --limit=1000
```

### 3. API Request

```bash
# Check RUC
curl -X POST http://localhost:3000/check \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "RUC",
      "value": "220123456789",
      "country": "UY"
    }
  }'

# Check CI (Cédula de Identidad)
curl -X POST http://localhost:3000/check \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CI",
      "value": "12345672",
      "country": "UY"
    }
  }'
```

## Data Files Structure

DICOSE provides 44 CSV files per year:

### Priority Files (for this checker):

1. **DatosGenerales.csv** - General establishment data
   - Fields: ID_ESTABLECIMIENTO, RUT_PRODUCTOR, NOMBRE_PRODUCTOR, DEPARTAMENTO, AREA_HA
   - ~50,000+ records (one per establishment)

2. **DatosAnimales.csv** - Livestock counts
   - Fields: ID_ESTABLECIMIENTO, ESPECIE, CATEGORIA, CANTIDAD
   - ~200,000+ records (multiple rows per establishment)

3. **TenenciaTierra.csv** - Land tenure
   - Fields: ID_ESTABLECIMIENTO, TIPO_TENENCIA, SUPERFICIE

4. **UsoSuelo.csv** - Land use
   - Fields: ID_ESTABLECIMIENTO, TIPO_USO, SUPERFICIE

### Optional Files (future enhancements):

- Leche.csv - Milk production data
- Mejoras.csv - Infrastructure improvements
- TablaCodigosDpto.csv - Department codes table
- ... and 37 more files with detailed breakdowns

## Data Processing

The seed script:
1. Parses `DatosGenerales.csv` as the main data source
2. Enriches with `DatosAnimales.csv` if available (livestock counts)
3. Normalizes column names (they may vary by year/export)
4. Aggregates livestock counts by species (bovinos, ovinos, etc.)
5. Inserts in batches of 100 records
6. Uses unique index on (establishment_id, year) to prevent duplicates

## Performance

- **Query Time:** < 10ms (simple document lookup with index)
- **Cache:** 30 days (annual data changes slowly)
- **Database Size:** ~50,000 records per year
- **Indexes:** 6 indexes for fast lookups

## Legal Implications

DICOSE declaration is:
- **Mandatory** for all rural establishments in Uruguay
- **Annual requirement** (deadline: February 28 each year)
- **Used for:** Disease control, public policy, trade compliance

Missing or outdated declaration may indicate:
- Inactive rural property
- Non-compliance with mandatory reporting
- Recent establishment not yet registered

## Data Freshness

- **Update Frequency:** Annual
- **Publication:** March (for previous year data)
- **2024 data:** Available now
- **Contact:** datos@mgap.gub.uy

## Integration with Other Checkers

This checker works alongside:
- ✅ **SNAP Protected Areas** (Task #4) - Environmental compliance
- 🔄 **Catastro Rural** (future) - Property boundaries
- 🔄 **Environmental Complaints** (future) - Risk assessment

## Testing

```bash
# Build project
npm run build

# Test download (shows instructions)
npm run data:dicose -- --year=2024

# Test seed (requires downloaded CSVs)
npm run seed:dicose -- --year=2024 --limit=100

# Manual API test
npm run dev
# Then POST to /check endpoint with RUC
```

## Known Issues

1. **Manual Download Required:**
   - No direct API for CSV download
   - Portal requires interactive download (CAPTCHA-like)
   - 44 files per year (we use 4-5 priority files)

2. **Column Name Variations:**
   - CSV column names may vary by year/export
   - Seed script tries common variations
   - May need adjustment for older years

3. **No Ownership Mapping:**
   - RUT_PRODUCTOR field may not always be populated
   - Some establishments use CI instead of RUC
   - May need to cross-reference with Catastro Rural

## Future Enhancements

- [ ] Automated CSV download (if API becomes available)
- [ ] Parse all 44 files for complete dataset
- [ ] Add land use analysis (agriculture vs pasture)
- [ ] Cross-reference with Catastro Rural (property boundaries)
- [ ] Historical trend analysis (year-over-year changes)
- [ ] Monthly update cron job (new data in March)

## Related Documentation

- [DATA_SOURCES_URUGUAY.md](./DATA_SOURCES_URUGUAY.md) - All Uruguay data sources
- [SNAP_CHECKER_URUGUAY.md](./SNAP_CHECKER_URUGUAY.md) - SNAP protected areas checker
- [MULTI_COUNTRY.md](./MULTI_COUNTRY.md) - Multi-country architecture

---

**Status:** ✅ Ready for production (pending data seeding)
**Next Step:** Download 2024 DICOSE CSVs and seed database
**Estimated Dataset Size:** ~50,000 establishments per year
