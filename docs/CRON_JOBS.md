# Cron Jobs - Automação de Atualização de Dados

> Sistema automático de atualização de todas as fontes de dados

**Última atualização:** Janeiro 2026

---

## 📋 Visão Geral

Este sistema garante que todas as fontes de dados estejam sempre atualizadas automaticamente, sem intervenção manual.

**Benefícios:**
- ✅ Dados sempre frescos
- ✅ Compliance contínuo
- ✅ Redução de risco
- ✅ Sem trabalho manual

---

## 🕐 Cronograma de Atualizações

| Fonte | Frequência | Cron | Horário | Duração Estimada |
|-------|-----------|------|---------|------------------|
| **DETER** | DIÁRIA | `0 3 * * *` | 03:00 | 5-10 min |
| **Lista Suja** | MENSAL | `0 2 1 * *` | 1º dia, 02:00 | 3-5 min |
| **IBAMA** | SEMANAL | `0 2 * * 0` | Dom, 02:00 | 10-15 min |
| **Terras Indígenas** | MENSAL | `0 4 1 * *` | 1º dia, 04:00 | 10-15 min |
| **UCs** | MENSAL | `0 4 1 * *` | 1º dia, 04:00 | 10-15 min |
| **CAR** | MENSAL | `0 3 15 * *` | dia 15, 03:00 | 30-60 min |
| **Health Check** | DIÁRIA | `0 8 * * *` | 08:00 | < 1 min |

**Janelas de Manutenção:**
- Madrugada (02:00-05:00): Menor uso da API
- Fim de semana: Jobs mais pesados (IBAMA)

---

## 📥 Instalação

### 1. Setup Inicial

```bash
# Dar permissão de execução
chmod +x scripts/cron/setup-cron.sh

# Executar setup
./scripts/cron/setup-cron.sh
```

O script irá:
1. ✅ Criar diretório `logs/`
2. ✅ Verificar dependências (tsx, node)
3. ✅ Testar compilação dos scripts
4. ✅ Mostrar preview do crontab
5. ⚠️ Pedir confirmação para instalar

### 2. Verificar Instalação

```bash
# Ver cron jobs instalados
crontab -l

# Ver próximas execuções
crontab -l | grep -v "^#" | while read line; do
  echo "$line" | awk '{print $1,$2,$3,$4,$5}'
done
```

### 3. Monitorar Logs

```bash
# Tail de todos os logs
tail -f logs/cron-*.log

# Logs específicos
tail -f logs/cron-deter.log
tail -f logs/cron-lista-suja.log
tail -f logs/cron-ibama.log
tail -f logs/cron-spatial-data.log
tail -f logs/cron-car.log
tail -f logs/cron-health.log
```

---

## 🔧 Scripts Disponíveis

### 1. DETER (Diário)

**Arquivo:** `scripts/cron/update-deter.ts`

**O que faz:**
- Download alertas dos últimos 7 dias (incremental)
- Insert novos alertas no banco
- Limpa alertas > 90 dias (mantém janela relevante)
- Log de novos alertas por estado e classe

**Teste manual:**
```bash
tsx scripts/cron/update-deter.ts
```

**Logs importantes:**
- `newAlerts`: Novos alertas por estado/classe
- `criticalAlerts`: DESMATAMENTO_VEG com > 10 alertas

---

### 2. Lista Suja (Mensal)

**Arquivo:** `scripts/cron/update-lista-suja.ts`

**O que faz:**
- Download XLSX do MTE
- Conversão para JSON
- Diff com base atual (novos vs removidos)
- Seed incremental
- Log de mudanças

**Teste manual:**
```bash
tsx scripts/cron/update-lista-suja.ts
```

**Logs importantes:**
- `added`: Novos empregadores na lista
- `removed`: Empregadores removidos da lista

---

### 3. IBAMA Embargoes (Semanal)

**Arquivo:** `scripts/cron/update-ibama.ts`

**O que faz:**
- Download CSV do IBAMA (155MB)
- Conversão e aggregation por CPF/CNPJ
- Upsert no banco
- Estatísticas finais

**Teste manual:**
```bash
tsx scripts/cron/update-ibama.ts
```

**Logs importantes:**
- `total`: Total de documentos com embargo
- `total_embargoes`: Total de embargos registrados
- `total_area`: Área total embargada (ha)

---

### 4. Dados Espaciais (Mensal)

**Arquivo:** `scripts/cron/update-spatial-data.ts`

**O que faz:**
- Download Terras Indígenas (FUNAI WFS)
- Download Unidades de Conservação (ICMBio WFS)
- Seed no banco (TRUNCATE + INSERT)
- Log de sucesso/falha individual

**Teste manual:**
```bash
tsx scripts/cron/update-spatial-data.ts
```

**Logs importantes:**
- `results.terrasIndigenas`: boolean (sucesso/falha)
- `results.unidadesConservacao`: boolean (sucesso/falha)

---

### 5. CAR (Mensal)

**Arquivo:** `scripts/cron/update-car.ts`

**O que faz:**
- Download CAR de **estados prioritários apenas** (10 principais)
- Seed com upsert (atualiza status se mudou)
- Detecta mudanças críticas (> 5% cancelados)
- Log de distribuição de status

**Estados inclusos:** MT, PA, GO, MS, RS, PR, SP, MG, BA, TO

**Teste manual:**
```bash
tsx scripts/cron/update-car.ts
```

**Logs importantes:**
- `statusSummary`: Distribuição de status por estado
- `criticalStates`: Estados com > 5% de CAR irregular

**Nota:** Update completo de todos 27 estados seria muito pesado (horas). Rodamos apenas prioritários (~90% do agro).

---

### 6. Health Check (Diário)

**Arquivo:** `scripts/cron/check-data-freshness.ts`

