# Guia: Adicionando Novos Checkers

## 📝 Conceito

Cada checker é uma classe que estende `BaseChecker` e implementa lógica específica para verificar uma fonte de dados.

## 🏗️ Estrutura de um Checker

### 1. Criar o arquivo

```
src/checkers/{category}/{name}.ts
```

Categorias:
- `environmental` - Checkers ambientais
- `social` - Checkers sociais
- `legal` - Checkers legais/regulatórios

### 2. Template Base

```typescript
import { BaseChecker } from '../base.js';
import {
  CheckerCategory,
  CheckStatus,
  CheckerResult,
  CheckerMetadata,
  CheckerConfig,
  Severity
} from '../../types/checker.js';
import { NormalizedInput, InputType } from '../../types/input.js';
import { logger } from '../../utils/logger.js';

export class MyNewChecker extends BaseChecker {
  // 1. Metadados (obrigatório)
  readonly metadata: CheckerMetadata = {
    name: 'My New Checker',                    // Nome para exibição
    category: CheckerCategory.ENVIRONMENTAL,   // Categoria
    description: 'Checks something important', // Descrição
    priority: 7,                               // 1-10, maior = mais importante
    supportedInputTypes: [                     // Tipos de input aceitos
      InputType.CNPJ,
      InputType.COORDINATES
    ]
  };

  // 2. Configuração (obrigatório)
  readonly config: CheckerConfig = {
    enabled: true,        // Se está ativo
    cacheTTL: 86400,      // Cache em segundos (24h)
    timeout: 10000        // Timeout em ms
  };

  // 3. Método principal (obrigatório)
  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    logger.debug({ input: input.value }, 'Executing MyNewChecker');

    try {
      // Sua lógica aqui
      const data = await this.fetchData(input);
      const hasProblem = this.analyzeData(data);

      if (hasProblem) {
        return {
          status: CheckStatus.FAIL,
          severity: Severity.HIGH,
          message: 'Problem detected',
          details: {
            /* dados relevantes */
          },
          evidence: {
            dataSource: 'Source Name',
            url: 'https://source.com',
            lastUpdate: '2026-01-01'
          },
          executionTimeMs: 0,  // Preenchido automaticamente
          cached: false        // Preenchido automaticamente
        };
      }

      // Sucesso
      return {
        status: CheckStatus.PASS,
        message: 'No issues found',
        executionTimeMs: 0,
        cached: false
      };

    } catch (err) {
      // Erros são tratados pelo BaseChecker automaticamente
      throw new Error(`Failed to execute checker: ${(err as Error).message}`);
    }
  }

  // 4. Métodos auxiliares (opcional)
  private async fetchData(input: NormalizedInput): Promise<any> {
    // Buscar dados da fonte externa
    // Pode usar axios, fetch, ou query de DB
    return {};
  }

  private analyzeData(data: any): boolean {
    // Analisar se há problemas
    return false;
  }
}

// 5. Export default instance
export default new MyNewChecker();
```

### 3. Registrar o Checker

Editar `src/checkers/index.ts`:

```typescript
// Import
import myNewChecker from './environmental/my-new-checker.js';

// Register
checkerRegistry.register(myNewChecker);
```

Pronto! O checker será automaticamente usado.

---

## 🎯 Exemplos Reais

### Exemplo 1: IBAMA Embargoes

```typescript
// src/checkers/environmental/ibama-embargoes.ts
import axios from 'axios';

export class IBAMAEmbargoesChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'IBAMA Embargoes',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica embargos ambientais do IBAMA',
    priority: 9,
    supportedInputTypes: [InputType.CNPJ, InputType.CPF]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 604800, // 7 dias
    timeout: 15000,
    endpoint: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas/xml'
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    try {
      // Fetch dados do IBAMA
      const response = await axios.get(this.config.endpoint, {
        params: { cpf_cnpj: input.value },
        timeout: this.config.timeout
      });

      const embargoes = this.parseXML(response.data);

      if (embargoes.length > 0) {
        return {
          status: CheckStatus.FAIL,
          severity: Severity.HIGH,
          message: `${embargoes.length} active embargo(s) found`,
          details: {
            embargoes: embargoes.map(e => ({
              area: e.area_ha,
              location: e.municipio,
              date: e.data_embargo,
              reason: e.motivo
            }))
          },
          evidence: {
            dataSource: 'IBAMA',
            url: 'https://servicos.ibama.gov.br/ctf/publico/areasembargadas',
            lastUpdate: new Date().toISOString()
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'No embargoes found',
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`IBAMA API error: ${(err as Error).message}`);
    }
  }

  private parseXML(xml: string): any[] {
    // Parse XML response
    // Retornar array de embargos
    return [];
  }
}

export default new IBAMAEmbargoesChecker();
```

### Exemplo 2: Protected Areas (PostGIS)

