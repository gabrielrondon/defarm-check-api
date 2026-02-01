# Data Sources - Frequências e SLAs
**Versão:** 1.0
**Data:** 2026-02-01
**Status:** ✅ ATIVO

---

## 📋 Resumo Executivo

Este documento define as frequências de atualização e Service Level Agreements (SLAs) para cada fonte de dados da Check API.

**Fontes Ativas:** 7
**Frequências:** Diária, Semanal, Mensal
**Cobertura:** Nacional

---

## 📊 Visão Geral das Fontes

| Fonte | Categoria | Frequência | SLA Máximo | Criticidade |
|-------|-----------|------------|------------|-------------|
| DETER Alerts | Ambiental | Diária | 2 dias | 🔴 CRÍTICA |
| IBAMA Embargoes | Ambiental | Semanal | 10 dias | 🟠 ALTA |
| Lista Suja | Social | Mensal | 35 dias | 🟠 ALTA |
| Terras Indígenas | Ambiental | Mensal | 35 dias | 🟡 MÉDIA |
| Unidades de Conservação | Ambiental | Mensal | 35 dias | 🟡 MÉDIA |
| CAR Registry | Ambiental | Mensal | 35 dias | 🟡 MÉDIA |
| PRODES Deforestation | Ambiental | Anual | 365 dias | 🟢 BAIXA |

---

## 🔄 Detalhamento por Fonte

### 1. DETER - Alertas de Desmatamento (INPE)

**Informações Gerais:**
- **Nome:** DETER Real-Time Alerts
- **Provedor:** INPE (Instituto Nacional de Pesquisas Espaciais)
- **Categoria:** Ambiental
- **Tipo de Dado:** Geoespacial (alertas de desmatamento em tempo real)

**Frequência de Atualização:**
- **Worker Job:** `update-deter` (daily)
- **Schedule:** Diária às 03:00 BRT
- **Cron:** `0 3 * * *`
- **Janela de Dados:** Últimos 7 dias
- **Retenção:** 90 dias (dados mais antigos são removidos)

**SLAs:**
- **SLA Normal:** 24 horas (1 dia)
- **SLA Máximo:** 48 horas (2 dias)
- **Warning Threshold:** 48 horas
- **Stale Threshold:** 96 horas (4 dias)

**Criticidade:** 🔴 CRÍTICA
- Dados em tempo real para monitoramento de desmatamento
- Essencial para compliance ambiental
- Alertas críticos quando desmatamento ativo é detectado

**Fonte de Dados:**
- URL: http://terrabrasilis.dpi.inpe.br/api/v1/deter-amz
- Formato: GeoJSON
- Cobertura: Amazônia Legal

**Monitoramento:**
- Notificação Telegram se dados > 2 dias
- Alerta crítico se > 5 alertas de DESMATAMENTO detectados
- Health check: status "stale" se > 2 dias

**Ações em Caso de Falha:**
1. Verificar disponibilidade da API do INPE
2. Verificar conectividade de rede
3. Revisar logs do worker
4. Retry automático (3 tentativas com backoff)

---

### 2. IBAMA - Embargos Ambientais

**Informações Gerais:**
- **Nome:** IBAMA Embargoes
- **Provedor:** IBAMA (Instituto Brasileiro do Meio Ambiente)
- **Categoria:** Ambiental
- **Tipo de Dado:** Tabular (CPF/CNPJ com embargos)

**Frequência de Atualização:**
- **Worker Job:** `update-ibama` (weekly)
- **Schedule:** Semanal aos domingos às 02:00 BRT
- **Cron:** `0 2 * * 0`
- **Processamento:** Download ZIP → Conversão CSV → Seed

**SLAs:**
- **SLA Normal:** 7 dias
- **SLA Máximo:** 10 dias
- **Warning Threshold:** 10 dias (7 × 1.5)
- **Stale Threshold:** 14 dias (7 × 2)

**Criticidade:** 🟠 ALTA
- Dados oficiais de embargos ambientais
- Importante para due diligence
- Atualizado frequentemente pelo IBAMA

**Fonte de Dados:**
- URL: https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_embargo/
- Formato: CSV (compactado em ZIP)
- Tamanho: ~15 MB
- Registros: ~122,000 documentos

**Monitoramento:**
- Notificação se > 100 novos embargos detectados
- Notificação se > 50 novos documentos embargados
- Inclui área total embargada em hectares
- Health check: status "stale" se > 10 dias

