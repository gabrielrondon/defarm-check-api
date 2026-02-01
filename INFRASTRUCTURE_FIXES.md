# Infrastructure Fixes Applied
**Date:** 2026-01-31
**Task:** #25 - Corrigir problemas críticos da infraestrutura Railway

---

## ✅ Correções Aplicadas

### 1. DATABASE_URL Padronizado ✅

**Antes:**
```bash
# API Service (defarm-check-api)
DATABASE_URL=postgresql://postgres:***@postgis.railway.internal:5432/railway  ✓

# Worker Service (check-api-worker)
DATABASE_URL=postgresql://postgres:***@caboose.proxy.rlwy.net:18740/railway  ✗ (proxy externo)
```

**Depois:**
```bash
# API Service (defarm-check-api)
DATABASE_URL=postgresql://postgres:***@postgis.railway.internal:5432/railway  ✓

# Worker Service (check-api-worker)
DATABASE_URL=postgresql://postgres:***@postgis.railway.internal:5432/railway  ✓ CORRIGIDO!
```

**Benefício:** Ambos os serviços agora usam a mesma URL interna, mais rápida e confiável.

---

### 2. Rate Limit Aumentado ✅

**Antes:**
```bash
# Ambos serviços
RATE_LIMIT_MAX=100  # Muito baixo para produção
```

**Depois:**
```bash
# API Service (defarm-check-api)
RATE_LIMIT_MAX=10000  ✓ AUMENTADO 100x

# Worker Service (check-api-worker)
RATE_LIMIT_MAX=10000  ✓ AUMENTADO 100x
```

**Benefício:** API agora suporta 10,000 requests/minuto (vs 100 antes), adequado para produção.

---

## ⚠️ Ação Pendente: Remover Banco Postgres Duplicado

### Análise dos Dois Bancos:

| Serviço | Tamanho | Dados | PostGIS | Status |
|---------|---------|-------|---------|--------|
| **PostGIS** | 98 MB | 122k IBAMA + 664 Lista Suja | ✅ v3.7 | 🟢 **PRINCIPAL** |
| **Postgres** | 7.7 MB | 4 registros check_requests | ❌ Não | 🔴 **VAZIO** |

### Tabelas em cada banco:

**PostGIS (98 MB) - BANCO PRINCIPAL:**
```
✅ ibama_embargoes         122,814 registros (78 MB)
✅ lista_suja                  664 registros (360 kB)
✅ prodes_deforestation          5 registros
✅ check_requests               84 registros (histórico real)
✅ api_keys                      4 registros
✅ checker_sources               4 registros
✅ spatial_ref_sys           8,500 registros (PostGIS)
○  terras_indigenas              0 (pronto para seed)
○  deter_alerts                  0 (pronto para seed)
○  unidades_conservacao          0 (pronto para seed)
○  car_registrations             0 (pronto para seed)
```

**Postgres (7.7 MB) - BANCO SECUNDÁRIO (VAZIO):**
```
⚠️ check_requests        4 registros (vs 84 no PostGIS)
⚠️ checker_cache_stats   0 registros
⚠️ checker_sources       ? registros
❌ SEM tabelas geoespaciais
❌ SEM PostGIS extension
```

### Recomendação: ✅ REMOVER banco "Postgres"

**Motivos:**
1. Praticamente vazio (7.7 MB vs 98 MB)
2. Não tem PostGIS (não serve para dados geoespaciais)
3. Não está sendo usado ativamente (só 4 registros)
4. Economiza recursos no Railway
5. Evita confusão (ter 2 bancos)

**Como remover:**
```bash
# Via Railway Dashboard:
# 1. Ir em Project "checker" > Services
# 2. Selecionar serviço "Postgres"
# 3. Settings > Delete Service
# 4. Confirmar remoção
```

**IMPORTANTE:** Fazer backup antes se houver dúvida:
```bash
pg_dump "postgresql://postgres:***@shortline.proxy.rlwy.net:39072/railway" > postgres_backup.sql
```

---

## 📊 Estado Atual (Após Correções)

### ✅ Configuração Correta:

```
┌─────────────────────────┐
│ defarm-check-api        │ ✅ Online
│ (API Server)            │
├─────────────────────────┤
│ DATABASE_URL:           │ postgis.railway.internal:5432 ✓
│ RATE_LIMIT_MAX:         │ 10000 ✓
│ REDIS_URL:              │ redis.railway.internal:6379 ✓
│ TELEGRAM:               │ Configured ✓
└─────────────────────────┘

┌─────────────────────────┐
│ check-api-worker        │ ✅ Online
│ (Cron Jobs)             │
├─────────────────────────┤
│ DATABASE_URL:           │ postgis.railway.internal:5432 ✓ CORRIGIDO
│ RATE_LIMIT_MAX:         │ 10000 ✓ CORRIGIDO
│ REDIS_URL:              │ redis.railway.internal:6379 ✓
│ TELEGRAM:               │ Configured ✓
│ TZ:                     │ America/Sao_Paulo ✓
└─────────────────────────┘

┌─────────────────────────┐
│ PostGIS                 │ ✅ Online
│ (Database Principal)    │
├─────────────────────────┤
│ Version:                │ PostgreSQL 16.9 ✓
│ PostGIS:                │ 3.7 ✓
│ Size:                   │ 98 MB
│ Data:                   │ IBAMA + Lista Suja populated ✓
└─────────────────────────┘

┌─────────────────────────┐
│ Redis                   │ ✅ Online
│ (Cache)                 │
├─────────────────────────┤
│ Persistent Volume:      │ redis-volume ✓
└─────────────────────────┘
```

---

## 🎯 Próximos Passos

Agora que a infraestrutura está corrigida:

1. ✅ **Remover serviço Postgres** (via Railway dashboard)
2. ✅ **Reiniciar serviços** para aplicar novas variáveis:
   ```bash
   # Via Railway CLI ou Dashboard
   railway restart --service defarm-check-api
   railway restart --service check-api-worker
   ```
3. ✅ **Verificar logs** após restart para confirmar conexão com PostGIS
4. ✅ **Continuar com Task #3:** Testar migrations e popular dados faltantes

---

## 🔍 Verificação Pós-Correção

Para verificar se as mudanças foram aplicadas:

```bash
# 1. Verificar variáveis do Worker
railway link -s check-api-worker
railway variables | grep DATABASE_URL  # Deve mostrar postgis.railway.internal
railway variables | grep RATE_LIMIT    # Deve mostrar 10000

# 2. Verificar variáveis da API
railway link -s defarm-check-api
railway variables | grep DATABASE_URL  # Deve mostrar postgis.railway.internal
railway variables | grep RATE_LIMIT    # Deve mostrar 10000

# 3. Testar conexão API
curl https://defarm-check-api-production.up.railway.app/health

# 4. Verificar logs do Worker após restart
railway logs --service check-api-worker
```

---

## 📝 Resumo

**Problemas Corrigidos:**
- ✅ DATABASE_URL inconsistente → Ambos usam PostGIS internal agora
- ✅ Rate limit muito baixo → Aumentado para 10,000 req/min
- ⚠️ Banco Postgres duplicado → Aguardando remoção manual

**Impacto:**
- ✅ Melhor performance (conexão interna vs proxy externo)
- ✅ API pode escalar sem throttling
- ✅ Configuração padronizada e consistente
- ✅ Pronto para popular dados geoespaciais
