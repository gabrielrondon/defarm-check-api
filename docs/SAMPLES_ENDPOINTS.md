# Samples Endpoints - Testing Reference

**Last Updated:** 2026-02-16
**Purpose:** Quick reference for all `/samples/*` endpoints

## Overview

Sample endpoints return real data from the database that you can use to test the API without needing to know specific documents or coordinates. Each endpoint returns 10 random samples with pre-built `testUrl` fields for easy testing.

## 🇧🇷 Brazil Endpoints

### GET /samples/lista-suja
Returns CPF/CNPJ found in the Slave Labor Registry (MTE).

**Response:**
```json
{
  "source": "Lista Suja do Trabalho Escravo (MTE)",
  "count": 10,
  "samples": [{
    "document": "12345678000190",
    "documentFormatted": "12.345.678/0001-90",
    "name": "Empresa XYZ",
    "type": "CNPJ",
    "state": "PA",
    "year": 2024,
    "workersAffected": 15,
    "testUrl": "POST /check {\"input\":{\"type\":\"CNPJ\",\"value\":\"12345678000190\"}}"
  }]
}
```

### GET /samples/ibama
Returns CPF/CNPJ with IBAMA environmental embargoes.

**Response:**
```json
{
  "source": "IBAMA Embargoes",
  "count": 10,
  "samples": [{
    "document": "12345678000190",
    "type": "CNPJ",
    "name": "Fazenda ABC",
    "embargoCount": 3,
    "totalAreaHa": 500,
    "testUrl": "POST /check {\"input\":{\"type\":\"CNPJ\",\"value\":\"12345678000190\"}}"
  }]
}
```

### GET /samples/cgu-sancoes
Returns CPF/CNPJ with CGU sanctions (CEIS, CNEP, CEAF).

**Response:**
```json
{
  "source": "CGU - Sanções (CEIS, CNEP, CEAF)",
  "count": 10,
  "samples": [{
    "document": "12345678909",
    "documentFormatted": "123.456.789-09",
    "name": "João Silva",
    "type": "CPF",
    "sanctionType": "CEIS",
    "category": "Fraude em licitação",
    "status": "ATIVO",
    "startDate": "2023-01-15",
    "endDate": "2025-01-15",
    "testUrl": "POST /check {\"input\":{\"type\":\"CPF\",\"value\":\"12345678909\"}}"
  }]
}
```

### GET /samples/terras-indigenas
Returns coordinates inside Indigenous Lands (FUNAI).

**Response:**
```json
{
  "source": "Terras Indígenas (FUNAI)",
  "count": 10,
  "samples": [{
    "name": "Terra Indígena Kayapó",
    "etnia": "Kayapó",
    "phase": "Homologada",
    "areaHa": 3284005,
    "municipality": "São Félix do Xingu",
    "state": "PA",
    "coordinates": {"lat": -7.5, "lon": -51.8},
    "testUrl": "POST /check {\"input\":{\"type\":\"COORDINATES\",\"value\":{\"lat\":-7.5,\"lon\":-51.8}}}"
  }]
}
```

### GET /samples/unidades-conservacao
Returns coordinates inside Conservation Units (ICMBio).

**Response:**
```json
{
  "source": "Unidades de Conservação (ICMBio)",
  "count": 10,
  "samples": [{
    "name": "Parque Nacional da Amazônia",
    "category": "Parque Nacional",
    "group": "Proteção Integral",
    "areaHa": 994000,
    "municipality": "Itaituba",
    "state": "PA",
    "sphere": "Federal",
    "coordinates": {"lat": -4.2, "lon": -56.5},
    "testUrl": "POST /check {\"input\":{\"type\":\"COORDINATES\",\"value\":{\"lat\":-4.2,\"lon\":-56.5}}}"
  }]
}
```

### GET /samples/deter
Returns coordinates with recent DETER deforestation alerts (last 90 days).

**Response:**
```json
{
  "source": "DETER Real-Time Alerts (INPE)",
  "count": 10,
  "samples": [{
    "alertDate": "2024-11-15",
    "areaHa": 50,
    "municipality": "Altamira",
    "state": "PA",
    "classname": "DESMATAMENTO_VEG",
    "sensor": "LANDSAT_8",
    "coordinates": {"lat": -3.2, "lon": -52.2},
    "testUrl": "POST /check {\"input\":{\"type\":\"COORDINATES\",\"value\":{\"lat\":-3.2,\"lon\":-52.2}}}"
  }]
}
```

### GET /samples/car
Returns CAR registrations with irregular status (Canceled, Suspended, Pending).

**Response:**
```json
{
  "source": "CAR - Cadastro Ambiental Rural (SICAR)",
  "count": 10,
  "samples": [{
    "carNumber": "AC-1200013-XXXXXXXX",
    "status": "CA",
    "statusDescription": "CANCELADO",
    "areaHa": 100,
    "municipality": "Acrelândia",
    "state": "AC",
    "coordinates": {"lat": -10.0, "lon": -67.0},
    "testUrl": "POST /check {\"input\":{\"type\":\"CAR\",\"value\":\"AC-1200013-XXXXXXXX\"}}"
  }]
}
```

### GET /samples/prodes
Returns coordinates with PRODES deforestation polygons.

**Response:**
```json
{
  "source": "PRODES Deforestation (INPE)",
  "count": 10,
  "samples": [{
    "areaHa": 200,
    "year": 2023,
    "municipality": "Lábrea",
    "state": "AM",
    "pathRow": "229/067",
    "coordinates": {"lat": -7.5, "lon": -64.8},
    "testUrl": "POST /check {\"input\":{\"type\":\"COORDINATES\",\"value\":{\"lat\":-7.5,\"lon\":-64.8}}}"
  }]
}
```