**Métricas:**
- Total de documentos únicos
- Total de embargos (um documento pode ter múltiplos)
- Área total embargada (hectares)

---

### 3. Lista Suja - Trabalho Escravo (MTE)

**Informações Gerais:**
- **Nome:** Slave Labor Registry
- **Provedor:** MTE (Ministério do Trabalho e Emprego)
- **Categoria:** Social
- **Tipo de Dado:** Tabular (CPF/CNPJ com condenações)

**Frequência de Atualização:**
- **Worker Job:** `update-lista-suja` (monthly)
- **Schedule:** Mensal no dia 1 às 02:00 BRT
- **Cron:** `0 2 1 * *`
- **Processamento:** Download XLSX → Conversão JSON → Seed

**SLAs:**
- **SLA Normal:** 30 dias
- **SLA Máximo:** 35 dias
- **Warning Threshold:** 45 dias (30 × 1.5)
- **Stale Threshold:** 60 dias (30 × 2)

**Criticidade:** 🟠 ALTA
- Dados críticos de compliance social
- Essencial para ESG
- Publicação oficial do governo

**Fonte de Dados:**
- URL: https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/
- Formato: XLSX (Excel)
- Tamanho: ~200 KB
- Registros: ~664 empregadores

**Monitoramento:**
- Notificação para cada adição à lista
- Notificação para cada remoção da lista
- Inclui exemplos de nomes adicionados
- Health check: status "stale" se > 35 dias

**Detecção de Mudanças:**
- Compara documento por documento
- Identifica novos empregadores
- Identifica removidos
- Rastreia histórico de mudanças

---

### 4. Terras Indígenas (FUNAI)

**Informações Gerais:**
- **Nome:** Indigenous Lands
- **Provedor:** FUNAI (Fundação Nacional dos Povos Indígenas)
- **Categoria:** Ambiental
- **Tipo de Dado:** Geoespacial (polígonos de demarcação)

**Frequência de Atualização:**
- **Worker Job:** `update-spatial-data` (monthly)
- **Schedule:** Mensal no dia 1 às 04:00 BRT
- **Cron:** `0 4 1 * *`
- **Processamento:** Download GeoJSON → Seed PostGIS

**SLAs:**
- **SLA Normal:** 30 dias
- **SLA Máximo:** 35 dias
- **Warning Threshold:** 45 dias
- **Stale Threshold:** 60 dias

**Criticidade:** 🟡 MÉDIA
- Dados geoespaciais de terras indígenas
- Importante para compliance territorial
- Atualizado periodicamente pela FUNAI

**Fonte de Dados:**
- URL: https://geoserver.funai.gov.br/
- Formato: GeoJSON/Shapefile
- Tamanho: ~44 MB
- Cobertura: Nacional

**Monitoramento:**
- Notificação após atualização bem-sucedida
- Contagem total de terras indígenas
- Health check: status "stale" se > 35 dias

**Atributos:**
- Nome da terra indígena
- Etnia
- Fase de demarcação (Declarada, Homologada, Regularizada)
- Área em hectares
- Estado e município
- Geometria (MULTIPOLYGON)

---

### 5. Unidades de Conservação (ICMBio)

**Informações Gerais:**
- **Nome:** Conservation Units
- **Provedor:** ICMBio (Instituto Chico Mendes)
- **Categoria:** Ambiental
- **Tipo de Dado:** Geoespacial (áreas protegidas)

**Frequência de Atualização:**
- **Worker Job:** `update-spatial-data` (monthly)
- **Schedule:** Mensal no dia 1 às 04:00 BRT
- **Cron:** `0 4 1 * *`
- **Processamento:** Download GeoJSON → Seed PostGIS

**SLAs:**
- **SLA Normal:** 30 dias
- **SLA Máximo:** 35 dias
- **Warning Threshold:** 45 dias
- **Stale Threshold:** 60 dias

**Criticidade:** 🟡 MÉDIA
- Dados geoespaciais de unidades de conservação
- Importante para análise de compliance territorial
- Atualizado periodicamente pelo ICMBio

**Fonte de Dados:**
- URL: https://geoserver.icmbio.gov.br/
- Formato: GeoJSON/Shapefile
- Cobertura: Nacional

**Monitoramento:**
- Notificação após atualização bem-sucedida
- Contagem total de unidades
- Health check: status "stale" se > 35 dias

