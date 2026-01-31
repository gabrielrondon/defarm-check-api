# Check API - DeFarm Compliance Socioambiental

API de verificação de compliance socioambiental que agrega múltiplas fontes de dados públicos para validar conformidade de produtores, propriedades e produtos rurais no Brasil.

**🌐 Produção:** https://defarm-check-api-production.up.railway.app

## 🎯 O que a API faz?

> **📘 Quer entender em profundidade?** Leia o [Overview Completo](./docs/OVERVIEW.md) para detalhes sobre o problema do agronegócio, cada fonte de dados, como coletamos e armazenamos informações, e muito mais.

Verifica automaticamente se um produtor, propriedade ou produto está em conformidade com regulamentações socioambientais brasileiras, consultando:

- **Lista Suja do Trabalho Escravo** (MTE) - 678 registros
- **Embargos Ambientais** (IBAMA) - 65,953 documentos
- **Desmatamento** (PRODES/INPE) - Dados geoespaciais
- **Cadastro Ambiental Rural** (CAR/SICAR)

## 🚀 Quick Start - Produção

```bash
# Fazer uma verificação
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: SUA_API_KEY" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12345678000190"
    }
  }'
```

**Resposta:**
```json
{
  "checkId": "a84b07fb-8142-4cc3-bcf4-a59e368be37c",
  "verdict": "NON_COMPLIANT",
  "score": 50,
  "sources": [
    {
      "name": "Slave Labor Registry",
      "category": "social",
      "status": "FAIL",
      "severity": "CRITICAL",
      "message": "Found in slave labor registry",
      "details": { ... }
    }
  ],
  "summary": {
    "totalCheckers": 3,
    "passed": 1,
    "failed": 1,
    "warnings": 1
  },
  "metadata": {
    "processingTimeMs": 185,
    "cacheHitRate": 0.33,
    "apiVersion": "1.0.0"
  }
}
```

## 🔑 Autenticação

Todas as requisições requerem uma API key no header:

```
X-API-Key: ck_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Obter API Key:** Entre em contato com o time para receber uma API key.

## 📋 Endpoints

### POST /check
Executa verificação de compliance

**Request:**
```json
{
  "input": {
    "type": "CNPJ|CPF|CAR|COORDINATES",
    "value": "..."
  },
  "options": {
    "useCache": true,
    "includeEvidence": true
  }
}
```

**Tipos de Input:**
- `CNPJ` - CNPJ (com ou sem máscara): `"12345678000190"` ou `"12.345.678/0001-90"`
- `CPF` - CPF (com ou sem máscara): `"12345678900"` ou `"123.456.789-00"`
- `CAR` - Número CAR
- `COORDINATES` - Coordenadas: `{"lat": -7.094, "lon": -61.090}`

**Response:**
```typescript
{
  checkId: string;           // ID único da verificação
  input: { type, value };    // Input original
  timestamp: string;         // ISO 8601
  verdict: "COMPLIANT" | "NON_COMPLIANT" | "PARTIAL" | "UNKNOWN";
  score: number;             // 0-100 (100 = totalmente conforme)
  sources: SourceResult[];   // Resultado de cada checker
  summary: {
    totalCheckers: number;
    passed: number;
    failed: number;
    warnings: number;
    errors: number;
  };
  metadata: {
    processingTimeMs: number;
    cacheHitRate: number;    // 0-1
    apiVersion: string;
  };
}
```

### GET /checks/:id
Busca resultado de verificação anterior

```bash
curl https://defarm-check-api-production.up.railway.app/checks/a84b07fb-8142-4cc3-bcf4-a59e368be37c \
  -H "X-API-Key: SUA_API_KEY"
```

### GET /sources
Lista todas as fontes de dados disponíveis

```bash
curl https://defarm-check-api-production.up.railway.app/sources \
  -H "X-API-Key: SUA_API_KEY"
