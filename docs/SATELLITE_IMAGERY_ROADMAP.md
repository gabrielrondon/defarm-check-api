# Satellite Imagery Roadmap

Oportunidades de análise baseada em imagens de satélite para o DeFarm Check API.
Organizadas por prioridade e valor para o produto.

---

## Sumário de Oportunidades

### Alta Prioridade (implementar primeiro)

| # | Checker | Fonte | API | Custo | Impacto |
|---|---------|-------|-----|-------|---------|
| 1 | **MapBiomas Land Use History** | MapBiomas Collection | REST/GraphQL | Gratuito (token) | Histórico uso do solo 1985-2024 |
| 2 | **Reserva Legal Compliance** | MapBiomas + CAR DB | Depende do #1 | Gratuito | Verificar se RL declarada existe |
| 3 | **Pasture Degradation (NDVI)** | NASA APPEEARS | REST | Gratuito | Detectar pasto degradado |
| 4 | **Land Conversion History** | MapBiomas Collection | REST/GraphQL | Gratuito (token) | Trajetória floresta→pasto→lavoura |

### Média Prioridade

| # | Checker | Fonte | API | Custo | Impacto |
|---|---------|-------|-----|-------|---------|
| 5 | **Productivity vs. Regional Benchmark** | MODIS MOD17/GPP | NASA APPEEARS | Gratuito | NDVI/GPP vs benchmark municipal |
| 6 | **Irrigation without Outorga** | Sentinel-1 SAR + ANA | Sentinel Hub | ~USD 25/mo | Detectar irrigação sem outorga |
| 7 | **Soil Exposure / Erosion Risk** | Sentinel-2 (BSI/NDVI) | Sentinel Hub | ~USD 25/mo | Solo exposto, risco erosão |
| 8 | **Crop Mapping** | Sentinel-2 | Sentinel Hub | ~USD 25/mo | Identificar culturas na propriedade |

### Baixa Prioridade / Futuro

| # | Checker | Fonte | API | Custo | Impacto |
|---|---------|-------|-----|-------|---------|
| 9 | **Carbon Stock Estimation** | GEDI NASA LiDAR | NASA API | Gratuito | Estoque de carbono/biomassa |
| 10 | **Water Body Monitoring** | JRC/Landsat | GEE | Gratuito (setup) | Corpos d'água e reservatórios |
| 11 | **Fire Scar Mapping** | MODIS/VIIRS | NASA FIRMS | Gratuito | Cicatrizes de incêndio históricas |
| 12 | **Phenology (crop cycles)** | MODIS/Sentinel | NASA APPEEARS | Gratuito | Ciclos de plantio/colheita |

---

## Fontes de Dados

### Fontes Gratuitas

```
┌─────────────────────────────────────────────────────────────────────┐
│ Fonte                 │ Resolução │ Revisita │ Cobertura            │
├───────────────────────┼───────────┼──────────┼──────────────────────┤
│ MapBiomas Collection  │ 30m       │ Anual    │ Brasil (1985-2024)   │
│ MODIS (NASA)          │ 250m-1km  │ Diário   │ Global               │
│ Sentinel-2 (ESA)      │ 10m       │ 5 dias   │ Global               │
│ Landsat (USGS)        │ 30m       │ 16 dias  │ Global               │
│ GEDI (NASA LiDAR)     │ 25m       │ ~1 mês   │ -52° a +52° lat      │
│ NASA APPEEARS API     │ variado   │ variado  │ Time-series por ponto│
│ CHIRPS (precipitação) │ 5km       │ Diário   │ Global               │
│ CBERS (INPE)          │ 20m       │ 5 dias   │ Brasil               │
│ NASA FIRMS (queimadas)│ 375m      │ Diário   │ Global               │
└───────────────────────┴───────────┴──────────┴──────────────────────┘
```

### Fontes Pagas

```
┌─────────────────────────────────────────────────────────────────────┐
│ Fonte           │ Resolução │ Revisita │ Custo aprox.              │
├─────────────────┼───────────┼──────────┼────────────────────────────┤
│ Planet Labs     │ 3-5m      │ Diário   │ USD 500-2000+/mês         │
│ Sentinel Hub    │ 10m       │ 5 dias   │ USD 25-200/mês            │
│ Airbus Pléiades │ 50cm      │ 1 dia    │ Por cena (caro)           │
│ Google EE Comm. │ variado   │ variado  │ USD 0.10-4.00 / 1000 req  │
└─────────────────┴───────────┴──────────┴────────────────────────────┘
```

