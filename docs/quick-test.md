# Quick Test Guide - Check API

## 🏃 Teste Rápido (Sem DB/Redis)

Se você não tem PostgreSQL ou Redis rodando localmente, pode testar a API de forma simplificada:

### 1. Comentar imports do DB no orchestrator

Temporariamente comente as linhas de persistência no `src/services/orchestrator.ts`:

```typescript
// Comentar linha ~88:
// this.persistCheck(checkId, normalizedInput, response).catch(err => {
//   logger.error({ err }, 'Failed to persist check');
// });
```

### 2. Comentar Redis no cache

Em `src/services/cache.ts`, você pode desabilitar Redis setando `CACHE_ENABLED=false` no `.env`

### 3. Rodar apenas os checkers

```bash
npm run dev
```

Agora você pode testar a API mesmo sem infraestrutura!

---

## 🧪 Testando com cURL

### 1. Health Check

```bash
curl http://localhost:3000/health
```

**Resposta esperada:**
```json
{
  "status": "degraded",
  "timestamp": "2026-01-28T...",
  "version": "1.0.0",
  "services": {
    "database": "down",
    "redis": "down"
  }
}
```

### 2. Listar Fontes

```bash
curl http://localhost:3000/sources
```

**Resposta esperada:**
```json
[
  {
    "name": "Slave Labor Registry",
    "category": "social",
    "enabled": true,
    "status": "operational",
    "description": "Verifica se CNPJ/CPF está na Lista Suja..."
  },
  ...
]
```

### 3. Executar Check - CNPJ PASS

```bash
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "00.000.000/0001-00"
    }
  }'
```

**Resposta esperada:**
```json
{
  "checkId": "chk_...",
  "verdict": "COMPLIANT",
  "score": 100,
  "sources": [
    {
      "name": "Slave Labor Registry",
      "category": "social",
      "status": "PASS",
      "message": "Not found in slave labor registry",
      ...
    },
    {
      "name": "CAR Registry",
      "category": "environmental",
      "status": "PASS",
      ...
    }
  ],
  "summary": {
    "totalCheckers": 3,
    "passed": 2,
    "failed": 0,
    "warnings": 1
  }
}
```

### 4. Executar Check - CNPJ FAIL (Mock)

```bash
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12.345.678/0001-90"
    }
  }'
```

**Resposta esperada:**
```json
{
  "checkId": "chk_...",
  "verdict": "NON_COMPLIANT",
  "score": 33,
  "sources": [
    {
      "name": "Slave Labor Registry",
      "status": "FAIL",
      "severity": "CRITICAL",
      "message": "Found in slave labor registry",
      ...
    },
    {
      "name": "CAR Registry",
      "status": "PASS",
      ...
    }
  ]
}
```

### 5. Executar Check - Coordenadas (Deforestation)

```bash
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": {
        "lat": -10.5,
        "lon": -55.2
      }
    }
  }'
```

**Resposta esperada:**
```json
{
  "checkId": "chk_...",
  "verdict": "NON_COMPLIANT",
  "score": 0,
  "sources": [
    {
      "name": "PRODES Deforestation",
      "status": "FAIL",
      "severity": "HIGH",
      "message": "Deforestation detected: 15.3ha in 2024",
      "details": {
        "area_ha": 15.3,
        "year": 2024
      },
      ...
    }
  ]
}
```

### 6. Testar Cache

Execute o mesmo request duas vezes:

```bash
# Primeira vez (cached: false, demora ~300ms)
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{"input": {"type": "CNPJ", "value": "12.345.678/0001-90"}}'

# Segunda vez (cached: true, demora ~5ms)
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{"input": {"type": "CNPJ", "value": "12.345.678/0001-90"}}'
```

Note o campo `"cached": true` nos sources e `"cacheHitRate"` nos metadata.

---

## 🐳 Com Infraestrutura (Docker Compose - em breve)

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgis/postgis:15-3.3
    environment:
      POSTGRES_DB: check_api
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

```bash
docker-compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

---

## 📊 Swagger UI

Acesse `http://localhost:3000/docs` para interface interativa!

Você pode testar todos os endpoints diretamente pelo navegador.

---

## 🎯 Próximos Passos

1. **Adicionar checkers reais**: Conectar APIs reais (INPE, MTE, SICAR)
2. **Autenticação**: Adicionar API keys
3. **Webhooks**: Notificações quando check completa
4. **Bulk checks**: Upload CSV para verificar múltiplas entidades
5. **Dashboard**: Interface visual para gerenciar checks
