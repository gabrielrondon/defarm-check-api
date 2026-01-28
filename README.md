# Check API - DeFarm Compliance Socioambiental

API de verificação de compliance socioambiental que agrega múltiplas fontes de dados públicos para validar conformidade de produtores, propriedades e produtos.

## 🚀 Quick Start

### Pré-requisitos
- Node.js >= 18
- PostgreSQL >= 15
- Redis >= 7

### Instalação

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Gerar migrations
npm run db:generate

# Executar migrations
npm run db:migrate

# Iniciar em desenvolvimento
npm run dev
```

O servidor estará disponível em `http://localhost:3000`

Documentação (Swagger): `http://localhost:3000/docs`

## 📋 API Endpoints

### POST /check
Executa verificação de compliance

```bash
curl -X POST http://localhost:3000/check \
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

**Tipos de Input suportados:**
- `CNPJ` - CNPJ de empresa
- `CPF` - CPF de pessoa física
- `CAR` - Número de Cadastro Ambiental Rural
- `IE` - Inscrição Estadual
- `COORDINATES` - Coordenadas geográficas `{ lat: -10.5, lon: -55.2 }`
- `ADDRESS` - Endereço (será geocodificado)

**Resposta:**
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
      "message": "Detected 15ha deforestation in 2024"
    }
  ],
  "summary": {
    "totalCheckers": 3,
    "passed": 1,
    "failed": 2
  }
}
```

### GET /checks/:id
Busca resultado de verificação por ID

```bash
curl http://localhost:3000/checks/chk_abc123
```

### GET /sources
Lista todas as fontes de dados disponíveis

```bash
curl http://localhost:3000/sources
```

### GET /health
Health check do sistema

```bash
curl http://localhost:3000/health
```

## 🧩 Checkers Implementados

### Ambientais
- **PRODES Deforestation** - Verifica desmatamento (INPE)
- **CAR Registry** - Valida Cadastro Ambiental Rural (SICAR)

### Sociais
- **Slave Labor Registry** - Verifica Lista Suja (MTE)

## 🔧 Desenvolvimento

### Scripts

```bash
npm run dev          # Desenvolvimento com hot reload
npm run build        # Build para produção
npm run start        # Inicia versão buildada
npm run test         # Executar testes
npm run lint         # Lint do código
npm run format       # Formatar código
```

### Estrutura do Projeto

```
src/
├── api/              # Fastify server e routes
├── checkers/         # Checkers modulares
│   ├── environmental/
│   ├── social/
│   └── legal/
├── services/         # Business logic
├── db/               # Database schema e client
├── types/            # TypeScript types
├── utils/            # Utilitários
└── config/           # Configurações
```

### Adicionando Novo Checker

1. Criar arquivo em `src/checkers/{category}/{name}.ts`
2. Estender `BaseChecker`
3. Implementar `executeCheck()`
4. Registrar em `src/checkers/index.ts`

```typescript
import { BaseChecker } from '../base.js';

export class MyChecker extends BaseChecker {
  readonly metadata = {
    name: 'My Checker',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Checks something',
    priority: 7,
    supportedInputTypes: [InputType.CNPJ]
  };

  readonly config = {
    enabled: true,
    cacheTTL: 3600,
    timeout: 10000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    // Sua lógica aqui
    return {
      status: CheckStatus.PASS,
      message: 'All good',
      executionTimeMs: 0,
      cached: false
    };
  }
}
```

## 🗄️ Database

### Migrations

```bash
# Gerar migration após alterar schema
npm run db:generate

# Executar migrations
npm run db:migrate
```

### Schema Principal

- `check_requests` - Histórico de verificações
- `checker_sources` - Registro de fontes de dados
- `checker_cache_stats` - Métricas de cache

## 🔐 Segurança

- Rate limiting (100 req/min por padrão)
- CORS configurável
- Helmet security headers
- Validação de input (Zod)

## 📊 Monitoramento

### Logs

Logs estruturados em JSON (Pino):

```bash
# Desenvolvimento (pretty print)
LOG_PRETTY=true npm run dev

# Produção (JSON)
npm start
```

### Métricas

- Cache hit rate
- Tempo de execução por checker
- Taxa de sucesso/falha

## 🚢 Deploy

### Docker (em breve)

```bash
docker build -t check-api .
docker run -p 3000:3000 check-api
```

### Variáveis de Ambiente

Ver `.env.example` para lista completa.

Essenciais:
- `DATABASE_URL` - Connection string PostgreSQL
- `REDIS_URL` - Connection string Redis
- `PORT` - Porta do servidor (padrão: 3000)

## 📝 Licença

MIT

## 🤝 Contribuindo

1. Seguir padrão de código (ESLint + Prettier)
2. Adicionar testes para novos checkers
3. Documentar APIs no Swagger
4. Atualizar README quando adicionar funcionalidades

## 📞 Suporte

Issues: GitHub Issues
Docs: `/docs` endpoint