**O que faz:**
- Verifica idade dos dados em cada fonte
- Compara com SLA esperado
- Classifica: FRESH / STALE / CRITICAL
- Log de métricas

**SLAs Definidos:**
- Lista Suja: 35 dias
- IBAMA: 10 dias
- DETER: 2 dias
- Terras Indígenas: 35 dias
- UCs: 35 dias
- CAR: 35 dias

**Teste manual:**
```bash
tsx scripts/cron/check-data-freshness.ts
```

**Exit codes:**
- `0`: Tudo FRESH ✅
- `1`: Tem STALE ⚠️
- `2`: Tem CRITICAL ❌

---

## 📊 Monitoramento

### Verificar Status das Fontes

```sql
-- Freshness de cada fonte
SELECT
  'Lista Suja' as fonte,
  MAX(created_at) as ultima_atualizacao,
  EXTRACT(DAY FROM NOW() - MAX(created_at)) as dias_atras
FROM lista_suja

UNION ALL

SELECT
  'IBAMA',
  MAX(created_at),
  EXTRACT(DAY FROM NOW() - MAX(created_at))
FROM ibama_embargoes

UNION ALL

SELECT
  'DETER',
  MAX(created_at),
  EXTRACT(DAY FROM NOW() - MAX(created_at))
FROM deter_alerts

UNION ALL

SELECT
  'Terras Indígenas',
  MAX(created_at),
  EXTRACT(DAY FROM NOW() - MAX(created_at))
FROM terras_indigenas

UNION ALL

SELECT
  'UCs',
  MAX(created_at),
  EXTRACT(DAY FROM NOW() - MAX(created_at))
FROM unidades_conservacao

UNION ALL

SELECT
  'CAR',
  MAX(created_at),
  EXTRACT(DAY FROM NOW() - MAX(created_at))
FROM car_registrations;
```

### Dashboard de Logs

```bash
# Resumo de execuções recentes
for log in logs/cron-*.log; do
  echo "=== $(basename $log) ==="
  tail -20 $log | grep -E "(completed|failed)" || echo "No recent execution"
  echo ""
done
```

---

## 🚨 Troubleshooting

### "Download failed"

**Causa:** Conexão com servidor governamental falhou

**Solução:**
1. Verificar conectividade: `ping geoserver.car.gov.br`
2. Tentar novamente manualmente
3. Se persistir, verificar se servidor está down
4. Job tentará novamente na próxima execução

---

### "Seed failed: duplicate key"

**Causa:** Tentativa de inserir registro duplicado

**Solução:**
1. Verificar se script usa `ON CONFLICT DO UPDATE`
2. Limpar tabela manualmente: `TRUNCATE table CASCADE`
3. Re-executar seed

---

### "Critical: Data sources are severely outdated"

**Causa:** Cron job não executou ou falhou repetidamente

**Solução:**
1. Verificar logs: `tail -100 logs/cron-*.log`
2. Executar manualmente para debugar
3. Verificar se crontab está ativo: `crontab -l`
4. Verificar se servidor tem permissões corretas

---

### Logs não aparecem

**Causa:** Permissões ou path incorreto

**Solução:**
1. Verificar se diretório `logs/` existe
2. Verificar permissões: `chmod 755 logs/`
3. Verificar WORKDIR no crontab: `crontab -l | grep WORKDIR`

---

## 🔄 Atualizações Manuais

Se precisar forçar update de uma fonte:

```bash
# DETER
tsx scripts/cron/update-deter.ts

# Lista Suja
tsx scripts/cron/update-lista-suja.ts

# IBAMA
tsx scripts/cron/update-ibama.ts

# Dados Espaciais (TIs + UCs)
tsx scripts/cron/update-spatial-data.ts

# CAR (estados prioritários)
tsx scripts/cron/update-car.ts
```

---

## 📈 Métricas e KPIs

### Data Freshness Score

```sql
-- Score de freshness (0-100)
-- 100 = todos dados dentro do SLA
-- 0 = todos dados críticos

WITH freshness AS (
  SELECT
    CASE
      WHEN EXTRACT(DAY FROM NOW() - MAX(created_at)) <= 2 THEN 100
      WHEN EXTRACT(DAY FROM NOW() - MAX(created_at)) <= 10 THEN 80
      WHEN EXTRACT(DAY FROM NOW() - MAX(created_at)) <= 35 THEN 60
      ELSE 0
    END as score
  FROM deter_alerts

  UNION ALL

  SELECT
    CASE
      WHEN EXTRACT(DAY FROM NOW() - MAX(created_at)) <= 35 THEN 100
      ELSE 0
    END
  FROM lista_suja

  -- ... outras fontes
)
SELECT AVG(score) as freshness_score FROM freshness;
```

### Uptime de Cron Jobs

```bash
# Contar execuções bem-sucedidas vs falhas
grep "completed successfully" logs/cron-*.log | wc -l
grep "failed" logs/cron-*.log | wc -l
```

---

## ✅ Status

- [x] Scripts de atualização criados
- [x] Crontab configurado
- [x] Sistema de logs
- [x] Health check
- [x] Documentação completa
- [ ] Alertas via Telegram (Task #17)
- [ ] Dashboard web de monitoramento
- [ ] Retry automático em caso de falha

---

## 📚 Próximos Passos

1. **Task #17:** Sistema de alertas via Telegram
   - Notificação quando cron job falha
   - Alerta de dados CRITICAL/STALE
   - Resumo semanal de mudanças

2. **Retry Strategy:**
   - Implementar retry com backoff exponencial
   - Max 3 tentativas antes de falhar

3. **Dashboard:**
   - Interface web para monitorar status
   - Gráficos de freshness ao longo do tempo
   - Histórico de execuções
