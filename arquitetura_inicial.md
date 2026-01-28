# Check API - Arquitetura Inicial
## DeFarm Compliance Socioambiental

**Data**: 2026-01-28
**Versão**: 1.0
**Autor**: Sistema de Arquitetura DeFarm

---

## 📋 Visão Geral

O **Check API** é um sistema de compliance socioambiental que agrega múltiplas fontes de dados públicos e privados para verificar se produtores, propriedades, animais ou produtos estão em conformidade com regulamentações ambientais, sociais e trabalhistas.

### Objetivo
Fornecer um **veredito automatizado** sobre a conformidade de uma entidade (identificada por CNPJ, CPF, CAR, IE, etc.) através da consulta paralela a múltiplas fontes de dados.

---

## 🏗️ Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                               │
│  (defarm-core, defarm-app, external partners)                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      CHECK API                               │
│                    (Fastify + TS)                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              API ROUTES                               │  │
│  │  POST /check         - Nova verificação               │  │
│  │  GET  /checks/:id    - Histórico                      │  │
│  │  GET  /sources       - Status das fontes              │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│                         ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           ORCHESTRATOR SERVICE                        │  │
│  │  - Valida input (Zod)                                 │  │
│  │  - Normaliza dados                                    │  │
│  │  - Executa checkers em paralelo                       │  │
│  │  - Agrega resultados                                  │  │
│  │  - Calcula veredito final                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│         ┌───────────────┼───────────────┐                  │
│         ▼               ▼               ▼                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐              │
│  │ Checker  │   │ Checker  │   │ Checker  │   ...        │
│  │   #1     │   │   #2     │   │   #N     │              │
│  └──────────┘   └──────────┘   └──────────┘              │
│       │              │              │                      │
│       ▼              ▼              ▼                      │
│  ┌──────────────────────────────────────┐                │
│  │         CACHE LAYER (Redis)          │                │
│  └──────────────────────────────────────┘                │
└─────────────────────────┬──────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌─────────┐   ┌──────────┐   ┌──────────┐
    │ PRODES/ │   │  Lista   │   │  SICAR   │
    │  DETER  │   │  Suja    │   │   CAR    │
    │ (INPE)  │   │  (MTE)   │   │          │
    └─────────┘   └──────────┘   └──────────┘
         ...    Fontes Públicas    ...
```

---

## 🔄 Fluxo de Dados

### 1. Recebimento de Request
```typescript
POST /check
{
  "input": {
    "type": "CNPJ",  // CNPJ | CPF | CAR | IE | COORDINATES
    "value": "12.345.678/0001-90"
  },
  "options": {
    "sources": ["all"],  // ou ["deforestation", "slave_labor"]
    "useCache": true,
    "includeEvidence": true
  }
}
```

### 2. Orquestração Paralela
```typescript
// Orchestrator executa todos os checkers em paralelo
Promise.all([
  deforestationChecker.check(normalizedInput),
  slaveLaborChecker.check(normalizedInput),
  carChecker.check(normalizedInput),
  ibamaEmbargoesChecker.check(normalizedInput),
  // ... N checkers
])
```

### 3. Agregação de Resultados
```typescript
{
  "checkId": "chk_abc123",
  "input": { "type": "CNPJ", "value": "12.345.678/0001-90" },
  "timestamp": "2026-01-28T22:00:00Z",

  // Veredito agregado
  "verdict": "NON_COMPLIANT", // COMPLIANT | NON_COMPLIANT | PARTIAL | UNKNOWN
  "score": 45, // 0-100 (média ponderada por severidade)

  // Resultados por fonte
  "sources": [
    {
      "name": "PRODES Deforestation",
      "category": "environmental",
      "status": "FAIL",
      "severity": "HIGH",
      "message": "Detected 15ha deforestation in 2024",
      "details": {
        "year": 2024,
        "area_ha": 15.3,
        "coordinates": [...]
      },
      "evidence": {
        "dataSource": "INPE PRODES 2024",
        "url": "https://...",
        "lastUpdate": "2025-08-01"
      },
      "cached": false,
      "executionTimeMs": 450
    },
    {
      "name": "Slave Labor Registry",
      "category": "social",
      "status": "PASS",
      "severity": null,
      "message": "Not found in slave labor registry",
      "cached": true,
      "executionTimeMs": 5
    }
    // ...
  ],

  "summary": {
    "totalCheckers": 8,
    "passed": 5,
    "failed": 2,
    "warnings": 1,
    "errors": 0
  },

  "metadata": {
    "processingTimeMs": 1234,
    "cacheHitRate": 0.375,
    "apiVersion": "1.0.0"
  }
}
```

---

## 🧩 Componentes Principais

### 1. Checkers (Modular)

Cada checker implementa a interface base:

```typescript
interface BaseChecker {
  name: string;
  category: CheckerCategory; // 'environmental' | 'social' | 'legal'
  priority: number; // 1-10 (para ordenação)
  cacheTTL: number; // segundos