## 🇺🇾 Uruguay Endpoints

### GET /samples/snap
Returns coordinates inside SNAP protected areas (Sistema Nacional de Áreas Protegidas).

**Response:**
```json
{
  "source": "SNAP - Sistema Nacional de Áreas Protegidas (Uruguay)",
  "country": "UY",
  "count": 10,
  "samples": [{
    "name": "Parque Nacional Santa Teresa",
    "category": "Parque Nacional",
    "areaHa": 1100,
    "department": "Rocha",
    "municipality": "La Paloma",
    "legalStatus": "Homologada",
    "establishedDate": "2005-08-10",
    "coordinates": {"lat": -34.0, "lon": -53.5},
    "testUrl": "POST /check {\"input\":{\"type\":\"COORDINATES\",\"value\":{\"lat\":-34.0,\"lon\":-53.5},\"country\":\"UY\"}}"
  }]
}
```

**Note:** If no data is found, returns:
```json
{
  "count": 0,
  "message": "No SNAP data found. Run: npm run seed:snap-areas"
}
```

### GET /samples/dicose
Returns RUC/CI with DICOSE declarations (recent 2 years).

**Response:**
```json
{
  "source": "DICOSE - Rural/Livestock Registry (Uruguay)",
  "country": "UY",
  "count": 10,
  "samples": [{
    "document": "220123456789",
    "documentType": "RUC",
    "producerName": "Juan Pérez",
    "establishmentId": "UY-12345-678",
    "year": 2024,
    "areaHa": 500,
    "department": "Rocha",
    "section": "03",
    "activity": "Ganadería bovina",
    "livestockSummary": "450 bovinos, 100 ovinos",
    "declarationStatus": "DECLARED",
    "testUrl": "POST /check {\"input\":{\"type\":\"RUC\",\"value\":\"220123456789\",\"country\":\"UY\"}}"
  }]
}
```

**Document Type Detection:**
- **RUC:** 12 digits
- **CI:** 7-8 digits

**Note:** If no data is found, returns:
```json
{
  "count": 0,
  "message": "No DICOSE data found. Run: npm run seed:dicose -- --year=2024"
}
```

## 🌍 Universal Endpoint

### GET /samples/all
Returns one sample from each data source (quick overview).

**Response:**
```json
{
  "listaSuja": {
    "document": "12345678000190",
    "name": "Empresa XYZ",
    "type": "CNPJ",
    "testUrl": "POST /check ..."
  },
  "ibama": {...},
  "terrasIndigenas": {...},
  "unidadesConservacao": {...},
  "deter": {...},
  "car": {...},
  "prodes": {...},
  "snap": {
    "name": "Parque Nacional Santa Teresa",
    "category": "Parque Nacional",
    "country": "UY",
    "coordinates": {"lat": -34.0, "lon": -53.5},
    "testUrl": "POST /check ..."
  },
  "dicose": {
    "document": "220123456789",
    "documentType": "RUC",
    "producerName": "Juan Pérez",
    "year": 2024,
    "department": "Rocha",
    "country": "UY",
    "testUrl": "POST /check ..."
  }
}
```

## Usage Examples

### 1. Get Uruguay SNAP Sample

```bash
# Get sample
curl https://defarm-check-api-production.up.railway.app/samples/snap \
  -H "X-API-Key: YOUR_KEY"

# Use the testUrl from response to run check
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"type":"COORDINATES","value":{"lat":-34.0,"lon":-53.5},"country":"UY"}}'
```

### 2. Get Uruguay DICOSE Sample

```bash
# Get sample
curl https://defarm-check-api-production.up.railway.app/samples/dicose \
  -H "X-API-Key: YOUR_KEY"

# Use the testUrl from response to run check
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"type":"RUC","value":"220123456789","country":"UY"}}'
```

### 3. Get All Sources Overview

```bash
curl https://defarm-check-api-production.up.railway.app/samples/all \
  -H "X-API-Key: YOUR_KEY"
```

## Data Availability

All endpoints return real data from the database. If a dataset hasn't been seeded yet, the endpoint will return:
- `count: 0`
- `message: "No [source] data found. Run: npm run seed:[source]"`

### Seeding Data

**Brazil (already seeded in production):**
- ✅ Lista Suja
- ✅ IBAMA
- ✅ CGU Sanções
- ✅ Terras Indígenas
- ✅ Unidades de Conservação (partial)
- ✅ DETER (daily updates)
- ✅ CAR (20 states)
- ✅ PRODES (all biomes)

**Uruguay (pending seeding):**
- ⏳ SNAP - `npm run seed:snap-areas` (requires manual shapefile download)
- ⏳ DICOSE - `npm run seed:dicose -- --year=2024` (requires manual CSV download)

## Integration

These endpoints are perfect for:
- **Frontend demos:** Show real compliance failures
- **Automated tests:** Reliable test data
- **API exploration:** Learn how the API works
- **Client presentations:** Real-world examples

## Related Documentation

- [README.md](../README.md) - Main API documentation
- [MULTI_COUNTRY.md](./MULTI_COUNTRY.md) - Multi-country architecture
- [SNAP_CHECKER_URUGUAY.md](./SNAP_CHECKER_URUGUAY.md) - SNAP checker details
- [DICOSE_CHECKER_URUGUAY.md](./DICOSE_CHECKER_URUGUAY.md) - DICOSE checker details

---

**Tip:** Use `/samples/all` to quickly get one example from each source, then use specific endpoints for more samples.
