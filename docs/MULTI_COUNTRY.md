# Multi-Country Support - Architecture Guide

**Last Updated:** 2026-02-16
**Status:** ✅ Production Ready (Brazil, Uruguay)

## Overview

The DeFarm Check API supports multiple countries with a flexible, extensible architecture that allows:
- Country-specific document types (CNPJ/CPF for Brazil, RUC/CI for Uruguay)
- Automatic country detection from input type
- Country-aware checker selection
- Isolated data sources per country
- Universal input types (coordinates, address) that work across countries

## Supported Countries

| Country | Code | Document Types | Checkers | Status |
|---------|------|----------------|----------|--------|
| 🇧🇷 Brazil | `BR` | CNPJ, CPF, CAR, IE | 15+ | ✅ Production |
| 🇺🇾 Uruguay | `UY` | RUC, CI | 2 | ✅ Production |

## Input Types

### Country-Specific Documents

```typescript
export enum InputType {
  // Brazil
  CNPJ = 'CNPJ',      // 14 digits - Brazilian company tax ID
  CPF = 'CPF',        // 11 digits - Brazilian individual tax ID
  CAR = 'CAR',        // Variable - Rural environmental registry
  IE = 'IE',          // Variable - State registration

  // Uruguay
  RUC = 'RUC',        // 12 digits - Uruguayan tax ID
  CI = 'CI',          // 7-8 digits + check digit - Uruguayan national ID

  // Universal
  COORDINATES = 'COORDINATES',
  ADDRESS = 'ADDRESS',
  NAME = 'NAME'
}
```

### Country Detection

The API automatically detects country from input type:

```typescript
// Auto-detected as Brazil
{ "type": "CNPJ", "value": "12345678000190" }  // country = 'BR'

// Auto-detected as Uruguay
{ "type": "RUC", "value": "220123456789" }     // country = 'UY'

// Must specify country for universal types
{ "type": "COORDINATES", "value": {...}, "country": "UY" }

// Or let it default to Brazil (backwards compatibility)
{ "type": "COORDINATES", "value": {...} }       // country = 'BR'
```

## Checker Architecture

### Country-Aware BaseChecker

All checkers extend `BaseChecker` which implements country filtering:

```typescript
abstract class BaseChecker {
  abstract readonly metadata: CheckerMetadata;

  protected isApplicable(input: NormalizedInput): boolean {
    // Check input type support
    const typeSupported = this.metadata.supportedInputTypes.includes(input.type);

    // Check country support (defaults to ['BR'] for backwards compatibility)
    const supportedCountries = this.metadata.supportedCountries || [Country.BRAZIL];
    const countrySupported = supportedCountries.includes(input.country);

    return typeSupported && countrySupported;
  }
}
```

### Checker Examples

**Brazil-only checker:**
```typescript
export class SlaveLaborChecker extends BaseChecker {
  metadata = {
    name: 'Slave Labor Registry',
    supportedInputTypes: [InputType.CNPJ, InputType.CPF],
    supportedCountries: [Country.BRAZIL]  // Brazil only
  };
}
```

**Uruguay-only checker:**
```typescript
export class SNAPProtectedAreasChecker extends BaseChecker {
  metadata = {
    name: 'SNAP Protected Areas',
    supportedInputTypes: [InputType.COORDINATES],
    supportedCountries: [Country.URUGUAY]  // Uruguay only
  };
}
```

**Multi-country checker (future):**
```typescript
export class OrganicProducersChecker extends BaseChecker {
  metadata = {
    name: 'Organic Producers',
    supportedInputTypes: [InputType.CNPJ, InputType.RUC],
    supportedCountries: [Country.BRAZIL, Country.URUGUAY]  // Both!
  };
}
```

## Database Schema

### Multi-Country Tables

All document-based tables include a `country` column:

```sql
-- Brazil + Uruguay labor violations
CREATE TABLE lista_suja (
  id UUID PRIMARY KEY,
  document VARCHAR(20) NOT NULL,
  type VARCHAR(10) NOT NULL,      -- CPF, CNPJ, RUC, CI
  country VARCHAR(2) DEFAULT 'BR' NOT NULL,  -- BR, UY
  name TEXT NOT NULL,
  ...
);

-- Composite unique index allows same document in different countries
CREATE UNIQUE INDEX idx_lista_suja_document_country
  ON lista_suja(document, country);
```