  check(input: NormalizedInput): Promise<CheckerResult>;
}

interface CheckerResult {
  status: 'PASS' | 'FAIL' | 'WARNING' | 'ERROR' | 'NOT_APPLICABLE';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  details?: Record<string, any>;
  evidence?: Evidence;
  executionTimeMs: number;
  cached: boolean;
}
```

### 2. Checkers Implementados (Phase 1)

#### Ambientais
- **Deforestation Checker**
  - Fonte: INPE PRODES (desmatamento anual)
  - Fonte: INPE DETER (alertas tempo real)
  - Input: Coordenadas geográficas ou endereço
  - Método: Query em dados vetoriais (PostGIS)

- **CAR Checker**
  - Fonte: SICAR (Sistema Nacional de Cadastro Ambiental Rural)
  - Input: Número CAR ou CNPJ
  - Verifica: Status do CAR, pendências, sobreposições

- **IBAMA Embargoes**
  - Fonte: API/Dataset IBAMA
  - Input: CNPJ/CPF
  - Verifica: Áreas embargadas, multas ambientais

- **Protected Areas Checker**
  - Fonte: ICMBio (Unidades de Conservação)
  - Fonte: FUNAI (Terras Indígenas)
  - Input: Coordenadas
  - Verifica: Sobreposição com áreas protegidas

#### Sociais
- **Slave Labor Checker**
  - Fonte: Lista Suja do Trabalho Escravo (MTE)
  - Input: CNPJ/CPF
  - Verifica: Presença na lista, histórico

- **Work Accidents Checker**
  - Fonte: Observatório Digital de Segurança (MTE)
  - Input: CNPJ
  - Verifica: Índice de acidentes, gravidade

#### Legais
- **Environmental License Checker**
  - Fonte: Órgãos estaduais (APIs variadas)
  - Input: CNPJ + Estado
  - Verifica: Licenças válidas (LP, LI, LO)

### 3. Orchestrator Service

Responsabilidades:
1. **Validação de Input** (Zod schemas)
2. **Normalização** (diferentes formatos de CNPJ, coordenadas)
3. **Geocoding** (quando necessário converter endereço → coordenadas)
4. **Seleção de Checkers** (baseado no tipo de input e options)
5. **Execução Paralela** (Promise.all com timeout)
6. **Cache Strategy** (Redis lookup antes de executar)
7. **Error Handling** (isolar falhas de checkers individuais)
8. **Agregação** (calcular score, veredito final)
9. **Persistência** (salvar no DB para histórico)

### 4. Cache Strategy (Redis)

```typescript
// Cache key pattern
cache:check:{inputType}:{normalizedValue}:{checkerName}

// Exemplo
cache:check:cnpj:12345678000190:deforestation
cache:check:car:BA1234567890:ibama_embargoes

