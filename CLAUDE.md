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