### Country-Specific Tables

Some tables are country-specific:

```sql
-- Brazil: CAR registrations
CREATE TABLE car_registrations (
  id UUID PRIMARY KEY,
  car_number VARCHAR(50) UNIQUE NOT NULL,
  country VARCHAR(2) DEFAULT 'BR' NOT NULL,
  ...
);

-- Uruguay: DICOSE registrations
CREATE TABLE dicose_registrations (
  id UUID PRIMARY KEY,
  establishment_id VARCHAR(50) NOT NULL,
  country VARCHAR(2) DEFAULT 'UY' NOT NULL,
  ...
);
```

## API Request/Response

### Request Format

```json
{
  "input": {
    "type": "RUC",                    // Uruguay document type
    "value": "220123456789",
    "country": "UY"                   // Optional - auto-detected
  },
  "options": {
    "sources": ["all"],               // Optional - filter checkers
    "useCache": true,
    "includeEvidence": true
  }
}
```

### Response Format

```json
{
  "checkId": "uuid",
  "input": {
    "type": "RUC",
    "value": "220123456789",
    "country": "UY"                   // Country included in response
  },
  "verdict": "PASS",
  "score": 100,
  "sources": [
    {
      "name": "DICOSE Rural Registry",
      "category": "environmental",
      "status": "PASS",
      "message": "Valid DICOSE declaration found (2024)",
      "details": {
        "year": 2024,
        "department": "Rocha",
        "areaHa": 500
      }
    }
  ]
}
```

## Document Validation

### Brazil

```typescript
// CNPJ: 14 digits
normalizeCNPJ('12.345.678/0001-90') // → '12345678000190'

// CPF: 11 digits
normalizeCPF('123.456.789-09') // → '12345678909'

// CAR: State-specific format
normalizeCAR('AC-1200013-XXXX') // → 'AC-1200013-XXXX'
```

### Uruguay

```typescript
// RUC: 12 digits
normalizeRUC('22-012345-6789') // → '220123456789'

// CI: 7-8 digits + check digit with validation
normalizeCI('1.234.567-2') // → '12345672'
// Validates using algorithm: multiply by [2,9,8,7,6,3,4], check = 10 - (sum % 10)
```

## Orchestrator Flow

```
Request
  ↓
Normalize Input
  ↓
Detect Country (from input type or explicit)
  ↓
Select Applicable Checkers
  ├─ Filter by input type
  ├─ Filter by country
  └─ Filter by enabled status
  ↓
Execute Checkers in Parallel
  ↓
Calculate Verdict & Score
  ↓
Persist to Database (with country)
  ↓
Return Response
```

## Adding a New Country

### Step 1: Add Country Enum

```typescript
// src/types/input.ts
export enum Country {
  BRAZIL = 'BR',
  URUGUAY = 'UY',
  PARAGUAY = 'PY'  // NEW!
}
```

### Step 2: Add Document Types

```typescript
export enum InputType {
  // ... existing
  RUC_PY = 'RUC_PY',  // Paraguay RUC
  CI_PY = 'CI_PY'     // Paraguay CI
}
```

### Step 3: Add Validators

```typescript
// src/utils/validators.ts
export function normalizeRUC_PY(ruc: string): string {
  // Implementation for Paraguay RUC
}

export function detectCountryFromInputType(type: InputType): Country {
  switch (type) {
    case InputType.RUC_PY:
    case InputType.CI_PY:
      return Country.PARAGUAY;
    // ... existing cases
  }
}
```

### Step 4: Create Checkers

```typescript
// src/checkers/paraguay/my-checker.ts
export class ParaguayChecker extends BaseChecker {
  metadata = {
    supportedInputTypes: [InputType.RUC_PY],
    supportedCountries: [Country.PARAGUAY]
  };
}
```

### Step 5: Update Database

```sql
-- Add country column to shared tables if needed
ALTER TABLE lista_suja ADD COLUMN country VARCHAR(2) DEFAULT 'BR';

-- Create Paraguay-specific tables
CREATE TABLE paraguay_registrations (...);
```