// TTL variável por tipo de checker
- Deforestation: 7 dias (dados atualizados mensalmente)
- Slave Labor: 24 horas (lista atualiza frequentemente)
- CAR: 30 dias (dados relativamente estáveis)
```

### 5. Database Schema (Drizzle)

```typescript
// check_requests - Histórico de todas as consultas
export const checkRequests = pgTable('check_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  input_type: varchar('input_type', { length: 50 }),
  input_value: varchar('input_value', { length: 255 }),
  input_normalized: varchar('input_normalized', { length: 255 }),
  verdict: varchar('verdict', { length: 50 }),
  score: integer('score'),
  sources_checked: jsonb('sources_checked'),
  results: jsonb('results'), // Array de CheckerResult
  metadata: jsonb('metadata'),
  processing_time_ms: integer('processing_time_ms'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  created_by: uuid('created_by') // user_id se autenticado
});

// checker_sources - Metadados das fontes
export const checkerSources = pgTable('checker_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).unique(),
  category: varchar('category', { length: 50 }),
  description: text('description'),
  data_source_url: varchar('data_source_url', { length: 500 }),
  last_updated: timestamp('last_updated'),
  is_active: boolean('is_active').default(true),
  config: jsonb('config') // API keys, endpoints, etc
});

// checker_cache_stats - Métricas de cache
export const checkerCacheStats = pgTable('checker_cache_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  checker_name: varchar('checker_name', { length: 100 }),
  date: date('date'),
  total_requests: integer('total_requests').default(0),
  cache_hits: integer('cache_hits').default(0),
  cache_misses: integer('cache_misses').default(0),
  avg_execution_time_ms: integer('avg_execution_time_ms')
});
```

---

## 📁 Estrutura de Diretórios Completa

```
check/
├── src/
│   ├── index.ts                          # Entry point
│   │
│   ├── api/
│   │   ├── server.ts                     # Fastify app setup
│   │   ├── routes/
│   │   │   ├── check.ts                  # POST /check
│   │   │   ├── history.ts                # GET /checks/:id, /checks
│   │   │   ├── sources.ts                # GET /sources, /sources/:name
│   │   │   └── health.ts                 # GET /health
│   │   ├── plugins/
│   │   │   ├── security.ts               # Rate limit, CORS, helmet
│   │   │   ├── swagger.ts                # API docs
│   │   │   └── auth.ts                   # JWT (opcional)
│   │   └── middleware/
│   │       └── error-handler.ts
│   │
│   ├── checkers/                         # 🔥 CORE
│   │   ├── base.ts                       # Abstract BaseChecker class
│   │   ├── registry.ts                   # CheckerRegistry (auto-register)
│   │   ├── types.ts                      # Interfaces comuns
│   │   │
│   │   ├── environmental/
│   │   │   ├── index.ts
│   │   │   ├── deforestation/
│   │   │   │   ├── prodes.ts             # INPE PRODES
│   │   │   │   ├── deter.ts              # INPE DETER
│   │   │   │   └── query.ts              # PostGIS queries
│   │   │   ├── car.ts                    # SICAR checker
│   │   │   ├── ibama-embargoes.ts
│   │   │   ├── licenses.ts
│   │   │   └── protected-areas.ts
│   │   │
│   │   ├── social/
│   │   │   ├── index.ts
│   │   │   ├── slave-labor.ts            # Lista Suja MTE
│   │   │   └── work-accidents.ts
│   │   │
│   │   ├── legal/
│   │   │   ├── index.ts
│   │   │   └── licenses.ts
│   │   │
│   │   └── index.ts                      # Export all checkers
│   │
│   ├── services/
│   │   ├── orchestrator.ts               # Check orchestration
│   │   ├── cache.ts                      # Redis client + strategies
│   │   ├── geocoding.ts                  # Address → Coordinates
│   │   ├── verdict.ts                    # Aggregate results → verdict
│   │   └── normalization.ts              # Input normalization
│   │
│   ├── db/
│   │   ├── schema.ts                     # Drizzle schema
│   │   ├── client.ts                     # DB connection
│   │   ├── migrations/                   # Auto-generated
│   │   └── seed.ts                       # Seed checker_sources
│   │
│   ├── types/
│   │   ├── input.ts                      # InputType, NormalizedInput
│   │   ├── checker.ts                    # CheckerResult, CheckerConfig
│   │   ├── verdict.ts                    # Verdict, VerdictScore
│   │   └── api.ts                        # API request/response types
│   │
│   ├── utils/
│   │   ├── logger.ts                     # Pino logger
│   │   ├── validators.ts                 # Zod schemas
│   │   └── errors.ts                     # Custom error classes
│   │
│   └── config/
│       ├── index.ts                      # Centralized config
│       └── sources.json                  # Checker configs (URLs, etc)
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── scripts/
│   ├── seed-sources.ts
│   └── test-checkers.ts
│
├── docs/
│   ├── api.md
│   └── adding-checkers.md
│
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── .env.example
├── .gitignore
└── README.md
```

---

## 🔌 Extensibilidade: Adicionando Novo Checker

Para adicionar uma nova fonte de dados:

```typescript
// 1. Criar arquivo em src/checkers/{category}/{name}.ts
import { BaseChecker } from '../base';

