# Exemplos Práticos - Check API

Exemplos reais de como usar a Check API em diferentes cenários.

## 📌 Índice

- [Verificação por CNPJ](#verificação-por-cnpj)
- [Verificação por CPF](#verificação-por-cpf)
- [Verificação por Coordenadas](#verificação-por-coordenadas)
- [Processar em Lote](#processar-em-lote)
- [Interpretar Resultados](#interpretar-resultados)

## Verificação por CNPJ

### Exemplo 1: CNPJ Limpo (Conforme)

**Request:**
```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ck_056af37680464425d1f23c543515951920f9947f022e3cb5735844673edb4f12" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "11222333000144"
    }
  }'
```

**Response:**
```json
{
  "checkId": "a84b07fb-8142-4cc3-bcf4-a59e368be37c",
  "verdict": "PARTIAL",
  "score": 83,
  "sources": [
    {
      "name": "Slave Labor Registry",
      "status": "PASS",
      "message": "Not found in slave labor registry"
    },
    {
      "name": "IBAMA Embargoes",
      "status": "PASS",
      "message": "No active IBAMA embargoes found"
    },
    {
      "name": "CAR Registry",
      "status": "WARNING",
      "severity": "MEDIUM",
      "message": "CAR not found or not registered"
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

**Interpretação:**
- ✅ Não está na Lista Suja
- ✅ Não tem embargos do IBAMA
- ⚠️ CAR não encontrado (pode não ser obrigatório)
- Score: 83/100 (parcialmente conforme)

---

### Exemplo 2: CNPJ na Lista Suja (Não Conforme)

**Request:**
```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ck_056af37680464425d1f23c543515951920f9947f022e3cb5735844673edb4f12" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "41297068000161"
    }
  }'
```

**Response:**
```json
{
  "checkId": "b1c2d3e4-f5g6-h7i8-j9k0-l1m2n3o4p5q6",
  "verdict": "NON_COMPLIANT",
  "score": 50,
  "sources": [
    {
      "name": "Slave Labor Registry",
      "category": "social",
      "status": "FAIL",
      "severity": "CRITICAL",
      "message": "Found in slave labor registry: 41.297.068 GILBERTO ELENO BATISTA DOS SANTOS",
      "details": {
        "employerName": "41.297.068 GILBERTO ELENO BATISTA DOS SANTOS",
        "type": "CNPJ",
        "state": "SP",
        "address": "ROD. PREFEITO JOAQUIM SIMÃO, KM 735, CENTRO, IGARATÁ/SP",
        "year": 2024,
        "workersAffected": 2,
        "cnae": "4399-1/03",
        "inclusionDate": "06/10/2025",
        "recommendation": "CRITICAL: Immediate compliance review required. This entity has been found guilty of submitting workers to conditions analogous to slavery."
      },
      "evidence": {
        "dataSource": "Ministério do Trabalho e Emprego - Cadastro de Empregadores",
        "url": "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/areas-de-atuacao/cadastro_empregadores.xlsx",
        "lastUpdate": "2026-01-28"
      }
    },
    {
      "name": "IBAMA Embargoes",
      "status": "PASS"
    },
    {
      "name": "CAR Registry",
      "status": "WARNING"
    }
  ],
  "summary": {
    "totalCheckers": 3,
    "passed": 1,
    "failed": 1,
    "warnings": 1
  }
}
```

**Interpretação:**
- ❌ **CRÍTICO:** Está na Lista Suja do Trabalho Escravo
- 2 trabalhadores afetados em 2024
- Localização: Igaratá/SP
- **Ação recomendada:** Bloquear imediatamente

---

## Verificação por CPF

### Exemplo 3: CPF com Embargo IBAMA

**Request:**
```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ck_056af37680464425d1f23c543515951920f9947f022e3cb5735844673edb4f12" \
  -d '{
    "input": {
      "type": "CPF",
      "value": "485.227.833-49"
    }
  }'
```

**Response:**
```json
{
  "verdict": "NON_COMPLIANT",
  "score": 67,
  "sources": [
    {
      "name": "IBAMA Embargoes",
      "status": "FAIL",
      "severity": "MEDIUM",
      "message": "1 active embargo(s) found - 72.00ha embargoed",
      "details": {
        "name": "JOSE WEDER BASILIO RABELO",
        "embargoCount": 1,
        "totalArea_ha": 72,
        "embargos": [
          {
            "embargoNumber": "2QJILJXL",
            "date": "2925-09-25 15:10:00",
            "municipality": "Morada Nova",
            "state": "CE",
            "area_ha": 71.9994,
            "description": "Fica embargada uma área de 71,9987 ha...",
            "coordinates": {
              "lat": -4.86783333333,
              "lon": -38.33333694444
            }
          }
        ],
        "recommendation": "CRITICAL: 1 active environmental embargo(s) from IBAMA. Property has 72.00 hectares under embargo. Compliance review required immediately."
      }
    }
  ]
}
```

**Interpretação:**
- ❌ 1 embargo ativo do IBAMA
- 72 hectares embargados em Morada Nova/CE
- Coordenadas do embargo disponíveis
- **Ação recomendada:** Investigar antes de aprovar

---

## Verificação por Coordenadas

### Exemplo 4: Área com Desmatamento

**Request:**
```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ck_056af37680464425d1f23c543515951920f9947f022e3cb5735844673edb4f12" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": {
        "lat": -7.0945,
        "lon": -61.089
      }
    }
  }'
