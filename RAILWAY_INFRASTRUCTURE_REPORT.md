# Railway Infrastructure Report
**Generated:** 2026-01-31
**Project:** checker (54217b47-61c5-4dcf-ae17-2ec0c7a249f0)
**Environment:** production

---

## 🏗️ Architecture Overview

```
┌─────────────────────┐
│ defarm-check-api    │ ✅ Online
│ (API Server)        │ Port: 3000
└──────────┬──────────┘
           │
           ├──────────► Redis (✅ Online)
           │            └─ redis-volume (persistent)
           │
           └──────────► PostGIS (✅ Online)
                        └─ postgis-volume (persistent)

┌─────────────────────┐
│ check-api-worker    │ ✅ Online
│ (Cron Jobs)         │ TZ: America/Sao_Paulo
└──────────┬──────────┘
           │
           ├──────────► Redis (✅ Online)
           │
           └──────────► PostGIS (✅ Online)
```

**✅ EXCELLENT:** Worker and API are in **separate services** - this is the correct architecture!

---

## 📊 Database Status

### PostgreSQL (PostGIS)
- **Version:** PostgreSQL 16.9
- **PostGIS Version:** 3.7 (USE_GEOS=1 USE_PROJ=1 USE_STATS=1) ✅
- **Total Size:** 98 MB
- **SSL:** Enabled ✅
- **Internal URL:** `postgis.railway.internal:5432`
- **External URL:** `caboose.proxy.rlwy.net:18740`

### Data Population Status

| Table | Records | Size | Status | Expected |
|-------|---------|------|--------|----------|
| **ibama_embargoes** | 122,814 | 78 MB | ✅ **POPULATED** | ~65k-120k |
| **lista_suja** | 664 | 360 kB | ✅ **POPULATED** | ~678 |
| **prodes_deforestation** | 5 | 48 kB | ✅ **SAMPLE** | 5 samples |
| **check_requests** | 84 | 248 kB | ✅ **ACTIVE** | Historical data |
| **api_keys** | 4 | 96 kB | ✅ **CONFIGURED** | Active keys |
| **checker_sources** | 4 | 48 kB | ✅ **CONFIGURED** | Metadata |
| **terras_indigenas** | 0 | 48 kB | ❌ **EMPTY** | ~574 TIs |
| **deter_alerts** | 0 | 48 kB | ❌ **EMPTY** | Last 30 days |
| **unidades_conservacao** | 0 | 48 kB | ❌ **EMPTY** | ~2,446 UCs |
| **car_registrations** | 0 | 64 kB | ❌ **EMPTY** | Priority states |

### Redis
- **Status:** ✅ Online
- **Internal URL:** `redis.railway.internal:6379`
- **Persistent Volume:** redis-volume ✅

---

## 🔧 Service Configuration

### defarm-check-api (API)

**Environment Variables:**
```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://postgres:***@postgis.railway.internal:5432/railway

# Redis
REDIS_URL=redis://default:***@redis.railway.internal:6379
REDIS_PASSWORD=***

# Cache
CACHE_ENABLED=true
DEFAULT_CACHE_TTL=3600

# Security
API_SECRET=*** (configured)
RATE_LIMIT_MAX=100  ⚠️ LOW (recommended: 10000)
RATE_LIMIT_WINDOW=60000

# Logging
LOG_LEVEL=info
LOG_PRETTY=false

# Telegram
TELEGRAM_BOT_TOKEN=*** ✅
TELEGRAM_CHAT_ID=459514238 ✅

# Railway
RAILWAY_PUBLIC_DOMAIN=defarm-check-api-production.up.railway.app ✅
```

### check-api-worker (Worker)

**Environment Variables:**
```bash
NODE_ENV=production
TZ=America/Sao_Paulo ✅ CRITICAL for cron jobs!

# Database (⚠️ DIFFERENT from API)
DATABASE_URL=postgresql://postgres:***@caboose.proxy.rlwy.net:18740/railway

# Redis (same as API)
REDIS_URL=redis://default:***@redis.railway.internal:6379

# Cache
CACHE_ENABLED=true
DEFAULT_CACHE_TTL=3600

# Telegram
TELEGRAM_BOT_TOKEN=*** ✅
TELEGRAM_CHAT_ID=459514238 ✅
```

---

## ⚠️ Critical Findings

### 🔴 HIGH PRIORITY

