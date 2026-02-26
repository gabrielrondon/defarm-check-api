# L1 L2 L3 Roadmap (Check API)

## Objetivo
Evoluir o `check` para gerar inteligência em três camadas:
- `L1`: indicadores operacionais por fonte/checker
- `L2`: agregações gerenciais por dimensão de risco
- `L3`: sinais estratégicos (tendência, benchmark e priorização)

Sem quebrar contrato atual de `POST /check`.

## Fase 1 - Catálogo e Contrato L1 (Sprint 1)

### Escopo
- Definir catálogo mínimo de indicadores L1 para checkers prioritários:
  - `IBAMA Embargoes`
  - `PRODES Deforestation`
  - `DETER Real-Time Alerts`
  - `CAR - Cadastro Ambiental Rural`
  - `CGU Sanctions`
- Criar estrutura tipada para anexar indicadores em `sources[]` de forma opcional.
- Atualizar `openapi.yaml` com campo opcional para L1.

### Entregáveis
- Dicionário L1 versionado (arquivo de referência + ids estáveis).
- `SourceResult` aceitando `indicators[]` opcionais.
- OpenAPI atualizado com schema `L1Indicator`.
- Frontend renderizando L1 quando presente.

### Critério de aceite
- `POST /check` continua compatível para clientes atuais.
- Para checkers cobertos, resposta inclui ao menos 1 indicador L1.
- Frontend exibe L1 sem quebrar experiências atuais.

## Fase 2 - Agregador L2 (Sprint 2)

### Escopo
- Implementar serviço de agregação `L2` com pesos v1.
- Dimensões iniciais:
  - `environmental_risk_index`
  - `social_risk_index`
  - `legal_risk_index`
  - `data_quality_index`
- Incluir `insights.l2` opcional na resposta.

### Entregáveis
- Serviço `insights-l2` com cálculo determinístico e versionado.
- Config de pesos por dimensão (arquivo único).
- OpenAPI + frontend alinhados para `insights.l2`.

### Critério de aceite
- Cálculo reproduzível para o mesmo conjunto de `sources`.
- Mudança de peso não exige refator de checker.
- Frontend mostra índices L2 com fallback quando ausentes.

## Fase 3 - Sinais L3 (Sprint 3)

### Escopo
- Criar job de tendências com janela `7d`, `30d`, `90d`.
- Gerar sinais estratégicos:
  - `risk_trend`
  - `hotspot_signal`
  - `audit_priority`
- Expor bloco opcional `insights.l3`.

### Entregáveis
- Job periódico com persistência de snapshot.
- Endpoint/consulta para leitura de tendências.
- OpenAPI/frontend com visualização de L3.

### Critério de aceite
- Tendência calculada em base histórica real.
- Sinais L3 não alteram veredito legado (`verdict/score`) por padrão.

## Governança de Contrato
- Qualquer mudança em L1/L2/L3 deve:
  1. Atualizar `openapi.yaml` no backend.
  2. Sincronizar `check-frontend/public/openapi.yaml`.
  3. Atualizar `check-frontend/src/lib/api.ts`.
  4. Validar diffs e smoke tests.

## Ordem de Execução Recomendada (próximos 7 dias)
1. Criar dicionário L1 e tipos base.
2. Implementar L1 em 3 checkers críticos (IBAMA, PRODES, DETER).
3. Atualizar OpenAPI e frontend.
4. Validar com payloads reais e ajustar.
