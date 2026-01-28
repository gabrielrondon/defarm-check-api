# 🚀 Getting Started - Check API

## ✅ O que foi implementado

A **Check API** está 100% funcional com a seguinte arquitetura:

### Core Features
- ✅ API REST com Fastify (3x mais rápida que Express)
- ✅ TypeScript com type-safety completo
- ✅ 3 Checkers funcionais (mock data):
  - Slave Labor Registry (MTE)
  - CAR Registry (SICAR)
  - PRODES Deforestation (INPE)
- ✅ Sistema de cache com Redis
- ✅ Validação de inputs com Zod
- ✅ Logging estruturado (Pino)
- ✅ Documentação Swagger automática
- ✅ Rate limiting
- ✅ Security headers (Helmet, CORS)
- ✅ Orchestrator paralelo (executa todos checkers simultaneamente)
- ✅ Sistema de veredito com scoring (0-100)
- ✅ Database schema (Drizzle ORM) - pronto para uso

### Arquivos Principais
```
├── arquitetura_inicial.md       # Documentação completa da arquitetura
├── src/
│   ├── index.ts                 # Entry point
│   ├── api/
│   │   ├── server.ts            # Fastify app
│   │   ├── routes/              # Routes (check, sources, health)
│   │   └── plugins/             # Security, Swagger
│   ├── checkers/                # Checkers modulares
│   │   ├── base.ts              # Base class
│   │   ├── registry.ts          # Auto-registry
│   │   ├── environmental/       # CAR, Deforestation
│   │   └── social/              # Slave Labor
│   ├── services/
│   │   ├── orchestrator.ts      # Coordena checks
│   │   ├── cache.ts             # Redis service
│   │   └── verdict.ts           # Calcula score/veredito
│   ├── db/                      # Database schema
│   └── types/                   # TypeScript types
├── docs/
│   ├── quick-test.md            # Guia de teste rápido
│   └── adding-checkers.md       # Como adicionar checkers
└── test-api.sh                  # Script de teste
```

---

## 🏃 Quick Start (Sem DB)

A API funciona **sem PostgreSQL/Redis** usando:
- In-memory rate limiting
- Cache desabilitado (ou Redis se disponível)
- Checkers com mock data

### 1. Instalar dependências
```bash
cd ~/defarm/check
npm install
```

### 2. Iniciar servidor
```bash
npm run dev
```

Você verá:
```
✅ Checker registered: Slave Labor Registry
✅ Checker registered: CAR Registry
✅ Checker registered: PRODES Deforestation
✅ Redis connected
✅ Server listening on http://0.0.0.0:3000
✅ Docs available at http://0.0.0.0:3000/docs
```

### 3. Testar API

**Abrir Swagger UI:**
```
http://localhost:3000/docs
```

**Ou via cURL:**
```bash
# Health check
curl http://localhost:3000/health

# Listar fontes
curl http://localhost:3000/sources

# Check CNPJ válido
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "00.000.000/0001-00"
    }
  }'

# Check CNPJ com problemas (mock)
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12.345.678/0001-90"
    }
  }'

# Check coordenadas (desmatamento)
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

**Ou rodar script de teste:**
```bash
chmod +x test-api.sh
./test-api.sh
```

---

## 📊 Exemplo de Resposta

```json
{
  "checkId": "chk_abc123",
  "verdict": "NON_COMPLIANT",
  "score": 45,
  "timestamp": "2026-01-28T21:00:00.000Z",
  "sources": [
    {
      "name": "Slave Labor Registry",
      "category": "social",
      "status": "FAIL",
      "severity": "CRITICAL",
      "message": "Found in slave labor registry",
      "details": {
        "source": "MTE - Lista Suja do Trabalho Escravo",
        "foundAt": "2026-01-28T21:00:00.000Z"
      },
      "evidence": {
        "dataSource": "Ministério do Trabalho e Emprego",
        "url": "https://www.gov.br/...",
        "lastUpdate": "2026-01-15"
      },
      "cached": false,
      "executionTimeMs": 102
    },
    {
      "name": "CAR Registry",
      "category": "environmental",
      "status": "PASS",
      "message": "CAR is active with no pendencies",
      "cached": false,
      "executionTimeMs": 152
    }
  ],
  "summary": {
    "totalCheckers": 3,
    "passed": 1,
    "failed": 1,
    "warnings": 1
  },
  "metadata": {
    "processingTimeMs": 305,
    "cacheHitRate": 0,
    "apiVersion": "1.0.0",
    "timestamp": "2026-01-28T21:00:00.000Z"
  }
}
```

---

## 🎯 Próximos Passos

### 1. Adicionar Checkers Reais

Editar checkers existentes para usar APIs reais:

**Exemplo: Slave Labor (MTE)**
```typescript
// src/checkers/social/slave-labor.ts
async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
  // Substituir mock por API real
  const response = await axios.get('https://api.mte.gov.br/lista-suja', {
    params: { cnpj: input.value }
  });

  // Processar resposta real
  const isInList = response.data.some(item => item.cnpj === input.value);
  // ...
}
```

Ver `docs/adding-checkers.md` para guia completo.

### 2. Setup PostgreSQL (Opcional)

```bash
# Com Docker
docker run -d \
  --name check-postgres \
  -e POSTGRES_DB=check_api \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgis/postgis:15-3.3