### Step 6: Update Documentation

- Add to README.md country list
- Create DATA_SOURCES_PARAGUAY.md
- Update Swagger definitions
- Add examples

## Data Sources by Country

### 🇧🇷 Brazil (15 sources)

| Source | Type | Records | Checker |
|--------|------|---------|---------|
| Lista Suja MTE | Social | 678 | ✅ |
| IBAMA Embargoes | Environmental | 66K | ✅ |
| PRODES | Environmental | 216K polygons | ✅ |
| DETER | Environmental | Daily | ✅ |
| CAR | Environmental | 3.5M+ | ✅ |
| Indigenous Lands | Environmental | Polygons | ✅ |
| Conservation Units | Environmental | Polygons | ✅ |
| MapBiomas Alerta | Environmental | 35K | ✅ |
| Queimadas | Environmental | Daily | ✅ |
| CGU Sanctions | Legal | Varies | ✅ |
| MAPA Organics | Positive | Varies | ✅ |
| ANA Water Permits | Environmental | 48K | ✅ |

### 🇺🇾 Uruguay (2 sources, expanding)

| Source | Type | Records | Checker |
|--------|------|---------|---------|
| SNAP Protected Areas | Environmental | 22 areas | ✅ |
| DICOSE Rural Registry | Environmental | ~50K | ✅ |
| Environmental Complaints | Environmental | TBD | 🔄 Planned |
| Fire Alerts (NASA) | Environmental | Daily | 🔄 Planned |
| Catastro Rural | Environmental | ~100K | 🔄 Planned |

## Best Practices

### 1. Backwards Compatibility

Always default to Brazil when country is not specified:

```typescript
const country = input.country || detectCountryFromInputType(input.type) || Country.BRAZIL;
```

### 2. Explicit Country for Universal Types

Require country for universal input types in new code:

```typescript
if (input.type === InputType.COORDINATES && !input.country) {
  // Warn or default to Brazil for backwards compatibility
  input.country = Country.BRAZIL;
}
```

### 3. Country-Specific Error Messages

```typescript
if (input.country === Country.URUGUAY && input.type === InputType.CNPJ) {
  throw new Error('CNPJ is not valid for Uruguay. Use RUC instead.');
}
```

### 4. Test Both Countries

```typescript
describe('Multi-country support', () => {
  it('should detect Brazil from CNPJ', () => {
    const country = detectCountry({ type: 'CNPJ' });
    expect(country).toBe(Country.BRAZIL);
  });

  it('should detect Uruguay from RUC', () => {
    const country = detectCountry({ type: 'RUC' });
    expect(country).toBe(Country.URUGUAY);
  });
});
```

## Performance Considerations

- **Indexing:** All country-aware tables have composite indexes on (document, country)
- **Checker Filtering:** Country check happens early in `isApplicable()` to skip unnecessary queries
- **Caching:** Cache keys include country to prevent cross-country cache pollution

## Security Considerations

- **Data Isolation:** Each country's data is logically separated by `country` column
- **API Keys:** No country-specific API keys (yet) - same key works for all countries
- **Rate Limiting:** Applied globally, not per country

## Future Roadmap

- [ ] Add Argentina (RUC, CUIT, CUIL)
- [ ] Add Paraguay (RUC, CI)
- [ ] Add Colombia (NIT, CC)
- [ ] Multi-language responses (PT, ES, EN)
- [ ] Country-specific API documentation
- [ ] Per-country analytics and monitoring

## Related Documentation

- [DATA_SOURCES.md](./DATA_SOURCES.md) - All data sources (all countries)
- [DATA_SOURCES_URUGUAY.md](./DATA_SOURCES_URUGUAY.md) - Uruguay-specific sources
- [SNAP_CHECKER_URUGUAY.md](./SNAP_CHECKER_URUGUAY.md) - SNAP implementation
- [DICOSE_CHECKER_URUGUAY.md](./DICOSE_CHECKER_URUGUAY.md) - DICOSE implementation

---

**Questions?** See [CLAUDE.md](../CLAUDE.md) for architecture details or open an issue.