```

**Response:**
```json
{
  "verdict": "NON_COMPLIANT",
  "score": 0,
  "sources": [
    {
      "name": "PRODES Deforestation",
      "status": "FAIL",
      "severity": "HIGH",
      "message": "Deforestation detected: 15ha in 2024",
      "details": {
        "area_ha": 15,
        "year": 2024,
        "municipality": "Novo Aripuanã",
        "state": "AM",
        "path_row": "231/066",
        "coordinates": { "lat": -7.0945, "lon": -61.089 },
        "recommendation": "HIGH: Deforestation detected at this location. Environmental compliance review required."
      },
      "evidence": {
        "dataSource": "INPE PRODES - Programa de Monitoramento do Desmatamento",
        "url": "http://terrabrasilis.dpi.inpe.br/",
        "lastUpdate": "2025-12-01"
      }
    }
  ]
}
```

**Interpretação:**
- ❌ Desmatamento detectado em 2024
- 15 hectares desmatados
- Localização: Novo Aripuanã/AM
- **Ação recomendada:** Propriedade não conforme

---

### Exemplo 5: Área Limpa

**Request:**
```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ck_056af37680464425d1f23c543515951920f9947f022e3cb5735844673edb4f12" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": {
        "lat": -1.0,
        "lon": -50.0
      }
    }
  }'
```

**Response:**
```json
{
  "verdict": "COMPLIANT",
  "score": 100,
  "sources": [
    {
      "name": "PRODES Deforestation",
      "status": "PASS",
      "message": "No deforestation detected at this location",
      "details": {
        "coordinates": { "lat": -1, "lon": -50 },
        "checkedAt": "2026-01-29T01:13:10.592Z"
      }
    }
  ]
}
```

**Interpretação:**
- ✅ Nenhum desmatamento detectado
- Score: 100/100 (totalmente conforme)
- **Ação:** Aprovado

---

## Processar em Lote

### Exemplo 6: Verificar Múltiplos Produtores

```typescript
const produtores = [
  { id: 1, cnpj: '41297068000161' },
  { id: 2, cnpj: '11222333000144' },
  { id: 3, cnpj: '48937720000104' },
];

// Processar em paralelo (máx 5 por vez para não exceder rate limit)
const pLimit = (await import('p-limit')).default;
const limit = pLimit(5);

