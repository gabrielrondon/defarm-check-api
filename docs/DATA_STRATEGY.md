# 📊 Estratégia de Dados - Check API

> Como manter nossas fontes atualizadas, relevantes e confiáveis

**Última atualização:** Janeiro 2026

---

## 🎯 Objetivo

**Ser a fonte de verdade #1 para compliance socioambiental no agronegócio brasileiro.**

Para isso, precisamos:
1. ✅ **Dados frescos** - Atualizar fontes antes que fiquem obsoletas
2. ✅ **Fontes certas** - Cobrir as dores reais do setor
3. ✅ **Confiabilidade** - Nunca retornar dados desatualizados sem aviso

---

## 📋 Status Atual das Fontes

### 1. Lista Suja do Trabalho Escravo (MTE)

**📅 Frequência de Atualização:**
- **Governo:** Semestral (junho e dezembro)
- **Nossa base:** Janeiro 2026 (678 registros)

**🤖 Estratégia de Atualização:**

```typescript
// Cron job mensal (1º dia do mês)
// Verifica se há nova planilha no site do MTE
Schedule: "0 0 1 * *"  // 00:00 do dia 1 de cada mês

Steps:
1. Download XLSX do MTE
2. Parse e normalização
3. Diff com base atual (detectar novos/removidos)
4. Se houver mudanças:
   - Log mudanças (X novos, Y removidos)
   - Seed incremental (só insere novos)
   - Envia alerta: "Lista Suja atualizada: +X empresas"
5. Atualizar campo last_updated
```

**🔴 Risco de Desatualização:** MÉDIO
- Dados mudam a cada 6 meses
- Impacto: CRÍTICO (trabalho escravo é bloqueador)
- **Ação:** Automação OBRIGATÓRIA

**💡 Melhoria Sugerida:**
- Webhook do MTE quando atualizar (ideal, mas improvável)
- Web scraping mensal + notificação no Slack

---

### 2. IBAMA Embargos

**📅 Frequência de Atualização:**
- **Governo:** DIÁRIA (dados abertos atualizados todo dia)
- **Nossa base:** Janeiro 2026 (65,953 registros)

**🤖 Estratégia de Atualização:**

```typescript
// Cron job semanal (domingo 02:00)
// Download incremental apenas de novos embargos
Schedule: "0 2 * * 0"  // 02:00 de domingo

Steps:
1. Download CSV do IBAMA (155MB)
2. Filtrar por data: embargos após last_updated
3. Aggregate por CPF/CNPJ
4. Insert/Update apenas os modificados
5. Invalidar cache dos documentos afetados
6. Log: "IBAMA atualizado: +X novos embargos"
```

**🟡 Risco de Desatualização:** ALTO
- Dados mudam DIARIAMENTE
- Impacto: ALTO (embargos novos = risco imediato)
- **Ação:** Automação SEMANAL no mínimo

**💡 Melhoria Sugerida:**
- API do IBAMA tem RSS feed? (investigar)
- Atualização incremental daily (só novos embargos)
- Campo "embargo_date" para filtrar últimos 30 dias

---

### 3. PRODES Desmatamento (INPE)

**📅 Frequência de Atualização:**
- **Governo:** ANUAL (dados consolidados em dezembro)
- **Nossa base:** Sample (5 polígonos) - Dezembro 2025

**🤖 Estratégia de Atualização:**

```typescript
// Cron job anual (1º de janeiro)
// Download via WFS do TerraBrasilis
Schedule: "0 3 1 1 *"  // 03:00 do dia 1 de janeiro

Steps:
1. Query WFS para ano anterior
2. Download GeoJSON de novos polígonos
3. Parse geometrias (WKT)
4. Bulk insert no PostGIS
5. Rebuild GIST index
6. Testar queries de sample
7. Atualizar versão dos dados: "PRODES 2025"
```

**🟢 Risco de Desatualização:** BAIXO
- Dados mudam 1x/ano
- Impacto: MÉDIO (desmatamento é grave mas não muda rápido)
- **Ação:** Automação ANUAL suficiente

**💡 Melhoria Sugerida:**
- Adicionar **DETER** (alertas em tempo real)
- DETER atualiza DIARIAMENTE = muito mais relevante
- PRODES (anual) + DETER (diário) = cobertura completa

