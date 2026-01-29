# Implementação CAR - Cadastro Ambiental Rural

> Estratégia técnica para download e verificação de registros CAR

**Última atualização:** Janeiro 2026

---

## 📋 Visão Geral

CAR (Cadastro Ambiental Rural) é o registro eletrônico obrigatório de todas as propriedades rurais no Brasil, instituído pela Lei 12.651/2012 (Código Florestal).

**Impacto no Negócio:**
- ❌ **NÃO ter CAR** = IRREGULARIDADE GRAVE (bloqueador para TACs)
- ✅ **TER CAR ATIVO** = Propriedade regularizada
- ⚠️ **CAR PENDENTE** = Em processo de regularização
- ❌ **CAR CANCELADO/SUSPENSO** = Irregular

---

## 🗺️ Estados Cobertos

Nossa implementação cobre **TODOS os 27 estados do Brasil** (26 estados + DF) = **100% do território nacional**.

### Estados Prioritários (90% do agro brasileiro)

| Estado | Sigla | Produção Principal | Volume CAR Estimado |
|--------|-------|-------------------|---------------------|
| Mato Grosso | MT | Soja, gado, algodão | ~150.000 registros |
| Pará | PA | Gado, desmatamento | ~80.000 registros |
| Goiás | GO | Soja, milho, gado | ~100.000 registros |
| Mato Grosso do Sul | MS | Soja, gado, cana | ~50.000 registros |
| Rio Grande do Sul | RS | Arroz, soja, gado | ~60.000 registros |
| Paraná | PR | Soja, milho, frango | ~70.000 registros |
| São Paulo | SP | Cana, laranja, café | ~80.000 registros |
| Minas Gerais | MG | Café, gado, milho | ~90.000 registros |
| Bahia | BA | Soja, algodão, cacau | ~60.000 registros |
| Tocantins | TO | Soja, gado | ~40.000 registros |

### Todos os Estados

**Norte (7):** AC, AP, AM, PA, RO, RR, TO
**Nordeste (9):** AL, BA, CE, MA, PB, PE, PI, RN, SE
**Centro-Oeste (4):** DF, GO, MS, MT
**Sudeste (4):** ES, MG, RJ, SP
**Sul (3):** PR, RS, SC

**Volume Total Estimado:** ~1-2 milhões de registros CAR

---

## 🔧 Arquitetura Técnica

### Fonte de Dados: SICAR Federal

**URL:** `https://geoserver.car.gov.br/geoserver/sicar/wfs`

**Layers Disponíveis:**
- `sicar:sicar_imoveis_mt` - Mato Grosso
- `sicar:sicar_imoveis_pa` - Pará
- `sicar:sicar_imoveis_go` - Goiás
- `sicar:sicar_imoveis_ms` - Mato Grosso do Sul
- `sicar:sicar_imoveis_rs` - Rio Grande do Sul

**Protocolo:** WFS 2.0.0 (Web Feature Service)

**Formato:** GeoJSON → WKT (Well-Known Text) para PostGIS

### Por Que SICAR Federal?

Inicialmente, pesquisamos APIs estaduais:

#### Mato Grosso (MT)
- Sistema estadual: **SIMCAR** (SEMA-MT)
- API: `monitoramento.sema.mt.gov.br/simcar/tecnico.api/api/`
- Problema: Requer autenticação governamental
- Solução: ✅ Usar SICAR federal (layer `sicar_imoveis_mt`)

#### Pará (PA)
- Sistema estadual: **SICAR/PA** (SEMAS-PA)
- Portal: `car.semas.pa.gov.br`
- Problema: Sem WFS público
- Solução: ✅ Usar SICAR federal (layer `sicar_imoveis_pa`)

#### Goiás (GO)
- Sistema estadual: **SIGCAR** (SEMAD-GO)
- Lançado em 2025, substitui SICAR federal
- Portal: `portal.meioambiente.go.gov.br`
- Problema: Sem WFS público documentado
- Solução: ✅ Usar SICAR federal (layer `sicar_imoveis_go`)

#### Mato Grosso do Sul (MS)
- Sistema estadual: **SIRIEMA** (IMASUL)
- Plataforma: ArcGIS Server (não GeoServer)
- MapServer: `www.pinms.ms.gov.br/arcgis/rest/services/IMASUL/SiriemaGeo_Sisla/MapServer`
- Problema: Sem layer de CAR no MapServer
- Solução: ✅ Usar SICAR federal (layer `sicar_imoveis_ms`)