```

**Response:**
```json
[
  {
    "name": "Slave Labor Registry",
    "category": "social",
    "enabled": true,
    "status": "operational",
    "description": "Verifica se CNPJ/CPF está na Lista Suja do Trabalho Escravo (MTE)"
  },
  ...
]
```

### GET /health
Health check (não requer autenticação)

```bash
curl https://defarm-check-api-production.up.railway.app/health
```

## 🧩 Checkers Implementados

### 🌿 Ambientais
| Checker | Fonte | Registros | Status |
|---------|-------|-----------|--------|
| **PRODES Deforestation** | INPE TerraBrasilis | 5 samples | ✅ Operacional |
| **IBAMA Embargoes** | IBAMA | 65,953 docs | ✅ Operacional |
| **CAR Registry** | SICAR | Placeholder | ⚠️ Mockado |

### 👥 Sociais
| Checker | Fonte | Registros | Status |
|---------|-------|-----------|--------|
| **Slave Labor Registry** | MTE | 678 | ✅ Operacional |

## 💻 Integração com defarm-core

### JavaScript/TypeScript

```typescript
async function checkCompliance(document: string) {
  const response = await fetch('https://defarm-check-api-production.up.railway.app/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.CHECK_API_KEY
    },
    body: JSON.stringify({
      input: {
        type: 'CNPJ',
        value: document
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Check API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    isCompliant: data.verdict === 'COMPLIANT',
    score: data.score,
    issues: data.sources.filter(s => s.status === 'FAIL')
  };
}
```

### Python

```python
import requests

def check_compliance(document: str) -> dict:
    response = requests.post(
        'https://defarm-check-api-production.up.railway.app/check',
        headers={
            'Content-Type': 'application/json',
            'X-API-Key': os.getenv('CHECK_API_KEY')
        },
        json={
            'input': {
                'type': 'CNPJ',
                'value': document
            }
        }
    )

    response.raise_for_status()
    data = response.json()

    return {
        'is_compliant': data['verdict'] == 'COMPLIANT',
        'score': data['score'],
        'issues': [s for s in data['sources'] if s['status'] == 'FAIL']
    }
```

## 🏗️ Desenvolvimento Local

### Pré-requisitos
- Node.js >= 18
- PostgreSQL >= 15 com PostGIS
- Redis >= 7

### Setup

```bash
# Clonar repositório
git clone https://github.com/gabrielrondon/defarm-check-api.git
cd defarm-check-api

# Instalar dependências
npm install

# Configurar ambiente
cp .env.example .env
# Editar .env com suas configurações

# Rodar migrations
npm run db:migrate

# Baixar dados (opcional - já existem seeds)
npm run data:lista-suja  # Lista Suja MTE
npm run data:ibama       # IBAMA Embargoes
npm run data:prodes      # PRODES sample

# Iniciar servidor
npm run dev
```

Servidor: `http://localhost:3000`
Docs: `http://localhost:3000/docs`

### Scripts Disponíveis

```bash
npm run dev              # Desenvolvimento com hot reload
npm run build            # Build para produção
npm run start            # Iniciar versão buildada
npm run test             # Executar testes
npm run lint             # Lint do código
npm run format           # Formatar código

# Database
npm run db:generate      # Gerar migration
npm run db:migrate       # Executar migrations
npm run db:seed          # Seed checker sources

# API Keys
npm run create-api-key -- --name "My App" --rate-limit 1000

# Data
npm run data:all         # Baixar todos os dados
```

## 🗄️ Arquitetura

### Stack
- **Runtime:** Node.js 18+ (TypeScript)
- **Framework:** Fastify (3x mais rápido que Express)
- **Database:** PostgreSQL 16 + PostGIS 3.7
- **Cache:** Redis 7
- **ORM:** Drizzle ORM
- **Validação:** Zod
- **Logs:** Pino (JSON estruturado)

### Estrutura

```
src/
├── api/
│   ├── routes/          # Endpoints HTTP
│   ├── middleware/      # Autenticação, etc
│   └── plugins/         # Fastify plugins
├── checkers/
│   ├── base.ts          # BaseChecker abstrato
│   ├── environmental/   # Checkers ambientais
│   ├── social/          # Checkers sociais
│   └── legal/           # Checkers legais
├── services/
│   ├── orchestrator.ts  # Coordena execução dos checkers
│   └── cache.ts         # Redis cache service
├── db/
│   ├── schema.ts        # Drizzle schema
│   ├── client.ts        # Database client
│   └── migrations/      # SQL migrations
└── types/               # TypeScript types
```

### Como Funciona

1. **Request** → Autenticação via API key
2. **Normalização** → Input padronizado (remove máscaras, etc)
3. **Orquestração** → Executa checkers relevantes em paralelo
4. **Cache** → Verifica Redis antes de executar
5. **Agregação** → Calcula score e verdict
6. **Persistência** → Salva no PostgreSQL
7. **Response** → Retorna JSON completo

## 🔐 Segurança

- ✅ API Keys com bcrypt hashing
- ✅ Rate limiting por key (10,000 req/min padrão)
- ✅ CORS configurável
- ✅ Helmet security headers
- ✅ Validação de input (Zod)
- ✅ SQL injection protection (Drizzle ORM)
- ✅ Secrets em variáveis de ambiente

## 📊 Performance

- **Latência média:** ~200ms (com dados em cache: ~10ms)
- **Cache hit rate:** ~65% em produção
- **Rate limit:** 10,000 req/min por API key
- **Timeout:** 15s por checker

## 🚨 Troubleshooting

### 401 Unauthorized
- Verifique se o header `X-API-Key` está presente
- Confirme que a API key está ativa

### 503 Service Unavailable
- Verifique `/health` para status dos serviços
- Database ou Redis podem estar offline

### Timeout
- Alguns checkers podem demorar (PostGIS queries)
- Considere aumentar timeout no client

### Cache não funcionando
- Verifique conexão com Redis
- `CACHE_ENABLED=true` no `.env`

## 📚 Documentação Adicional

- [Overview Completo](./docs/OVERVIEW.md) - Entenda o problema, fontes de dados, arquitetura completa
- [OpenAPI Specification](./openapi.yaml) - Especificação OpenAPI 3.0 completa (para importar em ferramentas)
- [API Reference](./docs/API.md) - Referência completa dos endpoints
- [Integration Guide](./docs/INTEGRATION.md) - Guia de integração detalhado
- [Examples](./docs/EXAMPLES.md) - Exemplos práticos com casos reais
- [Railway Setup](./RAILWAY_SETUP.md) - Deploy no Railway
- [Seed Production](./docs/SEED_PRODUCTION.md) - Como popular banco de produção com dados
- [Seed Railway](./docs/SEED_RAILWAY.md) - Como popular banco no Railway especificamente
- [Swagger/OpenAPI](https://defarm-check-api-production.up.railway.app/docs) - Documentação interativa

## 🗺️ Roadmap

- [ ] Checker: SISBOV (rastreabilidade bovina)
- [ ] Checker: Licenças ambientais estaduais
- [ ] Checker: Terras Indígenas (FUNAI)
- [ ] Webhook support para checks assíncronos
- [ ] GraphQL API
- [ ] SDK JavaScript/TypeScript
- [ ] Dashboard de analytics

## 📞 Suporte

- **Issues:** [GitHub Issues](https://github.com/gabrielrondon/defarm-check-api/issues)
- **Email:** suporte@defarm.com
- **Docs:** https://defarm-check-api-production.up.railway.app/docs

## 📝 Licença

MIT License - DeFarm 2026