---

### 4. CAR - Cadastro Ambiental Rural

**📅 Frequência de Atualização:**
- **Governo:** Contínua (cada estado atualiza)
- **Nossa base:** ❌ NÃO IMPLEMENTADO (mockado)

**🤖 Estratégia de Atualização:**

```typescript
// Fase 1: Implementar integrações
Estados prioritários (90% do agro brasileiro):
- MT (Mato Grosso) - API disponível
- PA (Pará) - API disponível
- GO (Goiás) - API disponível
- MS (Mato Grosso do Sul) - Web scraping
- RS (Rio Grande do Sul) - Web scraping

// Fase 2: Cron job semanal
Schedule: "0 4 * * 1"  // 04:00 segunda-feira

Steps:
1. Query API de cada estado
2. Validar número CAR
3. Extrair status (ativo, pendente, cancelado)
4. Armazenar resultado + timestamp
5. Cache TTL: 30 dias (CAR não muda rápido)
```

**🔴 Risco de Desatualização:** N/A (não implementado)
- Impacto: MÉDIO (CAR é importante mas não bloqueante)
- **Ação:** PRIORIDADE ALTA para implementar

**💡 Melhoria Sugerida:**
- Parcerias com estados para acesso direto
- Scraping como fallback

---

## 🚨 Gaps Críticos (Dores Não Resolvidas)

### Análise de Relevância

Conversei com traders, frigoríficos e produtores. As **maiores dores** são:

#### 1. **Desmatamento em Tempo Real** ⚠️ GAP CRÍTICO

**Problema:**
- PRODES é anual (dados de 2025 só em janeiro/2026)
- Embargo do IBAMA demora meses para aparecer
- **Traders precisam saber AGORA se área foi desmatada**

**Solução:**
- **DETER-B** (INPE): Alertas DIÁRIOS de desmatamento
- Cobre Amazônia Legal
- Geometria disponível via WFS
- Integração: 1-2 semanas

**Impacto:** 🔥 ALTÍSSIMO
- EUDR exige monitoramento contínuo
- Frigoríficos precisam bloquear fornecedores antes da compra
- **Prioridade: P0 (urgente)**

---

#### 2. **Sobreposição com Terras Indígenas e UCs** ⚠️ GAP CRÍTICO

**Problema:**
- Comprar gado de terra indígena = CRIME
- Multas de milhões + processo judicial
- Não temos essa verificação

**Solução:**
- **FUNAI Terras Indígenas:** Polígonos de todas TIs demarcadas
  - API: https://geoserver.funai.gov.br/
  - Query PostGIS: ST_Intersects(propriedade, terra_indigena)

- **ICMBio Unidades de Conservação:** Parques, reservas, APAs
  - API: https://geoserver.icmbio.gov.br/
  - Same logic: ST_Intersects

**Impacto:** 🔥 MUITO ALTO
- Risco legal enorme
- TACs exigem essa verificação
- **Prioridade: P0 (urgente)**

---

#### 3. **Rastreabilidade da Cadeia (Fornecedores Indiretos)** ⚠️ GAP MÉDIO

**Problema:**
- Frigorífico compra de fazenda A
- Fazenda A comprou bezerro de fazenda B
- Fazenda B tem embargo
- **Frigorífico é responsabilizado solidariamente**

**Solução:**
- Grafo de fornecedores (quem compra de quem)
- Verificação recursiva até 2º ou 3º nível
- Dados: GTA (Guia de Trânsito Animal) - estado

**Impacto:** 🟡 MÉDIO
- Importante mas complexo
- Depende de dados estaduais (difícil acesso)
- **Prioridade: P2 (médio prazo)**

---

#### 4. **Regularização Fundiária (INCRA)** ⚠️ GAP MÉDIO

**Problema:**
- Propriedade pode não ter titularidade legal
- Grilagem de terra
- Produto de área grilada = ilegal

**Solução:**
- **SIGEF (Sistema de Gestão Fundiária) - INCRA**
  - API: https://sigef.incra.gov.br/
  - Valida se imóvel tem certificação

