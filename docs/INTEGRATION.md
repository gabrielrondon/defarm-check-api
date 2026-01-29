# Guia de Integração - Check API

Este guia mostra como integrar a Check API no defarm-core (ou qualquer aplicação).

## 🔑 Obter API Key

Entre em contato com o time DeFarm para receber uma API key de produção.

**Desenvolvimento/Testes:** Use uma key de teste com rate limit menor.

## 📦 Instalação

### Variáveis de Ambiente

Adicione ao seu `.env`:

```bash
CHECK_API_URL=https://defarm-check-api-production.up.railway.app
CHECK_API_KEY=ck_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## 💻 Implementação

### Node.js / TypeScript

#### 1. Criar Client HTTP

```typescript
// src/services/checkApi.ts
import { fetch } from 'undici'; // ou node-fetch

interface CheckInput {
  type: 'CNPJ' | 'CPF' | 'CAR' | 'COORDINATES';
  value: string | { lat: number; lon: number };
}

interface CheckResponse {
  checkId: string;
  verdict: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' | 'UNKNOWN';
  score: number;
  sources: Array<{
    name: string;
    category: string;
    status: 'PASS' | 'FAIL' | 'WARNING' | 'ERROR';
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    details?: any;
  }>;
  summary: {
    totalCheckers: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  metadata: {
    processingTimeMs: number;
    cacheHitRate: number;
  };
}

class CheckApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.CHECK_API_URL!;
    this.apiKey = process.env.CHECK_API_KEY!;
  }

  async check(input: CheckInput): Promise<CheckResponse> {
    const response = await fetch(`${this.baseUrl}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Check API error: ${error.message}`);
    }

    return response.json();
  }

  async getCheckById(checkId: string): Promise<CheckResponse> {
    const response = await fetch(`${this.baseUrl}/checks/${checkId}`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Check not found: ${checkId}`);
    }

    return response.json();
  }

  async getSources() {
    const response = await fetch(`${this.baseUrl}/sources`, {
      headers: {
        'X-API-Key': this.apiKey,
      },
    });

    return response.json();
  }
}

export const checkApi = new CheckApiClient();
```

#### 2. Usar no Controller/Service

```typescript
// src/controllers/producerController.ts
import { checkApi } from '../services/checkApi';

export async function validateProducer(req, res) {
  const { cnpj } = req.body;

  try {
    // Fazer verificação de compliance
    const result = await checkApi.check({
      type: 'CNPJ',
      value: cnpj,
    });

    // Salvar no banco
    await db.producers.update({
      where: { cnpj },
      data: {
        complianceCheckId: result.checkId,
        complianceVerdict: result.verdict,
        complianceScore: result.score,
        complianceCheckedAt: new Date(),
        complianceIssues: result.sources
          .filter(s => s.status === 'FAIL')
          .map(s => ({
            source: s.name,
            severity: s.severity,
            message: s.message,
          })),
      },
    });

    // Decidir ação baseado no resultado
    if (result.verdict === 'NON_COMPLIANT') {
      // Bloquear produtor ou enviar alerta
      await sendComplianceAlert(cnpj, result);
    }

    return res.json({
      success: true,
      compliance: {
        status: result.verdict,
        score: result.score,
        issues: result.sources.filter(s => s.status === 'FAIL'),
      },
    });
  } catch (error) {
    console.error('Compliance check failed:', error);
    return res.status(500).json({ error: 'Compliance check failed' });
  }
}
```

#### 3. Verificação em Lote

```typescript
async function checkMultipleProducers(cnpjs: string[]) {
  const results = await Promise.allSettled(
    cnpjs.map(cnpj =>
      checkApi.check({ type: 'CNPJ', value: cnpj })
    )
  );

  return results.map((result, index) => ({
    cnpj: cnpjs[index],
    status: result.status,
    data: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason : null,
  }));
}
```

### Python / Django

```python
# services/check_api.py
import requests
from typing import Dict, Any, Optional
from django.conf import settings

class CheckApiClient:
    def __init__(self):
        self.base_url = settings.CHECK_API_URL
        self.api_key = settings.CHECK_API_KEY
        self.headers = {
            'Content-Type': 'application/json',
            'X-API-Key': self.api_key
        }

    def check(self, input_type: str, value: Any) -> Dict[str, Any]:
        """Realizar verificação de compliance"""
        response = requests.post(
            f'{self.base_url}/check',
            headers=self.headers,
            json={
                'input': {
                    'type': input_type,
                    'value': value
                }
            },
            timeout=30
        )

        response.raise_for_status()
        return response.json()

    def get_check_by_id(self, check_id: str) -> Optional[Dict[str, Any]]:
        """Buscar resultado por ID"""
        response = requests.get(
            f'{self.base_url}/checks/{check_id}',
            headers=self.headers
        )

        if response.status_code == 404:
            return None

        response.raise_for_status()
        return response.json()

check_api = CheckApiClient()
```

```python
# views.py
from .services.check_api import check_api
from .models import Producer

def validate_producer(request):
    cnpj = request.data.get('cnpj')

    try:
        # Verificar compliance
        result = check_api.check('CNPJ', cnpj)

        # Salvar resultado
        producer = Producer.objects.get(cnpj=cnpj)
        producer.compliance_check_id = result['checkId']
        producer.compliance_verdict = result['verdict']
        producer.compliance_score = result['score']
        producer.compliance_checked_at = timezone.now()
        producer.save()

        # Ações baseadas no resultado
        if result['verdict'] == 'NON_COMPLIANT':
            send_compliance_alert(producer, result)

        return Response({
            'success': True,
            'compliance': {
                'status': result['verdict'],
                'score': result['score'],
                'issues': [s for s in result['sources'] if s['status'] == 'FAIL']
            }
        })

    except requests.HTTPError as e:
        return Response(
            {'error': 'Compliance check failed'},
            status=500
        )
```

## 🔄 Casos de Uso

### 1. Validação no Cadastro

```typescript
// Validar ao cadastrar novo produtor
router.post('/producers', async (req, res) => {
  const { cnpj, name } = req.body;

  // Verificar compliance ANTES de salvar
  const compliance = await checkApi.check({
    type: 'CNPJ',
    value: cnpj,
  });

  if (compliance.verdict === 'NON_COMPLIANT') {
    return res.status(400).json({
      error: 'Producer não conforme',
      issues: compliance.sources.filter(s => s.status === 'FAIL'),
    });
  }

  // Salvar produtor com dados de compliance
  const producer = await db.producers.create({
    data: {
      cnpj,
      name,
      complianceScore: compliance.score,
      complianceCheckId: compliance.checkId,
    },
  });

  res.json({ producer });
});
```

### 2. Verificação Periódica

```typescript
// Cron job para re-verificar produtores mensalmente
import cron from 'node-cron';

cron.schedule('0 0 1 * *', async () => {
  console.log('Running monthly compliance check...');

  const producers = await db.producers.findMany({
    where: {
      active: true,
    },
  });

  for (const producer of producers) {
    try {
      const result = await checkApi.check({
        type: 'CNPJ',
        value: producer.cnpj,
      });

      await db.producers.update({
        where: { id: producer.id },
        data: {
          complianceScore: result.score,
          complianceVerdict: result.verdict,
          complianceCheckedAt: new Date(),
        },
      });

      // Alertar se mudou de COMPLIANT para NON_COMPLIANT
      if (
        producer.complianceVerdict === 'COMPLIANT' &&
        result.verdict === 'NON_COMPLIANT'
      ) {
        await sendAlert(producer, result);
      }
    } catch (error) {
      console.error(`Failed to check ${producer.cnpj}:`, error);
    }
  }
});
```

### 3. Validação de Propriedade por Coordenadas

```typescript
async function validateProperty(coordinates: { lat: number; lon: number }) {
  const result = await checkApi.check({
    type: 'COORDINATES',
    value: coordinates,
  });

  // Verificar se há desmatamento
  const deforestation = result.sources.find(
    s => s.name === 'PRODES Deforestation' && s.status === 'FAIL'
  );

  if (deforestation) {
    return {
      valid: false,
      reason: 'Área com desmatamento detectado',
      details: deforestation.details,
    };
  }

  return { valid: true };
}
```

## ⚡ Performance & Best Practices

### 1. Cache de Resultados

A API já faz cache, mas você pode cachear localmente também:

```typescript
import { LRUCache } from 'lru-cache';

const complianceCache = new LRUCache<string, CheckResponse>({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hora
});

async function checkWithCache(cnpj: string) {
  const cached = complianceCache.get(cnpj);
  if (cached) return cached;

  const result = await checkApi.check({ type: 'CNPJ', value: cnpj });
  complianceCache.set(cnpj, result);

  return result;
}
```

### 2. Timeout & Retry

```typescript
import pRetry from 'p-retry';

async function checkWithRetry(input: CheckInput) {
  return pRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        return await checkApi.check(input);
      } finally {
        clearTimeout(timeout);
      }
    },
    {
      retries: 3,
      onFailedAttempt: error => {
        console.log(`Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
      },
    }
  );
}
```

### 3. Processamento em Background

```typescript
import Queue from 'bull';