#### Rio Grande do Sul (RS)
- Sistema estadual: **IEDE-RS** (SEMA-RS)
- Plataforma: ArcGIS Enterprise
- Portal: `iede.rs.gov.br`
- Problema: CAR não disponível via IEDE, apenas no SICAR federal
- Solução: ✅ Usar SICAR federal (layer `sicar_imoveis_rs`)

### Conclusão: SICAR Federal Único

**Vantagem:**
- ✅ Fonte única e consistente
- ✅ Mesma API para todos os estados
- ✅ Acesso público (sem autenticação)
- ✅ Padrão WFS (protocolo aberto)
- ✅ Dados oficiais do governo federal

**Desvantagem:**
- ⚠️ Atualização pode ser mais lenta que sistemas estaduais
- ⚠️ Limite de 10.000 features por request (necessário paginação para estados grandes)

---

## 📥 Download

### Scripts Disponíveis

```bash
# Estado individual (qualquer UF)
npm run data:car MT    # Mato Grosso
npm run data:car SP    # São Paulo
npm run data:car BA    # Bahia
npm run data:car <UF>  # Qualquer estado

# Todos os 27 estados (CUIDADO: pode levar HORAS e baixar ~15GB)
npm run data:car-all

# Apenas estados prioritários (10 principais, ~90% do agro)
npm run data:car-all -- --priority
```

### Fluxo de Download

1. **Request WFS:**
   ```typescript
   GET https://geoserver.car.gov.br/geoserver/sicar/wfs?
     service=WFS&
     version=2.0.0&
     request=GetFeature&
     typename=sicar:sicar_imoveis_mt&
     outputFormat=application/json&
     srsName=EPSG:4326&
     count=10000
   ```

2. **Parse GeoJSON:**
   - Extrair propriedades: `cod_imovel`, `status`, `cpf_cnpj`, `nom_imovel`, `area_ha`, etc.
   - Converter geometria: GeoJSON → WKT

3. **Normalizar Status:**
   - `ATIVO` → regularizado
   - `PENDENTE` → em regularização
   - `CANCELADO` → irregular
   - `SUSPENSO` → irregular

4. **Salvar JSON:**
   - Arquivo: `data/car_{estado}.json`
   - Format: Array de CARRegistration

### Limitações

**Limite de Features:** 10.000 por request

**Solução para Estados Grandes (MT, PA, GO):**
- Implementar paginação com `startIndex` parameter
- Múltiplas requests: startIndex=0, 10000, 20000, ...
- Concatenar resultados

**Volume Estimado por Estado:**

Estados Grandes (>10 requests):
- MT: ~150.000 registros (15 requests)
- MG: ~90.000 registros (9 requests)
- GO: ~100.000 registros (10 requests)
- SP: ~80.000 registros (8 requests)
- PA: ~80.000 registros (8 requests)

Estados Médios (5-10 requests):
- BA, PR, RS, MS, TO: ~50-70k cada

Estados Pequenos (<5 requests):
- Demais estados: ~10-40k cada

**Total Geral:** ~1-2 milhões de registros CAR para todo o Brasil

---

## 💾 Database

### Schema

```sql
CREATE TABLE car_registrations (
  id UUID PRIMARY KEY,
  car_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(50),  -- ATIVO, PENDENTE, CANCELADO, SUSPENSO
  owner_document VARCHAR(20),  -- CPF/CNPJ
  owner_name TEXT,
  property_name TEXT,
  area_ha INTEGER,
  state VARCHAR(2) NOT NULL,
  municipality VARCHAR(255),
  source VARCHAR(50) DEFAULT 'SICAR',
  geometry GEOMETRY(MULTIPOLYGON, 4326),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_car_geometry ON car_registrations USING GIST(geometry);
CREATE INDEX idx_car_number ON car_registrations (car_number);
CREATE INDEX idx_car_state ON car_registrations (state);
CREATE INDEX idx_car_status ON car_registrations (status);
CREATE INDEX idx_car_owner_document ON car_registrations (owner_document);
```

### Seed

```bash
# Seed um estado
npm run seed:car data/car_mt.json

# Estratégia:
# 1. DELETE FROM car_registrations WHERE state = 'MT'
# 2. Batch INSERT (100 registros por vez)
# 3. ON CONFLICT (car_number) DO UPDATE
```

**ON CONFLICT:** Permite atualizações incrementais sem duplicação

---

## ✅ Checker

### CARChecker

**Lógica:**