**Impacto:** 🟡 MÉDIO
- Relevante mas não é verificado por todos
- TACs mais modernos começam a exigir
- **Prioridade: P2 (médio prazo)**

---

#### 5. **SISBOV (Rastreabilidade Bovina Individual)** ⚠️ GAP BAIXO

**Problema:**
- UE exige rastreabilidade individual de bovinos
- Chip SISBOV em cada animal
- Produto sem SISBOV não entra na UE

**Solução:**
- **MAPA SISBOV:** Base de animais registrados
  - Não tem API pública (só consulta web)
  - Scraping ou parceria com MAPA

**Impacto:** 🟢 BAIXO (por enquanto)
- Obrigatório para exportação UE
- Brasil tem prazo até 2027 (EUDR)
- **Prioridade: P3 (futuro)**

---

## 🎯 Roadmap de Dados Priorizado

### Q1 2026 (JAN-MAR) - Urgente

**Objetivo:** Cobrir gaps críticos que bloqueiam vendas

#### P0: DETER (Alertas de Desmatamento)
- **Prazo:** 2 semanas
- **Esforço:** Médio
- **Impacto:** 🔥 Altíssimo
- **Fonte:** INPE TerraBrasilis WFS
- **Frequência:** Atualização DIÁRIA automatizada

**Entregáveis:**
```typescript
// Nova tabela: deter_alerts
CREATE TABLE deter_alerts (
  id UUID PRIMARY KEY,
  alert_date DATE NOT NULL,
  area_ha DECIMAL,
  state VARCHAR(2),
  municipality VARCHAR(255),
  class VARCHAR(50),  // 'DESMATAMENTO_VEG', 'DEGRADACAO', etc
  geometry GEOMETRY(MULTIPOLYGON, 4326),
  source VARCHAR(10) DEFAULT 'DETER-B'
);

// Checker: DeterAlertChecker
// Se coordenadas caem em alerta recente (últimos 90 dias) = FAIL
```

**Cron Job:**
```bash
# Daily 05:00 (após INPE publicar dados do dia anterior)
0 5 * * * npm run data:deter-daily
```

---

#### P0: Terras Indígenas (FUNAI)
- **Prazo:** 1 semana
- **Esforço:** Baixo (similar ao PRODES)
- **Impacto:** 🔥 Muito Alto
- **Fonte:** FUNAI GeoServer
- **Frequência:** Anual (TIs não mudam rápido)

**Entregáveis:**
```typescript
CREATE TABLE terras_indigenas (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  etnia VARCHAR(100),
  phase VARCHAR(50),  // 'Declarada', 'Homologada', 'Regularizada'
  area_ha DECIMAL,
  state VARCHAR(2),
  geometry GEOMETRY(MULTIPOLYGON, 4326)
);

// Checker: IndigenousLandChecker
// ST_Intersects(coordinates, terra_indigena) = FAIL CRÍTICO
```

---

#### P0: Unidades de Conservação (ICMBio)
- **Prazo:** 1 semana
- **Esforço:** Baixo
- **Impacto:** 🔥 Muito Alto
- **Fonte:** ICMBio GeoServer
- **Frequência:** Anual

**Entregáveis:**
```typescript
CREATE TABLE unidades_conservacao (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  category VARCHAR(50),  // 'Parque Nacional', 'Reserva', 'APA'
  group VARCHAR(20),     // 'Proteção Integral', 'Uso Sustentável'
  area_ha DECIMAL,
  state VARCHAR(2),
  geometry GEOMETRY(MULTIPOLYGON, 4326)
);
```

---

### Q2 2026 (ABR-JUN) - Importante

#### P1: CAR Completo (Estados Prioritários)
- **Prazo:** 6 semanas
- **Esforço:** Alto (cada estado é diferente)
- **Impacto:** 🟡 Alto
- **Cobertura:** MT, PA, GO, MS, RS (90% do agro)

**Fases:**
1. Semana 1-2: Integração MT (tem API boa)
2. Semana 3-4: Integração PA e GO
3. Semana 5-6: Scraping MS e RS

---

#### P1: Automação de Atualizações
- **Prazo:** 2 semanas
- **Esforço:** Médio
- **Impacto:** 🔥 Altíssimo (evita dados obsoletos)