---

## Detalhamento por Checker

### 1. MapBiomas Land Use History Checker
**Status:** ✅ Em implementação

**O que faz:**
- Retorna histórico de uso do solo (1985–2024) para um ponto ou polígono CAR
- Detecta conversões: floresta → pastagem → lavoura
- Identifica se área foi desmatada antes do cadastro no CAR
- Classifica risco por tipo de uso atual e histórico

**API:** `https://api.mapbiomas.org/api/v1/statistics`
- Requer: Token gratuito (cadastro em https://mapbiomas.org)
- Env var: `MAPBIOMAS_API_KEY`
- Método: POST (latitude, longitude)

**Classes de uso do solo (principais):**

| ID | Classe | Risco |
|----|--------|-------|
| 3 | Formação Florestal | ✅ Boa |
| 4 | Formação Savânica | ✅ Boa |
| 12 | Formação Campestre | ✅ OK |
| 15 | Pastagem | ⚠️ Verificar |
| 21 | Mosaico Agropecuária | ⚠️ Verificar |
| 39 | Soja | ⚠️ Verificar |
| 41 | Outras Temporárias | ⚠️ Verificar |
| 22 | Área não Vegetada | ❌ Risco |
| 30 | Mineração | ❌ Risco Alto |
| 24 | Área Urbana | ❌ Risco |

**Lógica de resultado:**
- FAIL/HIGH: Floresta nativa convertida nos últimos 5 anos
- FAIL/CRITICAL: Conversão em área protegida (TI, UC)
- WARNING: Conversão > 5 anos atrás (precisa cruzar com CAR)
- PASS: Sem conversão detectada
- INFO: Trajetória histórica completa no `details`

---

### 2. Reserva Legal Compliance Checker
**Status:** 📋 Planejado (depende do #1)

**O que faz:**
- Verifica se a área de Reserva Legal declarada no CAR existe de fato
- Cruza o polígono RL do CAR com a cobertura vegetal do MapBiomas
- Calcula % de conformidade (cobertura vegetal real na RL)

**Lógica:**
```
RL do CAR (geometria) × MapBiomas Coleção (raster anual)
→ % de vegetação nativa na área de RL declarada
→ < 80%: WARNING | < 50%: FAIL | ≥ 80%: PASS
```

**Valor para o produto:**
- Bancos: due diligence para crédito rural
- Certificadoras: conformidade com Código Florestal
- Seguros: risco de passivo ambiental

---

### 3. Pasture Degradation Checker (NDVI)
**Status:** 📋 Planejado

**O que faz:**
- Série temporal de NDVI dos últimos 3 anos via NASA APPEEARS
- Detecta tendência de queda (degradação progressiva)
- Compara NDVI médio da propriedade vs. benchmark do bioma
- Identifica abandono (NDVI muito baixo por período prolongado)

**API:** `https://appeears.earthdatacloud.nasa.gov/api/`
- Dataset: MOD13Q1.061 (MODIS NDVI, 250m, 16 dias)
- Gratuito com NASA Earthdata account
- Env var: `NASA_EARTHDATA_TOKEN`

**Lógica de resultado:**
- FAIL/HIGH: Tendência de queda > 20% em 2 anos
- WARNING: NDVI < 50% do benchmark do bioma
- PASS: NDVI estável ou crescente

---

### 4. Land Use Conversion History Checker
**Status:** 📋 Planejado

**O que faz:**
- Analisa trajetória completa de uso do solo (1985-2024)
- Identifica quando ocorreu conversão de floresta para uso antrópico
- Verifica se conversão é anterior ao Código Florestal de 2012 (anistia)

**Valor:**
- CNPJ/CPF: Contextualizar histórico de uso da terra do produtor
- CAR: Verificar conformidade com corte temporal do Código Florestal
- Coordenadas: Análise rápida de qualquer ponto do território

---

### 5. Productivity vs. Regional Benchmark (NDVI/GPP)
**Status:** 📋 Planejado

**O que faz:**
- Compara NDVI/GPP (Gross Primary Productivity) da propriedade
  com a média do município/bioma
- Detecta sub-utilização de área (possível abandono ou uso irregular)
- Útil para crédito rural e avaliação de risco agro

**API:** NASA APPEEARS + MODIS MOD17A3 (GPP anual)

---

### 6. Irrigation Detection Checker
**Status:** 📋 Futuro

**O que faz:**
- Usa Sentinel-1 SAR (radar, funciona com nuvens) para detectar pivôs
  e áreas irrigadas
- Cruza com outorgas ANA já no nosso banco
- Detecta irrigação sem autorização legal

**Desafio:** Sentinel-1 não está mais ativo (Sentinel-1B falhou em 2021).
Alternativas: Sentinel-1A (parcial), ALOS-2, Sentinel-1C (2023+).

---

## Arquitetura de Integração

### Opção A: API on-demand (implementado primeiro)
```
Request → Checker → External API → Result
                ↓ (cache 24h)
               Redis
```
- Pros: Dados sempre frescos, sem storage adicional
- Contras: Latência 1-5s, custo por requisição

### Opção B: Pre-computed + cache em banco (futuro)
```
Cron Job → Download raster → Processar por polígono CAR → Salvar em DB
→ Request → Checker → DB query (rápido)
```
- Pros: Respostas em <100ms, sem dependência externa em runtime
- Contras: Storage elevado (TBs de rasters), pipeline de processamento

### Recomendação
Começar com **Opção A** para os primeiros checkers.
Migrar para **Opção B** para os mais utilizados (custo/latência justificam).

---

## Configuração de Variáveis de Ambiente

```bash
# MapBiomas Collection API (gratuito, requer cadastro)
MAPBIOMAS_API_KEY=seu_token_aqui

# NASA Earthdata (gratuito, requer cadastro)
# https://urs.earthdata.nasa.gov/users/new
NASA_EARTHDATA_TOKEN=seu_token_aqui

# Sentinel Hub (pago - USD 25+/mês)
# https://www.sentinel-hub.com/
SENTINEL_HUB_CLIENT_ID=seu_client_id
SENTINEL_HUB_CLIENT_SECRET=seu_client_secret

# Google Earth Engine (configuração especial)
GEE_SERVICE_ACCOUNT=sua_conta_servico@gee.iam.gsa.com
GEE_PRIVATE_KEY_PATH=./gee-key.json
```

---

## Como Obter as Credenciais

### MapBiomas API Token (GRATUITO)
1. Acesse https://mapbiomas.org/en/registration
2. Crie uma conta (pesquisa/uso não comercial é gratuito)
3. Vá em "My Account" → "API Access" → gere um token
4. Configure `MAPBIOMAS_API_KEY=<token>` no Railway e .env

### NASA Earthdata Token (GRATUITO)
1. Acesse https://urs.earthdata.nasa.gov/users/new
2. Crie uma conta NASA Earthdata (gratuito)
3. Em "My Profile" → "Generate Token"
4. Configure `NASA_EARTHDATA_TOKEN=<token>` no Railway e .env

### Sentinel Hub (PAGO)
1. Acesse https://www.sentinel-hub.com/
2. Plano Exploration: gratuito (uso limitado)
3. Plano Basic: USD 25/mês (25.000 processing units)
4. Crie uma "OAuth client" em Dashboard → User Settings

---

## Referências e Links

- [MapBiomas Platform](https://mapbiomas.org)
- [MapBiomas API Docs](https://api.mapbiomas.org/docs)
- [NASA APPEEARS](https://appeears.earthdatacloud.nasa.gov/)
- [MODIS Land Products](https://modis.gsfc.nasa.gov/data/dataprod/)
- [Sentinel Hub](https://www.sentinel-hub.com/)
- [NASA FIRMS (Fire)](https://firms.modaps.eosdis.nasa.gov/)
- [GEDI Mission](https://gedi.umd.edu/)
- [Global Forest Watch](https://www.globalforestwatch.org/)
- [Copernicus Data Space](https://dataspace.copernicus.eu/)
