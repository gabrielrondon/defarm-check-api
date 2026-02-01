# Cron Jobs - Test Results
**Date:** 2026-02-01
**Environment:** Local development + Production Railway

---

## 📋 Jobs Overview

| Job | Frequency | Schedule | Status | Last Tested |
|-----|-----------|----------|--------|-------------|
| check-data-freshness | Daily | 08:00 BRT | ✅ PASS | 2026-02-01 00:40 UTC |
| update-deter | Daily | 03:00 BRT | ⏸️ NOT TESTED | - |
| update-ibama | Weekly (Sun) | 02:00 BRT | ⏸️ NOT TESTED | - |
| update-lista-suja | Monthly (1st) | 02:00 BRT | ⏸️ NOT TESTED | - |
| update-spatial-data | Monthly (1st) | 04:00 BRT | ⏸️ NOT TESTED | - |
| update-car | Monthly (15th) | 03:00 BRT | ⏸️ NOT TESTED | - |

---

## ✅ Test #1: check-data-freshness

**Command:** `npm run cron:check-health`

**Result:** SUCCESS ✅

**Output:**
```
============================================================
Starting data freshness check
============================================================
✅ Lista Suja (FRESH)
✅ IBAMA Embargoes (FRESH)
❌ DETER Alerts (CRITICAL - empty)
✅ Terras Indígenas (FRESH)
❌ Unidades de Conservação (CRITICAL - empty)
❌ CAR (CRITICAL - empty)
============================================================
Freshness Summary:
- Total: 6 sources
- Fresh: 3
- Stale: 0
- Critical: 3
============================================================
```

**Exit Code:** 2 (indicates CRITICAL sources exist)

**Notes:**
- Job executes successfully
- Correctly identifies empty tables as CRITICAL
- Exit code properly reflects data status
- Logging works correctly

**Data Status:**
- ✅ Lista Suja: 664 records (fresh)
- ✅ IBAMA Embargoes: 122,821 records (fresh)
- ❌ DETER Alerts: 0 records (empty - API was failing)
- ✅ Terras Indígenas: ? records (shows as fresh - investigate)
- ❌ Unidades de Conservação: 0 records (empty - API was failing)
- ❌ CAR: 0 records (not downloaded yet)

---

## 🔧 Fixes Applied

### ES Module Compatibility
- **Issue:** All cron scripts used `require.main === module` which doesn't work in ES modules
- **Fix:** Changed to `if (import.meta.url === \`file://${process.argv[1]}\`)`
- **Files Fixed:**
  - scripts/cron/check-data-freshness.ts
  - scripts/cron/update-car.ts
  - scripts/cron/update-spatial-data.ts
  - scripts/cron/update-deter.ts
  - scripts/cron/update-ibama.ts
  - scripts/cron/update-lista-suja.ts

---

## 🚀 Production Deployment Status

**Health Check Endpoint:**
```bash
curl https://defarm-check-api-production.up.railway.app/health
```

**Current Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-01T00:40:12.942Z",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "redis": "ok"
  }
}
```

**After Next Deployment (pending):**
```json
{
  "status": "ok",
  "timestamp": "...",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "redis": "ok"
  },
  "dataSources": [
    {
      "name": "Slave Labor Registry",
      "lastUpdated": "2026-01-28T...",
      "hoursSinceUpdate": 96,
      "freshnessStatus": "fresh",
      "totalRecords": 664
    },
    ...
  ],
  "tableCounts": {
    "lista_suja": 664,
    "ibama_embargoes": 122821,
    ...
  }
}
```

---

## 📝 Next Steps

1. ✅ Fix ES module compatibility in cron scripts
2. ⏸️ Test remaining jobs individually:
   - update-deter (⚠️ API was failing - will test with retry logic)
   - update-ibama (should work)
   - update-lista-suja (should work)
   - update-spatial-data (⚠️ APIs were failing)
   - update-car (⚠️ not downloaded yet)
3. ⏸️ Commit and deploy changes to Railway
4. ⏸️ Test health check endpoint in production with new data freshness info
5. ⏸️ Monitor worker logs in Railway to verify jobs run automatically

---

## ⚠️ Known Issues

1. **DETER Alerts Empty:** Government API was returning 400 errors. Retry logic will handle automatically.
2. **Unidades de Conservação Empty:** ICMBio API was failing. Retry logic will handle.
3. **CAR Empty:** Data not downloaded yet (Task #10).
4. **Terras Indígenas Shows as Fresh:** Need to investigate if data was seeded previously or if there's a bug.

---

## 🎯 Worker Execution in Production

All jobs are scheduled via node-cron in the worker service:

```typescript
// src/worker/index.ts
cron.schedule('0 3 * * *', updateDETER);           // Daily 03:00 BRT
cron.schedule('0 8 * * *', checkDataFreshness);    // Daily 08:00 BRT
cron.schedule('0 2 * * 0', updateIbama);           // Weekly Sun 02:00 BRT
cron.schedule('0 2 1 * *', updateListaSuja);       // Monthly 1st, 02:00 BRT
cron.schedule('0 4 1 * *', updateSpatialData);     // Monthly 1st, 04:00 BRT
cron.schedule('0 3 15 * *', updateCAR);            // Monthly 15th, 03:00 BRT
```

**Timezone:** America/Sao_Paulo (configured via TZ env var)

**Next Scheduled Executions:**
- Today 03:00 BRT: update-deter
- Today 08:00 BRT: check-data-freshness
- Tomorrow 03:00 BRT: update-deter
- Sunday 02:00 BRT: update-ibama
- March 1st 02:00 BRT: update-lista-suja
- March 1st 04:00 BRT: update-spatial-data
- February 15th 03:00 BRT: update-car

---

## 🔍 Testing Methodology

For each job:
1. Run locally: `npm run cron:test-<job-name>`
2. Verify exit code (0 = success, non-zero = failure)
3. Check logs for errors
4. Verify database was updated correctly
5. Verify Telegram notifications were sent (if applicable)
6. Verify cache invalidation worked
7. Verify data source freshness was updated

**Note:** Jobs that download data from government APIs may fail if APIs are offline. This is expected and handled by retry logic.