const resultados = await Promise.all(
  produtores.map(p =>
    limit(async () => {
      try {
        const result = await checkApi.check({
          type: 'CNPJ',
          value: p.cnpj,
        });

        return {
          id: p.id,
          cnpj: p.cnpj,
          status: 'success',
          verdict: result.verdict,
          score: result.score,
        };
      } catch (error) {
        return {
          id: p.id,
          cnpj: p.cnpj,
          status: 'error',
          error: error.message,
        };
      }
    })
  )
);

// Filtrar não conformes
const naoConformes = resultados.filter(
  r => r.status === 'success' && r.verdict === 'NON_COMPLIANT'
);

console.log(`${naoConformes.length} produtores não conformes encontrados`);
```

---

## Interpretar Resultados

### Score (0-100)

| Score | Verdict | Significado | Ação |
|-------|---------|-------------|------|
| 100 | COMPLIANT | Totalmente conforme | ✅ Aprovar |
| 50-99 | PARTIAL | Parcialmente conforme | ⚠️ Revisar warnings |
| 1-49 | NON_COMPLIANT | Não conforme | ❌ Bloquear |
| 0 | NON_COMPLIANT | Crítico | 🚫 Bloquear imediatamente |

### Severidade

| Severidade | Significado | Exemplo |
|------------|-------------|---------|
| LOW | Problema menor | CAR não encontrado (pode não ser obrigatório) |
| MEDIUM | Problema moderado | Embargo pequeno (<100ha) |
| HIGH | Problema grave | Desmatamento detectado |
| CRITICAL | Problema crítico | Lista Suja, embargo grande (>1000ha) |

### Status dos Checkers

| Status | Significado |
|--------|-------------|
| PASS | Conforme - nenhum problema encontrado |
| FAIL | Não conforme - problema detectado |
| WARNING | Alerta - requer atenção mas não bloqueia |
| ERROR | Erro ao executar checker |
| NOT_APPLICABLE | Checker não aplicável para este input |

---

## Casos de Uso Avançados

### Webhook para Notificações

```typescript
// Verificar e notificar via webhook
async function checkAndNotify(cnpj: string, webhookUrl: string) {
  const result = await checkApi.check({
    type: 'CNPJ',
    value: cnpj,
  });

  if (result.verdict === 'NON_COMPLIANT') {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'compliance.failed',
        cnpj,
        score: result.score,
        issues: result.sources.filter(s => s.status === 'FAIL'),
      }),
    });
  }

  return result;
}
```

### Dashboard de Compliance

```typescript
// Agregação para dashboard
async function getComplianceStats(cnpjs: string[]) {
  const results = await Promise.all(
    cnpjs.map(cnpj => checkApi.check({ type: 'CNPJ', value: cnpj }))
  );

  return {
    total: results.length,
    compliant: results.filter(r => r.verdict === 'COMPLIANT').length,
    nonCompliant: results.filter(r => r.verdict === 'NON_COMPLIANT').length,
    partial: results.filter(r => r.verdict === 'PARTIAL').length,
    averageScore: results.reduce((sum, r) => sum + r.score, 0) / results.length,
    criticalIssues: results.flatMap(r =>
      r.sources.filter(s => s.severity === 'CRITICAL')
    ),
  };
}
```

---

## 💡 Dicas

1. **Cache**: A API já faz cache, mas resultados antigos (>7 dias) podem estar desatualizados
2. **Rate Limit**: Máximo 10,000 req/min. Use throttling para lotes grandes
3. **Timeout**: Checkers podem levar até 15s. Configure timeout adequado
4. **Retry**: Implemente retry com backoff exponencial para falhas temporárias
5. **Monitoring**: Registre métricas (latência, taxa de sucesso) no seu sistema

## 📞 Ajuda

Mais exemplos? Entre em contato:
- Email: suporte@defarm.com
- Docs: https://defarm-check-api-production.up.railway.app/docs