const complianceQueue = new Queue('compliance-checks', {
  redis: process.env.REDIS_URL,
});

// Adicionar à fila
complianceQueue.add('check', {
  cnpj: '12345678000190',
  producerId: 123,
});

// Processar
complianceQueue.process('check', async job => {
  const { cnpj, producerId } = job.data;

  const result = await checkApi.check({
    type: 'CNPJ',
    value: cnpj,
  });

  await db.producers.update({
    where: { id: producerId },
    data: {
      complianceScore: result.score,
      complianceVerdict: result.verdict,
    },
  });

  return result;
});
```

## 🚨 Tratamento de Erros

```typescript
try {
  const result = await checkApi.check({ type: 'CNPJ', value: cnpj });
} catch (error) {
  if (error.response?.status === 401) {
    // API key inválida
    console.error('Invalid API key');
  } else if (error.response?.status === 429) {
    // Rate limit excedido
    console.error('Rate limit exceeded, retry after 60s');
    await new Promise(resolve => setTimeout(resolve, 60000));
  } else if (error.response?.status === 503) {
    // Serviço temporariamente indisponível
    console.error('Service unavailable, retry later');
  } else if (error.code === 'ETIMEDOUT') {
    // Timeout
    console.error('Request timeout');
  } else {
    // Erro desconhecido
    console.error('Unknown error:', error);
  }
}
```

## 📊 Monitoramento

### Registrar Métricas

```typescript
import prometheus from 'prom-client';

