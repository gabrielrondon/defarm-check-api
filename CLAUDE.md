# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeFarm Check API - A socio-environmental compliance verification API that aggregates multiple public data sources to validate compliance of rural producers, properties, and products in Brazil.

**Production URL:** https://defarm-check-api-production.up.railway.app

The API checks against:
- **Lista Suja do Trabalho Escravo** (Slave Labor Registry - MTE) - 678 records
- **Embargos Ambientais** (IBAMA Environmental Embargoes) - 65,953 documents
- **Desmatamento** (Deforestation - PRODES/DETER/INPE) - Geospatial data
- **Terras Indígenas** (Indigenous Lands - FUNAI) - Protected territories
- **Unidades de Conservação** (Conservation Units - ICMBio) - Protected areas
- **Cadastro Ambiental Rural** (CAR/SICAR) - Rural environmental registry

## Development Commands

```bash
# Development
npm run dev              # Start API server with hot reload (tsx watch)
npm run dev:worker       # Start worker service with hot reload
npm run build            # Build TypeScript to dist/
npm run start            # Start production server (after build)
npm run worker           # Start production worker service

# Testing & Quality
npm run test             # Run tests with vitest
npm run test:coverage    # Run tests with coverage report
npm run lint             # ESLint on src/**/*.ts
npm run format           # Prettier format src/**/*.ts

# Database
npm run db:generate      # Generate Drizzle migration files
npm run db:migrate       # Run pending migrations
npm run db:seed          # Seed checker sources metadata

# API Keys
npm run create-api-key -- --name "App Name" --rate-limit 1000

# Data Seeding (Production/Railway)
npm run seed:lista-suja-simple      # Seed Lista Suja (MTE) from data/lista_suja_clean.json
npm run seed:ibama-simple           # Seed IBAMA embargoes from data/ibama_embargos_aggregated.json
npm run seed:terras-indigenas       # Seed Indigenous Lands from data/terras_indigenas.json
npm run seed:unidades-conservacao   # Seed Conservation Units from downloaded data
npm run seed:deter                  # Seed DETER alerts from downloaded data
npm run seed:car                    # Seed CAR registrations (priority states)
npm run seed:all-production         # Seed all production data at once

# Data Download (pulls from government sources)
npm run data:lista-suja             # Download Lista Suja from MTE
npm run data:ibama                  # Download IBAMA embargoes
npm run data:prodes                 # Seed PRODES sample data
npm run data:deter-daily            # Download DETER alerts (yesterday)
npm run data:deter-range            # Download DETER alerts (date range)
npm run data:funai-terras-indigenas # Download Indigenous Lands from FUNAI
npm run data:icmbio-unidades-conservacao # Download Conservation Units
npm run data:car                    # Download CAR data (priority states)
npm run data:car-all                # Download all CAR data (all states)

# Cron Jobs (Worker Service)
npm run cron:test-deter             # Test DETER update job
npm run cron:test-lista-suja        # Test Lista Suja update job
npm run cron:test-ibama             # Test IBAMA update job
npm run cron:test-spatial           # Test spatial data (TIs + UCs) update
npm run cron:test-car               # Test CAR update job
npm run cron:check-health           # Test data freshness check

# Telegram Notifications
npm run test:telegram               # Test Telegram bot notifications
```

## Architecture

### Stack
- **Runtime:** Node.js 18+ with TypeScript (ES Modules)
- **Framework:** Fastify 4.x (3x faster than Express)
- **Database:** PostgreSQL 15/16 + PostGIS 3.7 (geospatial queries)
- **Cache:** Redis 7.x (ioredis client)
- **ORM:** Drizzle ORM (type-safe, performant)
- **Validation:** Zod schemas
- **Logging:** Pino (structured JSON logs)

### Directory Structure