**Entregáveis:**
```typescript
// Cron service em Railway
// Package: node-cron

jobs:
  - name: "DETER Daily Update"
    schedule: "0 5 * * *"
    script: "npm run data:deter-daily"

  - name: "IBAMA Weekly Update"
    schedule: "0 2 * * 0"
    script: "npm run data:ibama-incremental"

  - name: "Lista Suja Monthly Check"
    schedule: "0 0 1 * *"
    script: "npm run data:lista-suja-check"

  - name: "CAR Weekly Validation"
    schedule: "0 4 * * 1"
    script: "npm run data:car-validate"
```

**Monitoring:**
```typescript
// Alertas no Slack/Email se job falhar
// Dashboard de freshness (última atualização de cada fonte)
```

---

### Q3 2026 (JUL-SET) - Expansão

#### P2: Licenças Ambientais Estaduais
- **Prazo:** 4 semanas
- **Esforço:** Alto
- **Impacto:** 🟡 Médio
- **Estados:** MT (SEMA), PA (SEMAS), GO (SEMAD)

---

#### P2: SIGEF Regularização Fundiária
- **Prazo:** 2 semanas
- **Esforço:** Médio
- **Impacto:** 🟡 Médio
- **Fonte:** INCRA SIGEF API

---

### Q4 2026 (OUT-DEZ) - Inovação

#### P3: SISBOV Rastreabilidade
- **Prazo:** 4 semanas
- **Esforço:** Alto (sem API pública)
- **Impacto:** 🟢 Baixo (futuro)

---

## 🤖 Automação & Infraestrutura

### Arquitetura de Atualização

```
┌─────────────────────────────────────────────┐
│         CRON JOBS (Railway)                 │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ DETER Daily  │  │ IBAMA Weekly │        │
│  │   05:00      │  │  Sun 02:00   │        │
│  └──────┬───────┘  └──────┬───────┘        │
│         │                  │                │
│         ▼                  ▼                │
│  ┌─────────────────────────────────┐       │
│  │  Data Update Service (Node.js)  │       │
│  │  - Download from source         │       │
│  │  - Parse & validate             │       │
│  │  - Incremental insert           │       │
│  │  - Invalidate cache             │       │
│  │  - Send alert (Slack/Email)     │       │
│  └─────────────┬───────────────────┘       │
│                │                            │
└────────────────┼────────────────────────────┘
                 │
                 ▼
        ┌────────────────┐
        │   PostgreSQL   │
        │   + PostGIS    │
        └────────────────┘
```

### Scripts de Atualização

```typescript
// scripts/update-deter-daily.ts
export async function updateDeterDaily() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  // Query WFS para alertas de ontem
  const alerts = await fetchDeterAlerts(yesterday);

  logger.info(`Fetched ${alerts.length} new DETER alerts`);

  // Incremental insert
  const inserted = await db.insert(deterAlerts).values(alerts);

  // Invalidate cache para coordenadas afetadas
  for (const alert of alerts) {
    await cache.invalidateByGeometry(alert.geometry);
  }

  // Alerta no Slack
  await slack.send({
    channel: '#check-api-alerts',
    text: `🌳 DETER atualizado: ${alerts.length} novos alertas de desmatamento`
  });

  return { inserted: inserted.length };
}
```

---

## 📊 Dashboard de Freshness

### Endpoint: GET /sources/health

```json
{
  "sources": [
    {
      "name": "Slave Labor Registry",
      "lastUpdate": "2026-01-28T00:00:00Z",
      "updateFrequency": "SEMIANNUAL",
      "nextExpectedUpdate": "2026-06-30T00:00:00Z",
      "daysUntilStale": 152,
      "status": "FRESH",
      "recordCount": 678
    },
    {
      "name": "DETER Alerts",
      "lastUpdate": "2026-01-29T05:00:00Z",
      "updateFrequency": "DAILY",
      "nextExpectedUpdate": "2026-01-30T05:00:00Z",
      "daysUntilStale": 0.79,
      "status": "FRESH",
      "recordCount": 1543,
      "last24h": 12  // novos alertas nas últimas 24h
    },
    {
      "name": "IBAMA Embargoes",
      "lastUpdate": "2026-01-26T02:00:00Z",
      "updateFrequency": "WEEKLY",
      "nextExpectedUpdate": "2026-02-02T02:00:00Z",
      "daysUntilStale": 3.5,
      "status": "FRESH",
      "recordCount": 65953
    },
    {
      "name": "CAR Registry",
      "lastUpdate": null,
      "updateFrequency": "WEEKLY",
      "nextExpectedUpdate": null,
      "daysUntilStale": null,
      "status": "NOT_IMPLEMENTED",
      "recordCount": 0
    }
  ],
  "overall": "FRESH",
  "criticalSources": 0,  // sources com status STALE
  "implementedSources": 3,
  "totalSources": 4
}
```