const checkDuration = new prometheus.Histogram({
  name: 'compliance_check_duration_seconds',
  help: 'Duration of compliance checks',
  labelNames: ['verdict', 'cached'],
});

const checkCounter = new prometheus.Counter({
  name: 'compliance_checks_total',
  help: 'Total number of compliance checks',
  labelNames: ['verdict'],
});

async function checkWithMetrics(input: CheckInput) {
  const timer = checkDuration.startTimer();

  try {
    const result = await checkApi.check(input);

    timer({ verdict: result.verdict, cached: result.metadata.cacheHitRate > 0 });
    checkCounter.inc({ verdict: result.verdict });

    return result;
  } catch (error) {
    timer({ verdict: 'error', cached: false });
    throw error;
  }
}
```

## 🧪 Testes

```typescript
// Mock para testes
jest.mock('../services/checkApi');

describe('Producer validation', () => {
  it('should block non-compliant producer', async () => {
    (checkApi.check as jest.Mock).mockResolvedValue({
      verdict: 'NON_COMPLIANT',
      score: 30,
      sources: [
        {
          name: 'Slave Labor Registry',
          status: 'FAIL',
          severity: 'CRITICAL',
        },
      ],
    });

    const response = await request(app)
      .post('/producers')
      .send({ cnpj: '12345678000190' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('não conforme');
  });
});
```

## 📞 Suporte

Problemas na integração? Entre em contato:
- Email: suporte@defarm.com
- GitHub Issues: https://github.com/gabrielrondon/defarm-check-api/issues