```
src/
├── api/
│   ├── routes/          # HTTP endpoints (check, health, sources, samples)
│   ├── middleware/      # auth.ts (API key validation), error-handler.ts
│   ├── plugins/         # security.ts (CORS, helmet, rate-limit), swagger.ts
│   └── server.ts        # Fastify app setup
├── checkers/
│   ├── base.ts          # Abstract BaseChecker class (cache, timeout, error handling)
│   ├── registry.ts      # CheckerRegistry singleton (register, getActive, getApplicable)
│   ├── environmental/   # Deforestation, IBAMA, CAR, DETER, Indigenous Lands, Conservation Units
│   ├── social/          # Slave Labor Registry
│   ├── legal/           # (future: SISBOV, licensing)
│   └── index.ts         # Auto-registers all checkers
├── services/
│   ├── orchestrator.ts  # OrchestratorService (executeCheck, normalizeInput, selectCheckers)
│   ├── cache.ts         # Redis cache service (get, set, invalidate)
│   ├── verdict.ts       # Verdict calculation (score, summary, cache hit rate)
│   └── telegram.ts      # Telegram notifications for worker jobs
├── worker/
│   ├── scheduler.ts     # Cron job scheduler (DETER daily, Lista Suja monthly, etc)
│   ├── jobs/            # Job handlers (update-deter, update-lista-suja, check-data-freshness)
│   └── index.ts         # Worker process entrypoint
├── db/
│   ├── schema.ts        # Drizzle schema (all tables, indexes)
│   ├── client.ts        # PostgreSQL connection pool
│   └── migrate.ts       # Migration runner
├── types/               # TypeScript types (checker.ts, input.ts, verdict.ts, api.ts)
├── utils/               # logger.ts, validators.ts, errors.ts
├── config/              # Environment config loader
└── index.ts             # Main entrypoint (starts Fastify server)

scripts/                 # Data download/seed scripts
drizzle/                 # Generated SQL migrations
```

### Core Architecture Pattern: Checker System

The API is built around a **pluggable checker architecture**:

1. **BaseChecker** (`src/checkers/base.ts`): Abstract class that all checkers extend
   - Handles caching (Redis), timeouts, error handling, result formatting
   - Implements `check()` wrapper that calls `executeCheck()` (implemented by subclasses)
   - `isApplicable()` filters checkers based on input type (CNPJ, CPF, CAR, COORDINATES)

2. **CheckerRegistry** (`src/checkers/registry.ts`): Singleton that manages all checkers
   - `register(checker)`: Registers a new checker instance
   - `getActive()`: Returns enabled checkers sorted by priority
   - `getApplicable(inputType)`: Returns checkers that support the input type

3. **Checker Implementation** (e.g., `src/checkers/social/slave-labor.ts`):
   ```typescript
   export class SlaveLaborChecker extends BaseChecker {
     metadata = {
       name: 'Slave Labor Registry',
       category: CheckerCategory.SOCIAL,
       description: '...',
       priority: 9,
       supportedInputTypes: [InputType.CNPJ, InputType.CPF]
     }

     config = {
       enabled: true,
       cacheTTL: 86400,  // 24 hours
       timeout: 5000
     }

     async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
       // Query database, return PASS/FAIL with details
     }
   }
   ```