# Atualizar .env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/check_api

# Rodar migrations
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 3. Setup Redis (Opcional)

```bash
# Com Docker
docker run -d \
  --name check-redis \
  -p 6379:6379 \
  redis:7-alpine

# Já configurado no .env
REDIS_URL=redis://localhost:6379
```

### 4. Adicionar Dados Geoespaciais

Para PRODES/DETER funcionar com dados reais:

```sql
-- Em PostgreSQL com PostGIS
CREATE EXTENSION postgis;

CREATE TABLE prodes_deforestation (
  id SERIAL PRIMARY KEY,
  geometry GEOMETRY(POLYGON, 4326),
  area_ha NUMERIC,
  year INT,
  source VARCHAR(50)
);

CREATE INDEX idx_prodes_geometry
  ON prodes_deforestation
  USING GIST(geometry);
```

Importar dados: http://terrabrasilis.dpi.inpe.br/download/dataset/

### 5. Implementar Autenticação

```typescript
// src/api/plugins/auth.ts
export async function authPlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || !isValidApiKey(apiKey)) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing API key'
      });
    }
  });
}
```

### 6. Deploy

**Vercel/Railway/Fly.io:**
```bash
# Build
npm run build

# Start
npm start

# Ou Docker (criar Dockerfile)
docker build -t check-api .
docker run -p 3000:3000 check-api
```

---

## 📚 Documentação

- **Arquitetura**: `arquitetura_inicial.md`
- **Testes rápidos**: `docs/quick-test.md`
- **Adicionar checkers**: `docs/adding-checkers.md`
- **API Docs**: `http://localhost:3000/docs` (Swagger)
- **README**: `README.md`

---

## 🔧 Comandos Úteis

```bash
# Desenvolvimento
npm run dev              # Inicia com hot reload

# Build
npm run build            # Compila TypeScript

# Produção
npm start                # Inicia versão compilada

# Database
npm run db:generate      # Gera migrations
npm run db:migrate       # Roda migrations
npm run db:seed          # Popula checker_sources

# Qualidade
npm run lint             # Lint
npm run format           # Format com Prettier
npm test                 # Testes (Vitest)
```

---

## 🐛 Troubleshooting

### "EADDRINUSE: port 3000"
```bash
lsof -ti:3000 | xargs kill -9
```

### Redis não conecta
```bash
# Verificar se Redis está rodando
redis-cli ping

# Ou desabilitar cache
CACHE_ENABLED=false npm run dev
```

### Postgres não conecta
```bash
# Verificar conexão
psql postgresql://postgres:postgres@localhost:5432/check_api

# Ou comentar persistência no orchestrator (linha 88)
```

---

## 🎉 Está tudo pronto!

A API está **100% funcional** e pronta para:
- ✅ Receber requests de compliance check
- ✅ Executar múltiplos checkers em paralelo
- ✅ Cachear resultados (com Redis)
- ✅ Retornar veredito agregado com score
- ✅ Documentar automaticamente (Swagger)
- ✅ Ser estendida com novos checkers facilmente

**Próximo passo:** Conectar APIs reais e integrar com o ecossistema DeFarm!

---

**Dúvidas?** Ver `README.md` ou documentação em `docs/`