1. **Different DATABASE_URLs between API and Worker**
   - **API:** `postgis.railway.internal:5432` (internal)
   - **Worker:** `caboose.proxy.rlwy.net:18740` (external proxy)
   - **Impact:** Both seem to connect to same database, but inconsistent configuration
   - **Recommendation:** Standardize both to use `postgis.railway.internal:5432`

2. **Rate Limit Too Low**
   - **Current:** 100 req/min
   - **Recommended:** 10,000 req/min (per API key)
   - **Impact:** Production traffic will be throttled unnecessarily

3. **Missing Data Sources** (Priority for seeding):
   - ❌ Terras Indígenas (FUNAI) - 0 records (expected ~574)
   - ❌ DETER Alerts (INPE) - 0 records (should have last 30 days)
   - ❌ Unidades de Conservação (ICMBio) - 0 records (expected ~2,446)
   - ❌ CAR Registry (SICAR) - 0 records (priority states)

### 🟡 MEDIUM PRIORITY

4. **Two PostgreSQL Services**
   - Screenshot shows both "PostGIS" and "Postgres" services
   - Only PostGIS is being used
   - **Recommendation:** Remove unused "Postgres" service to save resources

5. **No Resource Limits Documented**
   - Railway doesn't expose memory/CPU limits via CLI
   - **Recommendation:** Check Railway dashboard for plan limits

---

## ✅ What's Working Well

1. ✅ **Worker is separated from API** - Excellent architecture!
2. ✅ **PostGIS 3.7 installed** - Latest version with full geospatial support
3. ✅ **SSL enabled** - Secure connections
4. ✅ **Timezone configured** - America/Sao_Paulo for cron jobs
5. ✅ **Telegram configured** - Bot notifications ready
6. ✅ **Redis with persistent volume** - Cache won't be lost on restarts
7. ✅ **Lista Suja populated** - 664 records (core data source working)
8. ✅ **IBAMA populated** - 122k records (massive dataset working)
9. ✅ **API keys created** - 4 active keys
10. ✅ **Checker sources configured** - Metadata in place

---

## 📈 Storage Capacity

**Current Usage:** 98 MB / ? GB available

**Projected after full seeding:**
- Terras Indígenas: +44 MB (geometries)
- DETER Alerts (30 days): +5-10 MB
- Unidades de Conservação: +20-30 MB
- CAR (4 priority states): +100-500 MB (unknown, needs testing)

**Total Estimated:** 250-650 MB

**Recommendation:** Verify Railway plan supports at least 1 GB database storage.

---

## 🎯 Next Steps (Task Priority)

1. **Task #3:** Test migrations (verify all tables/indexes exist)
2. **Task #4-7:** Seed missing data (Terras Indígenas, DETER, UCs, CAR)
3. **Fix DATABASE_URL inconsistency** (standardize both services)
4. **Increase RATE_LIMIT_MAX** to 10000 via Railway dashboard
5. **Remove unused "Postgres" service** if not needed
6. **Task #8:** Benchmark queries with real geospatial data

---

## 🔍 Verification Commands

```bash
# Check PostGIS version
psql "$DATABASE_URL" -c "SELECT PostGIS_version();"

# Check database size
psql "$DATABASE_URL" -c "SELECT pg_size_pretty(pg_database_size('railway'));"

# Count records in each table
psql "$DATABASE_URL" -c "
  SELECT
    'lista_suja' as source, COUNT(*) as records FROM lista_suja
  UNION ALL
  SELECT 'ibama_embargoes', COUNT(*) FROM ibama_embargoes
  UNION ALL
  SELECT 'terras_indigenas', COUNT(*) FROM terras_indigenas
  UNION ALL
  SELECT 'deter_alerts', COUNT(*) FROM deter_alerts
  UNION ALL
  SELECT 'unidades_conservacao', COUNT(*) FROM unidades_conservacao
  UNION ALL
  SELECT 'car_registrations', COUNT(*) FROM car_registrations;
"

# Test API health
curl https://defarm-check-api-production.up.railway.app/health

# Test Redis (from Railway network)
redis-cli -u "$REDIS_URL" ping
```

---

## 📝 Notes

- Railway CLI version: 4.6.3
- Project linked successfully to local environment
- All services show "Online" status in dashboard
- Worker process is running (separate from API) ✅
- Cron jobs will execute in America/Sao_Paulo timezone ✅