4. **OrchestratorService** (`src/services/orchestrator.ts`): Coordinates check execution
   - Receives check request → normalizes input → selects applicable checkers
   - Executes all checkers **in parallel** (Promise.all)
   - Calculates verdict/score → persists to database → returns response
   - Non-blocking persistence (doesn't wait for DB insert before returning)

### Geospatial Queries

For checkers that use PostGIS (deforestation, indigenous lands, conservation units):
- Geometries stored as `geometry(MULTIPOLYGON, 4326)` in PostgreSQL
- Queries use `ST_Intersects`, `ST_Within`, `ST_Contains` for spatial matching
- Input coordinates converted to PostGIS POINT for intersection checks

### Worker Service & Cron Jobs

Separate Node process (`src/worker/index.ts`) that runs scheduled data updates:
- **Daily:** DETER alerts (03:00), Data freshness check (08:00)
- **Weekly:** IBAMA embargoes (Sunday 02:00)
- **Monthly:** Lista Suja (1st, 02:00), Spatial data (1st, 04:00), CAR (15th, 03:00)

Jobs send Telegram notifications on start/success/failure (`src/services/telegram.ts`).

### Authentication & Rate Limiting

- All endpoints (except `/health`) require `X-API-Key` header
- API keys hashed with bcrypt, stored in `api_keys` table
- Rate limiting: configurable per API key (default 10,000 req/min)
- Middleware: `src/api/middleware/auth.ts`

### Database Schema

Key tables (see `src/db/schema.ts`):
- `check_requests` - All verification history (audit trail)
- `lista_suja` - Slave labor registry (CPF/CNPJ indexed)
- `ibama_embargoes` - Environmental embargoes (aggregated by document)
- `prodes_deforestation` - PRODES deforestation polygons (PostGIS)
- `deter_alerts` - Real-time deforestation alerts (PostGIS)
- `terras_indigenas` - Indigenous lands (PostGIS)
- `unidades_conservacao` - Conservation units (PostGIS)
- `car_registrations` - CAR registry (PostGIS)
- `api_keys` - API key authentication

All tables use UUIDs for primary keys. Spatial tables have PostGIS geometry columns added via migrations.

## Environment Variables

See `.env.example` for required variables:
- `DATABASE_URL` - PostgreSQL connection string (must have PostGIS extension)
- `REDIS_URL` - Redis connection string
- `PORT`, `HOST` - Server configuration
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` - Worker notifications
- `CACHE_ENABLED`, `DEFAULT_CACHE_TTL` - Cache configuration

**Important:** Never commit `.env` file. Railway/production uses environment variables set in platform.

## Adding a New Checker

1. Create checker class in `src/checkers/{category}/my-checker.ts`:
   ```typescript
   import { BaseChecker } from '../base.js';

   export class MyChecker extends BaseChecker {
     metadata = { name: '...', category: CheckerCategory.ENVIRONMENTAL, ... }
     config = { enabled: true, cacheTTL: 3600, timeout: 5000 }

     async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
       // Implementation
     }
   }

   export default new MyChecker();
   ```

2. Import and register in `src/checkers/index.ts`:
   ```typescript
   import myChecker from './environmental/my-checker.js';
   checkerRegistry.register(myChecker);
   ```

3. No other changes needed - orchestrator automatically discovers via registry.

## Database Migrations

When modifying schema:
1. Edit `src/db/schema.ts`
2. Run `npm run db:generate` to create migration
3. Review generated SQL in `drizzle/` directory
4. Run `npm run db:migrate` to apply

For PostGIS columns, add manual SQL in migration:
```sql
ALTER TABLE my_table ADD COLUMN geom geometry(MULTIPOLYGON, 4326);
CREATE INDEX idx_my_table_geom ON my_table USING GIST (geom);
```

## Seeding Production Data

The repository includes pre-processed data files for quick seeding:
- `data/lista_suja_clean.json` - Lista Suja (678 records)
- `data/ibama_embargos_aggregated.json` - IBAMA (65,953 aggregated)
- `data/terras_indigenas.json` - Indigenous lands (downloaded from FUNAI)

For Railway/production deployment, use:
```bash
npm run seed:all-production
```

See `docs/SEED_PRODUCTION.md` and `docs/SEED_RAILWAY.md` for detailed instructions.

## Testing

The API includes `/samples/*` endpoints for testing with real data:
- `/samples/lista-suja` - Returns CNPJ/CPF that exists in Lista Suja
- `/samples/ibama` - Returns CNPJ/CPF with IBAMA embargoes
- `/samples/prodes` - Returns coordinates with deforestation

Use these for end-to-end testing without knowing actual documents.

## Data Sources: Implementation Guide & Learnings

This section documents detailed learnings from implementing each data source, including challenges faced and solutions discovered.

### PRODES (Deforestation Monitoring - INPE/TerraBrasilis)

**Status:** ✅ Complete - 216,242 records (all 6 biomes)

**Data Source:** https://terrabrasilis.dpi.inpe.br/geoserver/ows

**Implementation Files:**
- `scripts/download-prodes-complete.ts` - WFS download from TerraBrasilis
- `scripts/seed-prodes-complete.ts` - Optimized batch INSERT seeding
- `src/worker/jobs/update-prodes.ts` - Monthly cron job (1st day, 05:00)

**Workflow:**
```bash
# 1. Download all 6 biomes (2 minutes, 901 MB total)
npm run data:prodes-complete

# 2. Seed into PostgreSQL (1 minute, 216K records)
npm run seed:prodes-complete -- --clean
```

**Biomes Covered:**
- Amazônia Legal: 50,000 records (208 MB)
- Cerrado: 36,050 records (214 MB)
- Caatinga: 50,000 records (143 MB)
- Mata Atlântica: 50,000 records (167 MB)
- Pampa: 24,865 records (136 MB)
- Pantanal: 5,327 records (33 MB)

**Challenges & Solutions:**

1. **Schema Mismatch (Critical)**
   - **Problem:** Script tried to insert `area_km2`, but DB schema has `area_ha`
   - **Error:** `column "area_km2" of relation "prodes_deforestation" does not exist`
   - **Solution:**
     - Changed column name from `area_km2` → `area_ha`
     - Added conversion: `areaHa = Math.round(areaKm2 * 100)` (1 km² = 100 ha)
     - Changed geometry column from `geom` → `geometry` (actual PostGIS column name)
     - Removed `class_name` and `image_date` (not in current schema)

2. **SQL Query Truncation**
   - **Problem:** Batch size 500 created 20-50 MB SQL queries that got truncated
   - **Error:** Query showed `ST_SetSRID(ST_GeomFromGeoJSON($2565), 432` (cut off mid-SRID)
   - **Solution:** Reduced batch size from 500 → 50 features per INSERT

3. **Bulk INSERT Optimization**
   - **Initial approach:** Individual INSERT + UPDATE per record (too slow)
   - **Failed attempt:** Raw SQL string concatenation (SQL injection risk, truncation)
   - **Final solution:** Drizzle `sql.join()` with parameterized batch INSERT
   ```typescript
   const valuesClauses = batchData.map(item => sql`(
     ${item.year},
     ${item.areaHa},
     ...
     ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326)
   )`);

   await db.execute(sql`
     INSERT INTO prodes_deforestation (...)
     VALUES ${sql.join(valuesClauses, sql`, `)}
   `);
   ```

**Database Schema:**
```sql
CREATE TABLE prodes_deforestation (
  id UUID PRIMARY KEY,
  year INTEGER NOT NULL,
  area_ha INTEGER NOT NULL,  -- Area in hectares (NOT km²)
  state VARCHAR(2),
  municipality VARCHAR(255),
  path_row VARCHAR(10),
  source VARCHAR(50) DEFAULT 'PRODES',
  geometry geometry(MULTIPOLYGON, 4326),  -- PostGIS column
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Performance:**
- Download: 2 minutes for 230K features
- Seed: 58 seconds for 216K records (batch size 50)
- Monthly update: Downloads last 3 years of Amazônia only

---

### CAR (Cadastro Ambiental Rural - SICAR)

**Status:** 🔄 In Progress - 3.5M records (20/27 states), 7 large states remaining

**Data Source:** https://consultapublica.car.gov.br/publico/estados/downloads

**Implementation Files:**
- `scripts/process-car-shapefiles.ts` - Extract ZIPs, convert SHP → GeoJSON
- `scripts/seed-car-optimized-v2.ts` - Batch INSERT with PostGIS
- `scripts/split-large-car-files.ts` - Split files > 512 MB to avoid V8 limits

**Workflow:**
```bash
# 1. Manual download (CAPTCHA-protected portal)
# Download all 27 states from portal to car/ directory

# 2. Convert shapefiles to GeoJSON (12 minutes)
npm run process:car

# 3a. Seed small/medium states (works fine)
npm run seed:car-v2 -- --clean

# 3b. For large states (BA, MG, SP, RS, GO, SC, PR):
npm run split:car -- BA MG SP RS GO SC PR  # Split into chunks
npm run seed:car-v2  # Seed all (including chunks)
```

**Current Status:**
- ✅ Small/medium states: 3,544,068 records (20 states)
- 🔄 Large states: 7 pending (estimated 2-3M more records)
- 📊 Total expected: ~5.5-6M CAR registrations

**Challenges & Solutions:**

1. **CAPTCHA-Protected Downloads**
   - **Problem:** Official portal requires CAPTCHA per state
   - **Failed approach:** WFS API timeouts (5-23 minutes, then fails)
   - **Solution:** Manual download of ZIP files from portal
   - **Tools tried:** GeoServer Layer Preview (also has issues), GitHub SICAR tool

2. **Invalid String Length (V8 Limitation)**
   - **Problem:** Files > 512 MB cannot be loaded as strings in JavaScript
   - **Error:** `"Invalid string length"` when reading large JSON files
   - **Affected states:** BA (1.2 GB), MG (1.2 GB), SP (928 MB), RS (929 MB), GO (610 MB), SC (560 MB), PR (~600 MB)
   - **Solution:** Created `split-large-car-files.ts` to:
     - Read files incrementally using readline
     - Split into chunks of 50K features each
     - Avoids loading entire file into memory

3. **Memory Management**
   - **Problem:** Even with `--max-old-space-size=8192`, 1+ GB files fail
   - **Solution:**
     - Split files before seeding (see above)
     - Use batch INSERT (50 records per batch)
     - Process chunks sequentially

4. **GeoJSON Structure Differences**
   - **Problem:** CAR properties don't match expected schema (no owner info in AREA_IMOVEL layer)
   - **Actual fields:**
     ```json
     {
       "cod_imovel": "AC-1200013-...",  // CAR number
       "num_area": 73.754,              // Area in hectares
       "ind_status": "PE",              // Status (PE/AT/CA/SU)
       "municipio": "Acrelandia",
       "cod_estado": "AC"
     }
     ```
   - **Solution:** Adapted seed script to use available fields, set missing fields to NULL

**Database Schema:**
```sql
CREATE TABLE car_registrations (
  id UUID PRIMARY KEY,
  car_number VARCHAR(50) UNIQUE NOT NULL,  -- cod_imovel
  status VARCHAR(50),                      -- ind_status
  area_ha INTEGER,                         -- num_area
  state VARCHAR(2) NOT NULL,               -- cod_estado
  municipality VARCHAR(255),               -- municipio
  source VARCHAR(50) DEFAULT 'SICAR',
  geometry geometry(MULTIPOLYGON, 4326),   -- PostGIS
  created_at TIMESTAMP DEFAULT NOW()
);
```

**File Sizes:**
- Total: 12 GB GeoJSON (27 states)
- Largest: BA (1.2 GB), MG (1.2 GB)
- Smallest: AP (22 MB)

**Performance:**
- Extract + Convert: ~12 minutes for 27 states
- Seed (20 small/medium): 12 minutes (3.5M records)
- Seed (7 large): TBD after splitting

---

### MapBiomas Alerta (Validated Deforestation)

**Status:** ✅ Complete - 35,447 alerts

**Data Source:** https://plataforma.alerta.mapbiomas.org/api

**Implementation:** Task #4 - Implemented with API pagination

**Challenges:**
- API pagination (5,000 records per request)
- Rate limiting handling
- Date range filtering

---

### ANA Outorgas (Water Use Permits)

**Status:** ✅ Complete - 48,179 permits

**Data Source:** ANA public datasets

**Implementation:** Task #5 - CSV download and processing

---

### Best Practices Discovered

1. **Batch INSERT Pattern (Use for ALL large datasets)**
   ```typescript
   const batchSize = 50;  // Optimal for PostGIS geometries
   const valuesClauses = batch.map(item => sql`(...)`);
   await db.execute(sql`INSERT ... VALUES ${sql.join(valuesClauses, sql`, `)}`);
   ```

2. **Large File Handling**
   - Files < 200 MB: Direct JSON.parse() works
   - Files 200-512 MB: Increase Node memory (`--max-old-space-size=8192`)
   - Files > 512 MB: Split into chunks using streaming readline

3. **PostGIS Geometry**
   - Always use `ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)`
   - NOT `ST_GeomFromText()` with WKT (SQL injection risk)
   - Column name is `geometry`, not `geom`

4. **Schema Verification**
   - ALWAYS check actual DB schema before bulk INSERT
   - Migrations may differ from schema.ts
   - Use `\d table_name` in psql to verify

5. **Area Units**
   - PRODES: km² in source → convert to hectares (×100)
   - CAR: Already in hectares
   - Always store as `area_ha` (integer) for consistency

6. **State Code Normalization**
   - Files may have inconsistent naming (AL-AREA vs AL)
   - Normalize to 2-letter uppercase (AC, AM, BA, etc.)

---

## Common Pitfalls

1. **PostGIS not installed:** Check with `SELECT PostGIS_version();` in psql
2. **Redis connection fails:** Verify `REDIS_URL` and that Redis is running
3. **Timeout errors:** Some PostGIS queries are slow on large datasets - increase `timeout` in checker config
4. **Cache not working:** Ensure `CACHE_ENABLED=true` and Redis is accessible
5. **Migration fails:** Check PostgreSQL user has CREATE privileges
6. **Worker jobs not running:** Ensure `npm run worker` is running (separate from API server)

## Import Paths

This project uses **ES Modules** with `.js` extensions in import paths (TypeScript requirement):
```typescript
import { BaseChecker } from '../base.js';  // NOT '../base.ts'
import { logger } from '../../utils/logger.js';
```

Always include `.js` extension even when importing `.ts` files.
