# API Usage Examples

Complete guide with real-world examples for using the DeFarm Check API.

**Production URL:** https://defarm-check-api-production.up.railway.app

---

## Table of Contents

1. [Authentication](#authentication)
2. [Input Types](#input-types)
3. [Universal Spatial Input](#universal-spatial-input)
4. [Response Format](#response-format)
5. [Use Cases](#use-cases)
6. [Error Handling](#error-handling)

---

## Authentication

All requests require an API key in the header:

```bash
X-API-Key: ck_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

## Input Types

The API supports 5 input types:

### 1. CNPJ (Company Tax ID)

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12345678000190"
    }
  }'
```

**Accepts:** With or without formatting (`12.345.678/0001-90` or `12345678000190`)

**Checkers that run:**
- Slave Labor Registry
- IBAMA Embargoes
- CGU Sanctions

---

### 2. CPF (Personal Tax ID)

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "CPF",
      "value": "12345678900"
    }
  }'
```

**Accepts:** With or without formatting (`123.456.789-00` or `12345678900`)

**Checkers that run:**
- Slave Labor Registry
- IBAMA Embargoes
- CGU Sanctions

---

### 3. CAR (Rural Environmental Registry)

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "CAR",
      "value": "BA-2909703-F05433B5497742CB8FB37AE31C2C4463"
    }
  }'
```

**Format:** `STATE-MUNICIPALITY-IDENTIFIER`

**Checkers that run:**
- CAR Registry (status check)
- CAR x PRODES Intersection (deforestation in property)
- MapBiomas Validated Deforestation
- ANA Water Use Permits

---

### 4. COORDINATES (GPS Location)

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": {
        "lat": -3.204065,
        "lon": -52.209961
      }
    }
  }'
```

**Format:** Object with `lat` and `lon` (decimal degrees)

**Checkers that run (10 total):**
- All spatial checkers (see Universal Spatial Input section)

---

### 5. ADDRESS (Street Address) 🆕

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "ADDRESS",
      "value": "Altamira, Pará"
    }
  }'
```

**Format:** Free text address (city, state, or full address)

**How it works:**
1. Address is geocoded to coordinates (using OpenStreetMap Nominatim)
2. Coordinates are used for all spatial checks
3. Results include geocoded coordinates in metadata

**Geocoding providers:**
- **Primary:** Nominatim (free, no API key required)
- **Fallback:** Google Maps API (optional, requires configuration)

**Performance:**
- First request: ~1-2 seconds (geocoding + checks)
- Cached requests: <100ms (instant)

**Checkers that run (10 total):**
- All spatial checkers (same as COORDINATES)

---

## Universal Spatial Input

**All spatial checkers now support 3 input methods:**

| Input Type | Example | Use Case |
|------------|---------|----------|
| **ADDRESS** | `"São Paulo, SP"` | User-friendly, no GPS needed |
| **COORDINATES** | `{"lat": -23.5, "lon": -46.6}` | Precise GPS location |
| **CAR** | `"SP-3550308-123..."` | Specific property |

**Spatial Checkers (10):**

1. **CAR - Cadastro Ambiental Rural**
   - Finds CAR property at location
   - Returns status, area, municipality

2. **CAR x PRODES Intersection**
   - Finds CAR at location
   - Checks PRODES deforestation in property boundaries
   - Returns area deforested, years, severity

3. **PRODES Deforestation**
   - Checks if coordinates are in deforestation polygon
   - Returns year, area, municipality

4. **DETER Real-Time Alerts**
   - Searches 1km buffer for recent alerts (90 days)
   - Returns alert count, area, dates

5. **MapBiomas Validated Deforestation**
   - Searches 1km buffer for validated alerts (2 years)
   - Returns analyst-verified deforestation

6. **IBAMA Embargoes**
   - Searches 5km buffer for environmental embargoes
   - Returns closest embargo, distance, owner

7. **Indigenous Lands**
   - Checks if location is within indigenous territory
   - Returns territory name, status

8. **Conservation Units**
   - Checks if location is within protected area
   - Returns unit name, category, management type

9. **INPE Fire Hotspots**
   - Searches buffer for recent fire detections
   - Returns fire count, dates, satellite source

10. **ANA Water Use Permits**
    - Finds water use permits at location
    - Returns permit details, purpose

---

## Response Format

### Success Response

```json
{
  "checkId": "a84b07fb-8142-4cc3-bcf4-a59e368be37c",
  "input": {
    "type": "ADDRESS",
    "value": "Altamira, Pará"
  },
  "timestamp": "2026-02-02T21:00:00.000Z",
  "verdict": "COMPLIANT" | "NON_COMPLIANT",
  "score": 85,
  "sources": [
    {
      "name": "CAR x PRODES Intersection",
      "category": "environmental",
      "status": "PASS" | "FAIL" | "WARNING" | "ERROR",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "message": "Detailed message about the check result",
      "details": {
        // Checker-specific details
      },
      "evidence": {
        "dataSource": "INPE PRODES + SICAR CAR",
        "url": "http://terrabrasilis.dpi.inpe.br/",
        "lastUpdate": "2026-02-02"
      },
      "executionTimeMs": 218,
      "cached": false
    }
  ],
  "summary": {
    "totalCheckers": 10,
    "passed": 7,
    "failed": 2,
    "warnings": 0,
    "errors": 1,
    "notApplicable": 0
  },
  "metadata": {
    "processingTimeMs": 1117,
    "cacheHitRate": 0.3,
    "apiVersion": "1.0.0",
    "timestamp": "2026-02-02T21:00:00.000Z"
  }
}
```

### Verdict Calculation

- **COMPLIANT:** score >= 80
- **NON_COMPLIANT:** score < 80

### Score Calculation

Based on checker results:
- PASS: +10 points per checker
- FAIL (LOW): -5 points
- FAIL (MEDIUM): -10 points
- FAIL (HIGH): -15 points
- FAIL (CRITICAL): -20 points

---

## Use Cases

### 1. Property Due Diligence by Address

**Scenario:** Investor wants to check a farm before purchase

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "ADDRESS",
      "value": "Fazenda Santa Rita, Alta Floresta, MT"
    }
  }'