export class NewSourceChecker extends BaseChecker {
  name = 'New Source Name';
  category = 'environmental';
  priority = 5;
  cacheTTL = 86400; // 24 horas

  async check(input: NormalizedInput): Promise<CheckerResult> {
    // 1. Verificar se input é aplicável
    if (!this.isApplicable(input)) {
      return this.notApplicableResult();
    }

    // 2. Consultar fonte externa (com tratamento de erro)
    try {
      const data = await this.fetchFromSource(input);

      // 3. Analisar resultado
      const hasIssue = this.analyze(data);

      // 4. Retornar resultado estruturado
      return {
        status: hasIssue ? 'FAIL' : 'PASS',
        severity: hasIssue ? 'HIGH' : undefined,
        message: hasIssue ? 'Issue found' : 'No issues found',
        details: data,
        evidence: { /* ... */ },
        executionTimeMs: Date.now() - startTime,
        cached: false
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private async fetchFromSource(input: NormalizedInput) {
    // Implementar lógica de consulta à API/DB
  }
}

// 2. Registrar no registry (auto-import em index.ts)
export default new NewSourceChecker();
```

**Pronto!** O checker será automaticamente:
- Descoberto pelo registry
- Executado em paralelo com outros
- Cacheado conforme configurado
- Incluído na API de status

---

## 🚀 Stack Tecnológica

### Core
- **Runtime**: Node.js >= 18
- **Linguagem**: TypeScript 5.x
- **Framework HTTP**: Fastify 4.x (3x mais rápido que Express)
- **Validação**: Zod (type-safe schemas)

### Data Layer
- **Database**: PostgreSQL 15+
- **ORM**: Drizzle ORM (type-safe, migrations)
- **Cache**: Redis 7+ (IORedis client)
- **Geospatial**: PostGIS (queries vetoriais)

### DevOps
- **Tests**: Vitest (rápido, compatível com Vite)
- **Logging**: Pino (JSON structured logging)
- **Docs**: Fastify Swagger
- **Linting**: ESLint + Prettier
- **CI/CD**: GitHub Actions
- **Deploy**: Docker + Vercel/Railway/Fly.io

### Integrações
- **Geocoding**: Google Maps API / OpenStreetMap Nominatim
- **HTTP Client**: Axios / Undici (built-in Node fetch)
- **Cron Jobs**: Node-cron (atualizar datasets)

---

## 📊 Exemplo de Uso

### Caso 1: Verificar CNPJ de Fazenda

```bash
curl -X POST https://check.defarm.net/check \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12.345.678/0001-90"
    },
    "options": {
      "sources": ["all"],
      "useCache": true
    }
  }'
```

**Resposta**:
```json
{
  "checkId": "chk_abc123",
  "verdict": "NON_COMPLIANT",
  "score": 45,
  "sources": [
    {
      "name": "PRODES Deforestation",
      "status": "FAIL",
      "severity": "HIGH",
      "message": "15ha deforestation detected in 2024"
    },
    {
      "name": "Slave Labor Registry",
      "status": "PASS"
    },
    {
      "name": "IBAMA Embargoes",
      "status": "FAIL",
      "severity": "MEDIUM",
      "message": "Active embargo from 2023"
    }
  ]
}
```

### Caso 2: Verificar Coordenadas Geográficas

```bash
curl -X POST https://check.defarm.net/check \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": {
        "lat": -10.5,
        "lon": -55.2
      }
    },
    "options": {
      "sources": ["environmental"]
    }
  }'