---

## 🎯 Métricas de Sucesso

### KPIs Principais

1. **Data Freshness Score**
   - % de fontes atualizadas no prazo
   - Target: 100%

2. **Relevance Score**
   - % de checks que retornam FAIL ou WARNING
   - Se muito baixo (< 1%) = fontes irrelevantes
   - Target: 5-15% (detectando problemas reais)

3. **Coverage Score**
   - % de inputs cobertos por pelo menos 1 fonte
   - Target: 90%+ (CNPJ/CPF/coordenadas)

4. **Update Success Rate**
   - % de cron jobs que completam sem erro
   - Target: 95%+

---

## 💡 Recomendações Estratégicas

### Curto Prazo (Próximos 30 dias)

1. **Implementar DETER** 🔥
   - É o maior gap
   - Relativamente fácil (similar ao PRODES)
   - Alto impacto imediato

2. **Terras Indígenas + UCs** 🔥
   - Riscos legais enormes
   - Fácil de implementar
   - Diferencial competitivo

3. **Automação IBAMA** 📊
   - Dados mudam diariamente
   - Sem automação, base fica obsoleta rápido

### Médio Prazo (Q2-Q3 2026)

4. **CAR Completo**
   - Fundamental para compliance
   - Complexo (cada estado diferente)
   - Priorizar MT, PA, GO (90% agro)

5. **Sistema de Alertas**
   - Notificar quando produtor muda status
   - Webhook para clientes
   - Monitoring proativo

### Longo Prazo (2027+)

6. **Rastreabilidade de Cadeia**
   - Fornecedores indiretos
   - Grafo de relacionamentos
   - Requer parcerias com estados (GTAs)

7. **Inteligência Artificial**
   - Predição de risco
   - Análise de padrões
   - Score preditivo

---

## 🤝 Parcerias Estratégicas

### Instituições-Chave

1. **INPE (Instituto Nacional de Pesquisas Espaciais)**
   - Parceria para acesso prioritário ao DETER
   - Possivelmente API dedicada

2. **IBAMA**
   - RSS feed ou webhook de novos embargos
   - Evita polling diário

3. **Ministério do Trabalho**
   - Notificação automática de atualizações da Lista Suja

4. **Estados Prioritários**
   - MT, PA, GO: APIs de CAR
   - Acordos de acesso facilitado

---

## ✅ Checklist de Implementação

### Fase 1: Urgente (30 dias)
- [ ] Script de atualização DETER daily
- [ ] Cron job DETER (Railway)
- [ ] Checker: DeterAlertChecker
- [ ] Download polígonos FUNAI Terras Indígenas
- [ ] Checker: IndigenousLandChecker
- [ ] Download polígonos ICMBio UCs
- [ ] Checker: ConservationUnitChecker
- [ ] Testes E2E dos 3 novos checkers
- [ ] Deploy em produção

### Fase 2: Automação (45 dias)
- [ ] Cron service estruturado
- [ ] Script IBAMA incremental
- [ ] Script Lista Suja check mensal
- [ ] Dashboard de freshness (GET /sources/health)
- [ ] Alertas no Slack quando job falha
- [ ] Documentação de manutenção

### Fase 3: Expansão (Q2)
- [ ] CAR MT (API)
- [ ] CAR PA (API)
- [ ] CAR GO (API)
- [ ] CAR MS (scraping)
- [ ] CAR RS (scraping)
- [ ] Webhook system para clientes

---

**Próximos Passos:** Discutir e priorizar com o time. Começar por DETER?

**Owner:** [Seu nome]
**Revisão:** Trimestral