```

**Returns:**
- CAR registration status
- Deforestation history (2015-2024)
- Environmental embargoes
- Indigenous land conflicts
- Conservation unit restrictions

---

### 2. Supplier Verification by CNPJ

**Scenario:** Food company verifying supplier compliance (TAC requirements)

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12345678000190"
    }
  }'
```

**Returns:**
- Slave labor registry check
- IBAMA embargoes
- CGU sanctions

---

### 3. GPS-Based Mobile App Check

**Scenario:** Field agent uses mobile app to check current location

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": {
        "lat": -9.922723,
        "lon": -55.973620
      }
    }
  }'
```

**Returns:**
- All spatial checks at GPS location
- Instant results (<500ms)

---

### 4. CAR Property Analysis

**Scenario:** Environmental analyst checking specific CAR property

```bash
curl -X POST https://defarm-check-api-production.up.railway.app/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "input": {
      "type": "CAR",
      "value": "MT-9009703-ABCD1234EFGH5678IJKL9012MNOP3456"
    }
  }'
```

**Returns:**
- CAR status and area
- PRODES deforestation within property
- Historical deforestation by year
- Deforested percentage

---

## Error Handling

### Geocoding Errors

```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Failed to geocode address \"Invalid Address XYZ\": Address not found"
}
```

**Solutions:**
- Verify address spelling
- Use city + state format: `"Altamira, PA"`
- Try coordinates instead if address is too specific

### Invalid Coordinates

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Coordenadas inválidas"
}
```

**Valid ranges:**
- Latitude: -34 to 6 (Brazil)
- Longitude: -74 to -34 (Brazil)

### Authentication Errors

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

**Solutions:**
- Check X-API-Key header is present
- Verify API key is correct
- Contact support for new API key

---

## Rate Limiting

- **Default:** 10,000 requests per minute per API key
- **Geocoding:** 1 request per second (Nominatim limitation)
- **Subsequent geocoding requests:** Instant (Redis cache)

---

## Best Practices

1. **Use caching:** Set `useCache: true` (default) for faster responses
2. **Cache addresses:** Geocoding results are cached for 1 year
3. **Batch requests:** Use multiple API calls in parallel for lists
4. **Handle errors:** Always check `statusCode` and handle failures gracefully
5. **Check verdict:** Use `verdict` and `score` for quick compliance assessment
6. **Review details:** Check individual `sources[]` for specific issues

---

## Support

- **Documentation:** https://github.com/gabrielrondon/defarm-check-api
- **Issues:** https://github.com/gabrielrondon/defarm-check-api/issues
- **API Status:** https://defarm-check-api-production.up.railway.app/health