```

---

## 🔐 Segurança e Compliance

### Autenticação
- API Keys (format: `chk_...`)
- JWT Bearer tokens (opcional, para integração com defarm-core)
- Rate limiting por IP/API key

### Dados Sensíveis
- **Não armazenar**: Dados pessoais além do necessário
- **Anonimização**: Hash de CPF/CNPJ em logs
- **Audit Trail**: Todas as consultas registradas
- **LGPD Compliance**: Direito de acesso e exclusão

### Rate Limiting
```typescript
// Por API key
{
  tier: 'free',
  limits: {
    requestsPerMinute: 10,
    requestsPerDay: 1000
  }
}

// Por IP (sem auth)
{
  requestsPerMinute: 5,
  requestsPerDay: 100
}
```

---

## 📈 Roadmap

### Phase 1 (MVP) - 2 semanas
- ✅ Setup projeto (TS, Fastify, Drizzle)
- ✅ 3 checkers básicos (PRODES, Lista Suja, CAR)
- ✅ Orchestrator + Cache
- ✅ API routes básicas
- ✅ Testes unitários

### Phase 2 - 3 semanas
- Adicionar 5+ checkers
- Dashboard de status das fontes
- Webhook notifications
- Bulk checking (CSV upload)
- Integração com defarm-core

### Phase 3 - Evolução contínua
- Machine Learning para scoring
- Checkers privados (fontes proprietárias)
- Real-time updates (SSE)
- GraphQL API
- Mobile SDK

---

## 🤝 Integração com Ecossistema DeFarm

### Com defarm-core
```typescript
// Em defarm-core, ao criar um item:
POST /items
{
  "type": "animal",
  "metadata": {
    "farmCNPJ": "12.345.678/0001-90"
  }
}

// Trigger automático para Check API
const checkResult = await checkAPI.check({
  type: 'CNPJ',
  value: metadata.farmCNPJ
});

// Armazenar resultado em item.metadata.complianceCheck
item.metadata.complianceCheck = {
  checkId: checkResult.checkId,
  verdict: checkResult.verdict,
  score: checkResult.score,
  lastChecked: new Date()
};
```

### Com circuits.defarm.net
- Circuits podem ter policies: "Only accept items with compliance score > 70"
- Check automático ao adicionar item ao circuit

---

## 📞 Contato e Suporte

**Repositório**: `~/defarm/check`
**Documentação**: `/docs`
**Issues**: GitHub Issues
**Slack**: #check-api

---

## 📝 Notas de Desenvolvimento

### Decisões Arquiteturais

1. **Por que Fastify?**
   - 3x mais rápido que Express
   - Schema-based validation nativa
   - Alinhamento com defarm-core

2. **Por que Drizzle ORM?**
   - Type-safe queries
   - Migrations automáticas
   - Menos overhead que Prisma

3. **Por que Redis?**
   - Consultas externas são caras (satélite, APIs governamentais)
   - TTL configurável por checker
   - Pub/sub para invalidação de cache

4. **Checkers como Classes?**
   - Facilita testes unitários
   - Permite override de métodos
   - Auto-registro via registry pattern

### Considerações de Performance

- **Parallelização**: Promise.all para executar checkers
- **Timeout**: 30s por checker (configurable)
- **Cache Hit Rate esperado**: 60-80%
- **Target Latency**: < 2s (com cache), < 10s (sem cache)

### Dados Geoespaciais

- **PostGIS**: Para queries vetoriais eficientes
- **SRID 4326**: WGS84 (padrão GPS)
- **Índices**: GIST para geometrias
- **Formato**: GeoJSON para interoperabilidade

---

**Última atualização**: 2026-01-28
**Status**: 🟢 Arquitetura aprovada, pronta para implementação
