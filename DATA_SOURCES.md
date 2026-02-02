# Data Sources - Complete Reference

This document provides detailed technical information about all data sources integrated into DeFarm Check API, including URLs, authentication, data formats, workflows, and troubleshooting.

---

## Table of Contents

1. [PRODES - Deforestation Monitoring](#prodes---deforestation-monitoring)
2. [CAR - Rural Environmental Registry](#car---rural-environmental-registry)
3. [DETER - Real-time Deforestation Alerts](#deter---real-time-deforestation-alerts)
4. [MapBiomas Alerta - Validated Deforestation](#mapbiomas-alerta---validated-deforestation)
5. [Terras Indígenas - Indigenous Lands](#terras-indígenas---indigenous-lands)
6. [Unidades de Conservação - Conservation Units](#unidades-de-conservação---conservation-units)
7. [IBAMA - Environmental Embargoes](#ibama---environmental-embargoes)
8. [Lista Suja - Slave Labor Registry](#lista-suja---slave-labor-registry)
9. [CGU Sanções - Government Sanctions](#cgu-sanções---government-sanctions)
10. [INPE Queimadas - Fire Hotspots](#inpe-queimadas---fire-hotspots)
11. [MAPA Orgânicos - Organic Certification](#mapa-orgânicos---organic-certification)
12. [ANA Outorgas - Water Use Permits](#ana-outorgas---water-use-permits)

---

## PRODES - Deforestation Monitoring

**Provider:** INPE (Instituto Nacional de Pesquisas Espaciais)
**Platform:** TerraBrasilis
**Status:** ✅ Production (216,242 records)

### Data Source

- **Primary URL:** https://terrabrasilis.dpi.inpe.br/geoserver/ows
- **Service Type:** WFS (Web Feature Service)
- **Documentation:** https://terrabrasilis.dpi.inpe.br/
- **Authentication:** None (public data)
- **Update Frequency:** Annual (typically November for previous year data)

### Available Layers

| Biome | WFS Layer | Start Year | Records (2021-2026) |
|-------|-----------|------------|---------------------|
| Amazônia Legal | `prodes-legal-amz:yearly_deforestation` | 2008 | 50,000 |
| Cerrado | `prodes-cerrado-nb:yearly_deforestation` | 2000 | 36,050 |
| Caatinga | `prodes-caatinga-nb:yearly_deforestation` | 2008 | 50,000 |
| Mata Atlântica | `prodes-mata-atlantica-nb:yearly_deforestation` | 2008 | 50,000 |
| Pampa | `prodes-pampa-nb:yearly_deforestation` | 2008 | 24,865 |
| Pantanal | `prodes-pantanal-nb:yearly_deforestation` | 2008 | 5,327 |

### Data Format

**Original:** GeoJSON (WFS response)
**Stored:** PostgreSQL + PostGIS

```json
{
  "type": "Feature",
  "properties": {
    "year": 2023,
    "view_date": "2023-08-15",
    "areamunkm": 1.234,  // Area in km²
    "uf": "PA",
    "municipio": "Altamira",
    "classname": "DESMATAMENTO",
    "path_row": "226/062"
  },
  "geometry": {
    "type": "MultiPolygon",
    "coordinates": [[[...]]]
  }
}
```

### Database Schema

```sql
CREATE TABLE prodes_deforestation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  area_ha INTEGER NOT NULL,           -- Converted from km² × 100
  state VARCHAR(2),
  municipality VARCHAR(255),
  path_row VARCHAR(10),
  source VARCHAR(50) DEFAULT 'PRODES',
  geometry geometry(MULTIPOLYGON, 4326),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_prodes_deforestation_year ON prodes_deforestation(year);
CREATE INDEX idx_prodes_deforestation_state ON prodes_deforestation(state);
CREATE INDEX idx_prodes_deforestation_geometry ON prodes_deforestation USING GIST(geometry);
```

### Complete Workflow

```bash
# 1. Download (2 minutes, 901 MB total)
npm run data:prodes-complete
# Downloads all 6 biomes, last 5 years each
# Output: data/prodes_{biome}_5y.json

# 2. Seed (58 seconds, 216K records)
npm run seed:prodes-complete -- --clean
# Batch INSERT with 50 records per batch
# Converts km² → hectares (×100)

# 3. Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM prodes_deforestation;"
```

### API Checker

**File:** `src/checkers/environmental/deforestation.ts`
**Input Types:** `COORDINATES`, `CAR`
**Query:** PostGIS `ST_Intersects` for point-in-polygon

```typescript
const result = await db.execute(sql`
  SELECT year, area_ha, state, municipality
  FROM prodes_deforestation
  WHERE ST_Intersects(
    geometry,
    ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
  )
  LIMIT 10
`);
```

### Cron Job

**File:** `src/worker/jobs/update-prodes.ts`
**Schedule:** Monthly (1st day, 05:00 UTC)
**Action:** Downloads Amazônia (last 3 years), replaces old data
**Notifications:** Telegram on success/failure

### Known Issues & Solutions

1. **Schema Mismatch**
   - Database has `area_ha`, not `area_km2`
   - Must convert: `areaHa = areaKm2 * 100`
   - Column name is `geometry`, not `geom`

2. **SQL Query Truncation**
   - Batch size 500 creates 20-50 MB queries
   - Solution: Reduced to batch size 50

3. **Missing Fields**
   - `class_name` and `image_date` not in current schema
   - Script removes these fields before INSERT

---

## CAR - Rural Environmental Registry

**Provider:** SICAR (Sistema Nacional de Cadastro Ambiental Rural)
**Platform:** Serviço Florestal Brasileiro
**Status:** 🔄 In Progress (3.5M+ records, 20/27 states)

### Data Source

- **Primary URL:** https://consultapublica.car.gov.br/publico/estados/downloads
- **Service Type:** Manual download (CAPTCHA-protected)
- **Alternative:** https://geoserver.car.gov.br/geoserver/sicar/wfs (WFS - has timeout issues)
- **Authentication:** None, but requires CAPTCHA per download
- **Update Frequency:** Continuous (daily updates by landowners)

### Data Access Methods

| Method | URL | Format | Status | Notes |
|--------|-----|--------|--------|-------|
| Portal Downloads | consultapublica.car.gov.br/publico/estados/downloads | Shapefile (ZIP) | ✅ Works | CAPTCHA required, manual |
| WFS API | geoserver.car.gov.br/geoserver/sicar/wfs | GeoJSON | ❌ Timeouts | Large states timeout after 5-23 min |
| GeoServer Preview | geoserver.car.gov.br/geoserver/web | Various | ⚠️ Partial | Layer preview available |

### Available Layers (Per State)

Each state provides multiple shapefiles:
- **AREA_IMOVEL** (Property Boundaries) ← **We use this**
- APP (Permanent Preservation Areas)
- RESERVA_LEGAL (Legal Reserves)
- VEGETACAO_NATIVA (Native Vegetation)
- HIDROGRAFIA (Hydrography)
- USO_RESTRITO (Restricted Use)
- SERVIDAO_ADMINISTRATIVA (Administrative Easements)

### Data Format

**Original:** ESRI Shapefile (.shp + .dbf + .shx + .prj)
**Converted:** GeoJSON (via ogr2ogr)
**Stored:** PostgreSQL + PostGIS

```json
{
  "type": "Feature",
  "properties": {
    "cod_imovel": "AC-1200013-7A8EDCFAAE3E4EAFB22083CA4E0AE366",
    "num_area": 73.754,        // Area in hectares
    "ind_status": "PE",        // Status: PE/AT/CA/SU
    "municipio": "Acrelandia",
    "cod_estado": "AC",
    "des_condic": "Aguardando analise",
    "dat_criaca": "17/10/2023",
    "dat_atuali": "17/10/2023"
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[...]]]
  }
}
```

### Database Schema

```sql
CREATE TABLE car_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  car_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(50),
  area_ha INTEGER,
  state VARCHAR(2) NOT NULL,
  municipality VARCHAR(255),
  source VARCHAR(50) DEFAULT 'SICAR',
  geometry geometry(MULTIPOLYGON, 4326),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_car_registrations_car_number ON car_registrations(car_number);
CREATE INDEX idx_car_registrations_state ON car_registrations(state);
CREATE INDEX idx_car_registrations_geometry ON car_registrations USING GIST(geometry);
```

### Complete Workflow

```bash
# 1. Manual Download
# Go to https://consultapublica.car.gov.br/publico/estados/downloads
# Download AREA_IMOVEL shapefile for each state (solve CAPTCHA)
# Save to car/ directory as {STATE}_AREA_IMOVEL.zip

# 2. Convert Shapefiles to GeoJSON (12 minutes for 27 states)
npm run process:car
# Extracts ZIPs, converts to GeoJSON via ogr2ogr
# Output: data/car_{state}.json (12 GB total)

# 3a. Seed Small/Medium States (works fine)
npm run seed:car-v2 -- --clean
# Processes files < 512 MB successfully

# 3b. Split Large States (BA, MG, SP, RS, GO, SC, PR)
npm run split:car -- BA MG SP RS GO SC PR
# Splits files > 512 MB into 50K feature chunks
# Output: data/car_{state}_chunk{N}.json

# 3c. Seed All (including chunks)
npm run seed:car-v2
# Automatically processes all car_*.json files

# 4. Verify
psql $DATABASE_URL -c "SELECT state, COUNT(*) FROM car_registrations GROUP BY state ORDER BY state;"
```

### File Sizes by State

| State | Size | Records (est) | Notes |
|-------|------|---------------|-------|
| BA | 1.2 GB | ~400K | Requires splitting |
| MG | 1.2 GB | ~450K | Requires splitting |
| SP | 928 MB | ~300K | Requires splitting |
| RS | 929 MB | ~300K | Requires splitting |
| GO | 610 MB | ~200K | Requires splitting |
| SC | 560 MB | ~180K | Requires splitting |
| PR | ~600 MB | ~200K | Requires splitting |
| CE | 437 MB | 404K | ✅ Seeded |
| ... | ... | ... | ... |

### API Checker

**File:** `src/checkers/environmental/car.ts`
**Input Types:** `COORDINATES`, `CAR`, `CNPJ`, `CPF`
**Query:** PostGIS spatial intersection or CAR number lookup

### Known Issues & Solutions

1. **V8 String Length Limit**
   - **Problem:** Files > 512 MB cause "Invalid string length"
   - **Solution:** Use `scripts/split-large-car-files.ts` to split into chunks

2. **CAPTCHA Protection**
   - **Problem:** Automated download blocked
   - **Solution:** Manual download required (27 files)

3. **WFS Timeouts**
   - **Problem:** Large state queries timeout after 5-23 minutes
   - **Solution:** Abandoned WFS approach, use manual downloads

4. **Missing Owner Data**
   - **Problem:** AREA_IMOVEL layer doesn't include owner CPF/CNPJ
   - **Solution:** Schema allows NULL for owner fields

---

## DETER - Real-time Deforestation Alerts

**Provider:** INPE
**Platform:** TerraBrasilis
**Status:** ✅ Production

### Data Source

- **Primary URL:** http://terrabrasilis.dpi.inpe.br/geoserver/ows
- **Service Type:** WFS
- **Documentation:** http://terrabrasilis.dpi.inpe.br/geonetwork/srv/por/catalog.search#/home
- **Authentication:** None
- **Update Frequency:** Daily

### WFS Layers

- `deter-amz:daily_alerts` - Daily Amazônia alerts
- `deter-cerrado:daily_alerts` - Daily Cerrado alerts

### Complete Workflow

```bash
# Download yesterday's alerts
npm run data:deter-daily

# Download date range
npm run data:deter-range

# Seed
npm run seed:deter

# Cron: Daily at 03:00 UTC
npm run cron:test-deter
```

### Database Schema

```sql
CREATE TABLE deter_alerts (
  id UUID PRIMARY KEY,
  alert_date DATE NOT NULL,
  area_ha INTEGER NOT NULL,
  state VARCHAR(2),
  municipality VARCHAR(255),
  classname VARCHAR(50),
  sensor VARCHAR(20),
  path_row VARCHAR(10),
  source VARCHAR(20) DEFAULT 'DETER-B',
  geometry geometry(MULTIPOLYGON, 4326),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## MapBiomas Alerta - Validated Deforestation

**Provider:** MapBiomas
**Platform:** Plataforma Alerta
**Status:** ✅ Production (35,447 alerts)

### Data Source

- **Primary URL:** https://plataforma.alerta.mapbiomas.org/
- **API Endpoint:** https://plataforma.alerta.mapbiomas.org/api/v2/graphql
- **Service Type:** GraphQL API
- **Authentication:** Required (API token)
- **Rate Limiting:** ~5,000 records per request
- **Update Frequency:** Weekly

### Authentication

```bash
# 1. Create account: https://plataforma.alerta.mapbiomas.org/sign-in
# 2. Get token from profile
# 3. Set in .env:
MAPBIOMAS_API_TOKEN=your_token_here
```

### GraphQL Query

```graphql
query {
  alerts(
    publishedAfter: "2020-01-01"
    limit: 5000
    offset: 0
  ) {
    alertCode
    areaHa
    detectedAt
    publishedAt
    state
    municipality
    biome
    deforestationClass
    geometry
  }
}
```

### Complete Workflow

```bash
# Download (requires MAPBIOMAS_API_TOKEN in .env)
npm run data:mapbiomas-alerta

# Seed
npm run seed:mapbiomas-alerta
```

---

## Terras Indígenas - Indigenous Lands

**Provider:** FUNAI
**Status:** ✅ Production

### Data Source

- **Primary URL:** https://geoserver.funai.gov.br/geoserver/Funai/ows
- **Service Type:** WFS
- **Documentation:** https://geoserver.funai.gov.br/geoserver/web/
- **Authentication:** None

### Complete Workflow

```bash
npm run data:funai-terras-indigenas
npm run seed:terras-indigenas
```

---

## Unidades de Conservação - Conservation Units

**Provider:** ICMBio
**Status:** ✅ Production

### Data Source

- **Primary URL:** https://geoserver.icmbio.gov.br/geoserver/ows
- **Service Type:** WFS
- **Documentation:** https://geoserver.icmbio.gov.br/geoserver/web/

### Complete Workflow

```bash
npm run data:icmbio-unidades-conservacao
npm run seed:unidades-conservacao
```

---

## IBAMA - Environmental Embargoes

**Provider:** IBAMA
**Status:** ✅ Production (65,953 documents)

### Data Source

- **Primary URL:** https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_embargo/
- **File Format:** CSV (ZIP compressed)
- **Authentication:** None
- **Update Frequency:** Weekly

### Complete Workflow

```bash
# Download via npm script (defined in package.json)
npm run data:ibama
# Downloads ZIP, extracts CSV, aggregates by CPF/CNPJ

# Seed
npm run seed:ibama-simple
```

---

## Lista Suja - Slave Labor Registry

**Provider:** MTE (Ministério do Trabalho e Emprego)
**Status:** ✅ Production (678 records)

### Data Source

- **Primary URL:** https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/
- **File:** `cadastro_de_empregadores.xlsx`
- **Format:** Excel
- **Update Frequency:** Semi-annual

### Complete Workflow

```bash
npm run data:lista-suja
npm run seed:lista-suja-simple
```

---

## CGU Sanções - Government Sanctions

**Provider:** CGU (Controladoria-Geral da União)
**Status:** ✅ Production

### Data Source

- **Primary URL:** https://api.portaldatransparencia.gov.br/api-de-dados/
- **API Type:** REST
- **Documentation:** https://api.portaldatransparencia.gov.br/swagger-ui/index.html
- **Authentication:** API Key required
- **Endpoints:**
  - `/ceis` - Inidôneos e Inabilitados
  - `/cnep` - Empresas Punidas
  - `/ceaf` - Expulsões da Administração Federal

### Authentication

Get API key from: https://api.portaldatransparencia.gov.br/

### Complete Workflow

```bash
# Set API key in .env
CGU_API_KEY=your_key_here

npm run data:cgu-sancoes
npm run seed:cgu-sancoes
```

---

## INPE Queimadas - Fire Hotspots

**Provider:** INPE
**Status:** ✅ Production

### Data Source

- **Primary URL:** https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil/
- **Format:** CSV (daily files)
- **Update Frequency:** Daily

### Complete Workflow

```bash
npm run data:queimadas
npm run seed:queimadas
```

---

## MAPA Orgânicos - Organic Certification

**Provider:** MAPA (Ministério da Agricultura)
**Status:** ✅ Production

### Data Source

- **Primary URL:** https://www.gov.br/agricultura/pt-br/assuntos/sustentabilidade/organicos/cadastro-nacional-de-produtores-organicos-cnpo
- **File:** `CNPO_MAPA_ATUAL_V2_RELOAD1.xlsx`
- **Format:** Excel

### Complete Workflow

```bash
npm run data:mapa-organicos
npm run seed:mapa-organicos
```

---

## ANA Outorgas - Water Use Permits

**Provider:** ANA (Agência Nacional de Águas)
**Status:** ✅ Production (48,179 permits)

### Data Source

- **Primary URL:** https://dadosabertos.ana.gov.br/
- **Download:** https://hub.arcgis.com/api/v3/datasets/98d419c5fb2c4c28ad60efd3872d5d5c/downloads/data?format=csv&spatialRefId=4326
- **Format:** CSV

### Complete Workflow

```bash
npm run data:ana-outorgas
npm run seed:ana-outorgas
```

---

## Railway Deployment

### Database Connection

Production database is hosted on Railway:
- **Connection:** Set via `DATABASE_URL` environment variable
- **Extensions:** PostGIS 3.7 (required for spatial queries)
- **Migrations:** Run automatically on deploy via `npm run db:migrate`

### Deployment Process

```bash
# 1. Push to GitHub
git push origin main

# 2. Railway auto-deploys from main branch
# (configured in Railway dashboard)

# 3. Migrations run automatically (if configured)
# OR manually:
railway run npm run db:migrate

# 4. Seed data (if needed)
railway run npm run seed:all-production
```

### Environment Variables (Railway)

Required in Railway dashboard:
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
MAPBIOMAS_API_TOKEN=...
CGU_API_KEY=...
PORT=3000
NODE_ENV=production
```

### Worker Service

The cron job worker runs as a separate Railway service:
- **Start Command:** `npm run worker`
- **File:** `src/worker/index.ts`
- **Scheduler:** `src/worker/scheduler.ts`

---

## General Best Practices

### Large File Handling

| File Size | Approach | Tool |
|-----------|----------|------|
| < 200 MB | Direct `JSON.parse()` | Standard Node.js |
| 200-512 MB | Increase memory | `NODE_OPTIONS="--max-old-space-size=8192"` |
| > 512 MB | Split into chunks | `scripts/split-large-car-files.ts` |

### Batch INSERT Pattern

Always use for large datasets:
```typescript
const batchSize = 50;  // Optimal for PostGIS geometries
const valuesClauses = batch.map(item => sql`(...)`);
await db.execute(sql`
  INSERT INTO table (...)
  VALUES ${sql.join(valuesClauses, sql`, `)}
`);
```

### PostGIS Geometry

✅ **Correct:**
```typescript
ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)
```

❌ **Avoid:**
```typescript
ST_GeomFromText('POLYGON(...)', 4326)  // SQL injection risk
```

### Schema Verification

Before bulk INSERT:
```bash
psql $DATABASE_URL -c "\d table_name"
```

---

## Troubleshooting

### "Invalid string length"

**Cause:** File > 512 MB
**Solution:**
```bash
npm run split:car -- STATE1 STATE2
```

### "Column does not exist"

**Cause:** Schema mismatch
**Solution:** Check actual DB schema with `\d table_name`

### WFS Timeout

**Cause:** Large dataset query
**Solution:** Use manual download or split by date range

### CAPTCHA Block

**Cause:** Automated download attempt
**Solution:** Manual download required

---

## Quick Reference Commands

```bash
# Download all data
npm run data:prodes-complete
npm run data:deter-daily
npm run data:mapbiomas-alerta
# ... (manual for CAR)

# Seed all data
npm run seed:prodes-complete -- --clean
npm run seed:car-v2
npm run seed:deter
npm run seed:mapbiomas-alerta
npm run seed:all-production  # All pre-downloaded data

# Test checkers
curl -H "X-API-Key: YOUR_KEY" \
  "https://defarm-check-api-production.up.railway.app/api/check?type=coordinates&lat=-10.5&lon=-62.8"

# Verify data
psql $DATABASE_URL -c "SELECT
  (SELECT COUNT(*) FROM prodes_deforestation) as prodes,
  (SELECT COUNT(*) FROM car_registrations) as car,
  (SELECT COUNT(*) FROM deter_alerts) as deter,
  (SELECT COUNT(*) FROM mapbiomas_alerta) as mapbiomas;"
```