**Atributos:**
- Nome da unidade
- Categoria (Parque, Reserva, etc.)
- Grupo (Proteção Integral / Uso Sustentável)
- Esfera (Federal, Estadual, Municipal)
- Área em hectares
- Geometria (MULTIPOLYGON)

---

### 6. CAR - Cadastro Ambiental Rural (SICAR)

**Informações Gerais:**
- **Nome:** CAR Registry
- **Provedor:** SICAR (Sistema Nacional de Cadastro Ambiental Rural)
- **Categoria:** Ambiental
- **Tipo de Dado:** Geoespacial + Tabular

**Frequência de Atualização:**
- **Worker Job:** `update-car` (monthly)
- **Schedule:** Mensal no dia 15 às 03:00 BRT
- **Cron:** `0 3 15 * *`
- **Escopo:** Estados prioritários (MT, PA, RO, AM)

**SLAs:**
- **SLA Normal:** 30 dias
- **SLA Máximo:** 35 dias
- **Warning Threshold:** 45 dias
- **Stale Threshold:** 60 dias

**Criticidade:** 🟡 MÉDIA
- Dados cadastrais de propriedades rurais
- Importante para rastreabilidade
- Volume massivo de dados

**Fonte de Dados:**
- URL: https://www.car.gov.br/
- Formato: CSV/Shapefile (por estado)
- Tamanho: Varia por estado (GB)
- Cobertura: Estados prioritários

**Monitoramento:**
- Alerta se > 5% de CAR irregulares (cancelados/suspensos)
- Notificação de mudanças críticas por estado
- Health check: status "stale" se > 35 dias

**Atributos:**
- Número do CAR
- Status (Ativo, Pendente, Cancelado, Suspenso)
- CPF/CNPJ do proprietário
- Nome da propriedade
- Área em hectares
- Geometria (quando disponível)

**Estratégia de Otimização:**
- Download apenas de estados prioritários
- Particionamento por estado (futuro)
- Indexação por status e documento

---

### 7. PRODES - Desmatamento Anual (INPE)

**Informações Gerais:**
- **Nome:** PRODES Deforestation
- **Provedor:** INPE (Instituto Nacional de Pesquisas Espaciais)
- **Categoria:** Ambiental
- **Tipo de Dado:** Geoespacial (desmatamento consolidado)

**Frequência de Atualização:**
- **Worker Job:** Manual/Anual
- **Schedule:** Anual (quando INPE publica novos dados)
- **Última Atualização:** Agosto de cada ano

**SLAs:**
- **SLA Normal:** 365 dias
- **SLA Máximo:** 400 dias
- **Warning Threshold:** N/A (dados anuais)
- **Stale Threshold:** 730 dias (2 anos)

**Criticidade:** 🟢 BAIXA
- Dados históricos consolidados
- Atualizado anualmente pelo INPE
- Complementa dados do DETER

**Fonte de Dados:**
- URL: http://terrabrasilis.dpi.inpe.br/
- Formato: Shapefile/GeoJSON
- Cobertura: Amazônia Legal
- Período: Anual (agosto a julho)

**Monitoramento:**
- Sem notificações automáticas
- Atualização manual quando novos dados disponíveis
- Health check: dados anuais não expiram rapidamente

**Uso:**
- Análise histórica de desmatamento
- Cruzamento com propriedades e CAR
- Dados consolidados e validados

---

## ⚡ Políticas de Retry e Failover

### **Retry Automático**
Todos os workers implementam retry com backoff exponencial:
- **Tentativas:** 3 por execução
- **Delays:** 5s → 10s → 20s
- **Timeout máx:** 5 minutos entre tentativas

### **Notificações de Falha**
- 1ª falha: Notificação simples
- 2ª falha: Notificação com contador
- 3ª falha consecutiva: 🔴 ALERTA CRÍTICO

### **Sistema Degradado**
Alerta enviado quando ≥ 2 jobs com 3+ falhas consecutivas:
- Checklist de diagnóstico incluído
- Sugestões de ações corretivas
- Escalação para time de infraestrutura

---

## 📈 Monitoramento e Alertas

### **Health Check Endpoint**
```
GET /health
```

Retorna status de freshness de cada fonte:
- `fresh` - Dentro do SLA
- `warning` - Próximo ao limite do SLA
- `stale` - Acima do SLA máximo
- `never_updated` - Nunca recebeu dados

### **Workers Health Endpoint**
```
GET /workers/health
```

Retorna métricas dos jobs:
- Total de execuções
- Taxa de sucesso
- Falhas consecutivas
- Última execução bem-sucedida