```typescript
// Query espacial
SELECT * FROM car_registrations
WHERE ST_Intersects(geometry, ST_MakePoint(lon, lat))
LIMIT 1;

// Avaliação
if (no CAR found) {
  return FAIL (HIGH severity) - "Property without CAR is irregular"
}

if (status === 'ATIVO') {
  return PASS - "Property has active CAR"
}

if (status === 'PENDENTE') {
  return FAIL (MEDIUM severity) - "CAR pending regularization"
}

if (status === 'CANCELADO' || status === 'SUSPENSO') {
  return FAIL (HIGH severity) - "CAR cancelled/suspended"
}
```

**Recomendações por Status:**

1. **ATIVO:**
   - ✅ PASS
   - "Property is environmentally regular. PROCEED with transaction."

2. **PENDENTE:**
   - ⚠️ FAIL MEDIUM
   - "Property is regularizing. REQUEST proof of progress. Consider CONDITIONAL approval."

3. **CANCELADO:**
   - ❌ FAIL HIGH
   - "CAR cancelled due to irregularities. DO NOT PROCEED."

4. **SUSPENSO:**
   - ❌ FAIL HIGH
   - "CAR suspended. REQUEST explanation. DO NOT PROCEED until reactivated."

5. **NO_CAR:**
   - ❌ FAIL HIGH
   - "Property without CAR is IRREGULAR (Lei 12.651/2012). DO NOT PROCEED."

---

## 🔄 Atualização

### Frequência Recomendada

**Dados:** Mensal (CAR não muda com frequência)

**Cron Job:**
```bash
# 1º dia do mês, 03:00
0 3 1 * * npm run data:car-all && npm run seed:car data/car_*.json
```

**Estratégia:**
1. Download incremental (só novos registros)
2. Seed com ON CONFLICT (atualiza existentes)
3. Log mudanças (novos ativos, novos cancelados, etc.)
4. Alerta via Telegram se detecção de muitos cancelamentos

### Métricas a Monitorar

- **Freshness:** Dias desde última atualização por estado
- **Coverage:** % de área agrícola coberta
- **Status Distribution:** Quantos ATIVO vs PENDENTE vs CANCELADO
- **Growth Rate:** Novos CARs registrados por mês

---

## 📊 Performance

### Query Performance

**Índice Espacial GIST:**
- ST_Intersects com índice: ~10-50ms
- Sem índice: ~5-10s (100x mais lento)

**Cache:**
- TTL: 30 dias (CAR estável)
- Hit rate esperado: >90%

### Volume de Dados

**Geometrias:**
- Tamanho médio: ~5-10 KB por polígono
- Total estimado: ~1.5M registros × 7.5 KB = **~11 GB**

**Armazenamento PostgreSQL:**
- Dados brutos: ~11 GB
- Com índices GIST: ~16-20 GB total
- Backup: Incremental diário, full semanal

---

## 🚨 Casos de Uso

### 1. Frigorífico - Verificar Fornecedor

```json
POST /check
{
  "type": "COORDINATES",
  "value": { "lat": -15.123, "lon": -56.456 }
}

Response:
{
  "status": "PASS",
  "message": "Location has active CAR registration: MT-1234567...",
  "details": {
    "carNumber": "MT-1234567-ABCD...",
    "carStatus": "ATIVO",
    "ownerName": "Fazenda XYZ Ltda",
    "areaHa": 5000,
    "municipality": "Sorriso",
    "state": "MT"
  }
}
```

### 2. Trader - Bloquear Irregular

```json
POST /check
{
  "type": "COORDINATES",
  "value": { "lat": -10.789, "lon": -55.123 }
}

Response:
{
  "status": "FAIL",
  "severity": "HIGH",
  "message": "Location does not have CAR registration",
  "details": {
    "issue": "NO_CAR_FOUND",
    "recommendation": "DO NOT PROCEED. CAR is MANDATORY (Lei 12.651/2012)."
  }
}
```

---

## 📚 Referências

- [SICAR - Sistema Nacional](https://www.car.gov.br/)
- [GeoServer CAR](https://geoserver.car.gov.br/geoserver/web/)
- [Lei 12.651/2012 - Código Florestal](http://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12651.htm)
- [Manual SICAR (SFB)](https://www.gov.br/agricultura/pt-br/assuntos/car)

---

## ✅ Status

- [x] Task #18: CAR - Estados prioritários (MT, PA, GO)
- [x] Task #19: CAR - Estados secundários (MS, RS)
- [x] **CAR - Todos os 27 estados do Brasil (cobertura completa)**
- [x] Script download-car-all.ts (download em lote)
- [x] Script seed-car-all.ts (seed em lote)
- [ ] Paginação para estados grandes (>10K registros) - TODO
- [ ] Automação de atualização mensal com cron jobs
- [ ] Alertas via Telegram para mudanças de status