```typescript
// src/checkers/environmental/protected-areas.ts
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export class ProtectedAreasChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'Protected Areas',
    category: CheckerCategory.ENVIRONMENTAL,
    description: 'Verifica sobreposição com áreas protegidas (UCs, TIs)',
    priority: 10,
    supportedInputTypes: [InputType.COORDINATES]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 2592000, // 30 dias (dados estáveis)
    timeout: 20000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    if (!input.coordinates) {
      throw new Error('Coordinates required');
    }

    try {
      // Query PostGIS
      const result = await db.execute(sql`
        SELECT
          name, category, restriction_level
        FROM protected_areas
        WHERE ST_Contains(
          geometry,
          ST_SetSRID(ST_MakePoint(${input.coordinates.lon}, ${input.coordinates.lat}), 4326)
        )
        LIMIT 1
      `);

      if (result.rows.length > 0) {
        const area = result.rows[0];

        return {
          status: CheckStatus.FAIL,
          severity: Severity.CRITICAL,
          message: `Located in protected area: ${area.name}`,
          details: {
            area_name: area.name,
            category: area.category,
            restriction_level: area.restriction_level
          },
          evidence: {
            dataSource: 'ICMBio/FUNAI',
            url: 'https://www.gov.br/icmbio/pt-br'
          },
          executionTimeMs: 0,
          cached: false
        };
      }

      return {
        status: CheckStatus.PASS,
        message: 'Not in protected area',
        executionTimeMs: 0,
        cached: false
      };
    } catch (err) {
      throw new Error(`PostGIS query error: ${(err as Error).message}`);
    }
  }
}

export default new ProtectedAreasChecker();
```

---

## 🔍 Status e Severidade

### Status Options

- `PASS` - Tudo OK
- `FAIL` - Problema encontrado
- `WARNING` - Atenção necessária (não bloqueia)
- `ERROR` - Erro ao executar checker
- `NOT_APPLICABLE` - Checker não se aplica a este input

### Severity (quando FAIL ou WARNING)

- `CRITICAL` - Bloqueador total (ex: área embargada)
- `HIGH` - Problema sério (ex: desmatamento)
- `MEDIUM` - Problema moderado (ex: CAR pendente)
- `LOW` - Problema menor (ex: documentação faltando)

---

## 💡 Boas Práticas

### 1. Sempre tratar erros

```typescript
try {
  const data = await fetchAPI();
  return analyzeData(data);
} catch (err) {
  // BaseChecker vai transformar em CheckStatus.ERROR
  throw new Error(`Specific error: ${err.message}`);
}
```

### 2. Logar adequadamente

```typescript
logger.debug({ input: input.value }, 'Starting check');
logger.warn({ issue: 'rate_limit' }, 'API rate limited');
logger.error({ err }, 'Check failed');
```

### 3. Incluir evidências

```typescript
evidence: {
  dataSource: 'Nome da Fonte',
  url: 'https://link-para-dados',
  lastUpdate: '2026-01-01',
  raw: apiResponse // Opcional, dados brutos
}
```

### 4. Details estruturados

```typescript
details: {
  area_ha: 15.3,
  year: 2024,
  severity_score: 8.5,
  recommendation: 'Contact environmental agency'
}
```

### 5. Cache apropriado

```typescript
// Dados que mudam raramente: 30 dias
cacheTTL: 2592000

// Dados que mudam diariamente: 24 horas
cacheTTL: 86400

// Dados em tempo real: 1 hora
cacheTTL: 3600
```

### 6. Timeouts razoáveis

```typescript
// API rápida
timeout: 5000   // 5s

// API normal
timeout: 10000  // 10s

// Query pesada ou dados grandes
timeout: 30000  // 30s
```

---

## 🧪 Testando seu Checker

### 1. Teste unitário

```typescript
// tests/unit/checkers/my-checker.test.ts
import { describe, it, expect } from 'vitest';
import myChecker from '../../../src/checkers/environmental/my-checker.js';
import { InputType } from '../../../src/types/input.js';

describe('MyChecker', () => {
  it('should pass for valid input', async () => {
    const input = {
      type: InputType.CNPJ,
      value: '00000000000000',
      originalValue: '00.000.000/0000-00'
    };

    const result = await myChecker.check(input);

    expect(result.status).toBe('PASS');
  });

  it('should fail for problematic input', async () => {
    const input = {
      type: InputType.CNPJ,
      value: '12345678000190',
      originalValue: '12.345.678/0001-90'
    };

    const result = await myChecker.check(input);

    expect(result.status).toBe('FAIL');
    expect(result.severity).toBeDefined();
  });
});
```

### 2. Teste via API

```bash
curl -X POST http://localhost:3000/check \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12.345.678/0001-90"
    },
    "options": {
      "sources": ["My New Checker"]
    }
  }' | jq '.sources[] | select(.name == "My New Checker")'
```

---

## 📦 Checkers Sugeridos para Implementar

### Ambientais
- [ ] IBAMA Embargoes
- [ ] Protected Areas (ICMBio UCs)
- [ ] Indigenous Lands (FUNAI)
- [ ] Water Resources (ANA)
- [ ] Environmental Licenses (estaduais)
- [ ] Fire Alerts (INPE)

### Sociais
- [ ] Work Accidents (MTE)
- [ ] Labor Inspections (MTE)
- [ ] Social Security Compliance (INSS)
- [ ] Child Labor Registry

### Legais
- [ ] Tax Compliance (Receita Federal)
- [ ] Legal Proceedings (CNJ)
- [ ] Bankruptcy Registry
- [ ] Sanction Lists (CEIS, CNEP)

---

## 🔗 Recursos

- **INPE TerraBrasilis**: http://terrabrasilis.dpi.inpe.br/
- **SICAR**: https://www.car.gov.br/
- **IBAMA**: https://servicos.ibama.gov.br/
- **MTE Dados Abertos**: https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho
- **ICMBio**: https://www.gov.br/icmbio/pt-br
- **FUNAI**: https://www.gov.br/funai/pt-br