### **Telegram Notifications**
Notificações em tempo real para:
- Início/fim de cada job
- Novos registros detectados
- Mudanças críticas
- Falhas e erros
- Dados obsoletos

---

## 🎯 Garantias de SLA

### **Uptime do Sistema**
- **Target:** 99.5% uptime
- **Medição:** Mensal
- **Downtime Permitido:** ~3.6 horas/mês

### **Disponibilidade de Dados**
- **Críticos (DETER):** 99% dentro do SLA de 2 dias
- **Alta Prioridade (IBAMA, Lista Suja):** 95% dentro do SLA
- **Média Prioridade (TIs, UCs, CAR):** 90% dentro do SLA

### **Performance**
- **API Response Time:** < 500ms (p95)
- **Check Endpoint:** < 2s com cache miss
- **Geospatial Queries:** < 5s

---

## 📋 Checklist de Operações

### **Diário**
- [ ] Verificar execução do DETER job (03:00 BRT)
- [ ] Verificar data freshness check (08:00 BRT)
- [ ] Revisar notificações Telegram
- [ ] Monitorar alertas críticos

### **Semanal**
- [ ] Verificar execução do IBAMA job (Domingo 02:00 BRT)
- [ ] Revisar métricas de workers (/workers/health)
- [ ] Analisar taxa de sucesso dos jobs
- [ ] Verificar performance da API

### **Mensal**
- [ ] Verificar Lista Suja (dia 1, 02:00 BRT)
- [ ] Verificar Spatial Data - TIs e UCs (dia 1, 04:00 BRT)
- [ ] Verificar CAR (dia 15, 03:00 BRT)
- [ ] Revisar e atualizar documentação de SLAs
- [ ] Analisar tendências de dados

### **Anual**
- [ ] Atualizar dados PRODES quando disponíveis (Agosto)
- [ ] Revisar e ajustar SLAs baseado em desempenho real
- [ ] Planejar melhorias de infraestrutura

---

## 🔧 Troubleshooting

### **Problema: Job Falhando Consecutivamente**
1. Verificar logs do worker
2. Testar API governamental manualmente
3. Verificar conectividade de rede
4. Revisar credenciais se aplicável
5. Verificar limites de recursos (CPU, memória)

### **Problema: Dados Stale**
1. Verificar última execução bem-sucedida
2. Verificar se API governamental está online
3. Executar job manualmente para teste
4. Revisar logs de erro
5. Escalar se problema persistir

### **Problema: API Lenta**
1. Verificar cache hit rate
2. Analisar queries lentas no banco
3. Verificar uso de índices
4. Considerar otimização de queries geoespaciais
5. Avaliar necessidade de escalonamento

---

## 📞 Contatos e Escalação

### **Nível 1 - Monitoramento**
- Telegram Bot: DeFarm_Checker_Bot
- Health Check: /health endpoint
- Workers Health: /workers/health endpoint

### **Nível 2 - Investigação**
- Railway Logs: Dashboard > Worker Service > Logs
- Database Metrics: Railway Dashboard > PostgreSQL
- Redis Metrics: Railway Dashboard > Redis

### **Nível 3 - Ações Corretivas**
- Manual Job Execution: `railway run`
- Database Access: `railway shell postgres`
- Worker Restart: Railway Dashboard > Restart

---

## 📚 Referências

### **APIs Governamentais**
- INPE TerraBrasilis: http://terrabrasilis.dpi.inpe.br/
- IBAMA Dados Abertos: https://dadosabertos.ibama.gov.br/
- MTE Inspeção do Trabalho: https://www.gov.br/trabalho-e-emprego/
- FUNAI GeoServer: https://geoserver.funai.gov.br/
- ICMBio GeoServer: https://geoserver.icmbio.gov.br/
- SICAR: https://www.car.gov.br/

### **Documentação Interna**
- WORKER_STATUS.md - Status dos workers
- RAILWAY_INFRASTRUCTURE_REPORT.md - Infraestrutura
- CRITICAL_ALERTS_IMPLEMENTATION.md - Sistema de alertas
- E2E_TESTS_REPORT.md - Testes automatizados

---

## ✅ Controle de Versão

| Versão | Data | Autor | Mudanças |
|--------|------|-------|----------|
| 1.0 | 2026-02-01 | Auto-generated | Versão inicial - SLAs definidos |

---

**Última Atualização:** 2026-02-01
**Próxima Revisão:** 2026-03-01
**Status:** ✅ ATIVO
