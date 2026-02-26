/**
 * Samples Routes - Retorna exemplos de registros para testes
 *
 * Útil para:
 * - Testar que a API realmente detecta problemas
 * - Demos para clientes
 * - Desenvolvimento frontend
 * - Testes automatizados
 */

import { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

// Reusable schema fragment for a sample item with a testUrl
const sampleWithTestUrl = {
  type: 'object',
  properties: {
    testUrl: {
      type: 'string',
      description: 'Ready-to-use POST /check request body snippet for this sample'
    }
  }
};

const sampleCoordinatesSchema = {
  type: 'object',
  properties: {
    lat: { type: 'number', description: 'Latitude (WGS84)', example: -9.3748 },
    lon: { type: 'number', description: 'Longitude (WGS84)', example: -68.2104 }
  }
};

const samplesRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /samples/lista-suja
   * Retorna exemplos de CPF/CNPJ na Lista Suja
   */
  fastify.get('/samples/lista-suja', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: Slave Labor Registry (Lista Suja)',
      description: `Returns up to 10 random CPF/CNPJ records currently listed in the **Lista Suja do Trabalho Escravo** (MTE Slave Labor Registry).

Use these documents to verify that the \`/check\` endpoint correctly flags them as **FAIL** for slave labor violations.

Each sample includes a \`testUrl\` field with the exact request body to copy into \`POST /check\`.`,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'Lista Suja do Trabalho Escravo (MTE)' },
            count: { type: 'integer', example: 10 },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document: { type: 'string', description: 'CPF or CNPJ (digits only)', example: '12345678000190' },
                  documentFormatted: { type: 'string', description: 'Formatted document', example: '12.345.678/0001-90' },
                  name: { type: 'string', description: 'Employer/company name', example: 'Fazenda Exemplo Ltda' },
                  type: { type: 'string', enum: ['CPF', 'CNPJ'], example: 'CNPJ' },
                  state: { type: 'string', example: 'PA' },
                  year: { type: 'integer', example: 2023 },
                  workersAffected: { type: 'integer', example: 12 },
                  testUrl: { type: 'string', example: 'POST /check {"input":{"type":"CNPJ","value":"12345678000190"}}' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        document,
        document_formatted,
        name,
        type,
        state,
        year,
        workers_affected
      FROM lista_suja
      ORDER BY RANDOM()
      LIMIT 10
    `);

    return {
      source: 'Lista Suja do Trabalho Escravo (MTE)',
      count: result.rows.length,
      samples: result.rows.map((r: any) => ({
        document: r.document,
        documentFormatted: r.document_formatted,
        name: r.name,
        type: r.type,
        state: r.state,
        year: r.year,
        workersAffected: r.workers_affected,
        testUrl: `POST /check {"input":{"type":"${r.type}","value":"${r.document}"}}`
      }))
    };
  });

  /**
   * GET /samples/ibama
   * Retorna exemplos de CPF/CNPJ com embargos IBAMA
   */
  fastify.get('/samples/ibama', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: IBAMA Environmental Embargoes',
      description: `Returns up to 10 CPF/CNPJ records with active **IBAMA environmental embargoes**, sorted by embargo count (most embargoes first).

Use these documents to verify that the \`/check\` endpoint correctly flags them as **FAIL** for IBAMA violations.`,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'IBAMA Embargoes' },
            count: { type: 'integer', example: 10 },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document: { type: 'string', description: 'CPF or CNPJ (digits only)', example: '98765432000199' },
                  type: { type: 'string', enum: ['CPF', 'CNPJ'], example: 'CNPJ' },
                  name: { type: 'string', example: 'Madeireira Fictícia SA' },
                  embargoCount: { type: 'integer', description: 'Number of active embargoes', example: 3 },
                  totalAreaHa: { type: 'number', description: 'Total embargoed area in hectares', example: 1250.5 },
                  testUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        document,
        name,
        type,
        embargo_count,
        total_area_ha
      FROM ibama_embargoes
      WHERE embargo_count > 0
      ORDER BY embargo_count DESC, RANDOM()
      LIMIT 10
    `);

    return {
      source: 'IBAMA Embargoes',
      count: result.rows.length,
      samples: result.rows.map((r: any) => ({
        document: r.document,
        type: r.type,
        name: r.name,
        embargoCount: r.embargo_count,
        totalAreaHa: r.total_area_ha,
        testUrl: `POST /check {"input":{"type":"${r.type}","value":"${r.document}"}}`
      }))
    };
  });

  /**
   * GET /samples/cgu-sancoes
   * Retorna exemplos de CPF/CNPJ com sanções CGU (CEIS, CNEP, CEAF)
   */
  fastify.get('/samples/cgu-sancoes', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: CGU Sanctions (CEIS, CNEP, CEAF)',
      description: `Returns up to 10 CPF/CNPJ records with **active CGU sanctions** from the Federal Transparency Portal registers:
- **CEIS** — Companies/individuals ineligible for federal contracts
- **CNEP** — National register of punished companies
- **CEAF** — Administrative misconduct

Use these documents to test the CGU Sanctions checker.`,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'CGU - Sanções (CEIS, CNEP, CEAF)' },
            count: { type: 'integer', example: 10 },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document: { type: 'string', example: '11222333000181' },
                  documentFormatted: { type: 'string', example: '11.222.333/0001-81' },
                  name: { type: 'string', example: 'Empresa Sancionada Ltda' },
                  type: { type: 'string', enum: ['CPF', 'CNPJ'], example: 'CNPJ' },
                  sanctionType: { type: 'string', example: 'CEIS' },
                  category: { type: 'string', example: 'Inidoneidade' },
                  status: { type: 'string', example: 'ATIVO' },
                  startDate: { type: 'string', format: 'date', example: '2022-05-01' },
                  endDate: { type: 'string', format: 'date', nullable: true, example: '2027-05-01' },
                  testUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        document,
        document_formatted,
        name,
        type,
        sanction_type,
        category,
        status,
        start_date,
        end_date
      FROM cgu_sancoes
      WHERE status = 'ATIVO'
      ORDER BY RANDOM()
      LIMIT 10
    `);

    return {
      source: 'CGU - Sanções (CEIS, CNEP, CEAF)',
      count: result.rows.length,
      samples: result.rows.map((r: any) => ({
        document: r.document,
        documentFormatted: r.document_formatted,
        name: r.name,
        type: r.type,
        sanctionType: r.sanction_type,
        category: r.category,
        status: r.status,
        startDate: r.start_date,
        endDate: r.end_date,
        testUrl: `POST /check {"input":{"type":"${r.type}","value":"${r.document}"}}`
      }))
    };
  });

  /**
   * GET /samples/terras-indigenas
   * Retorna coordenadas dentro de Terras Indígenas
   */
  fastify.get('/samples/terras-indigenas', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: Indigenous Lands coordinates (Terras Indígenas)',
      description: `Returns up to 10 coordinate pairs located **inside officially demarcated indigenous lands** (FUNAI).

Use these coordinates to verify that the \`/check\` endpoint correctly flags them as **FAIL** for indigenous land violations.

Pass the coordinates as \`POST /check\` with \`"type":"COORDINATES"\`.`,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'Terras Indígenas (FUNAI)' },
            count: { type: 'integer', example: 10 },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Indigenous land name', example: 'Kayapó' },
                  etnia: { type: 'string', description: 'Indigenous ethnicity', example: 'Kayapó' },
                  phase: { type: 'string', description: 'Demarcation phase', example: 'Homologada' },
                  areaHa: { type: 'number', description: 'Area in hectares', example: 3284480 },
                  municipality: { type: 'string', example: 'Altamira' },
                  state: { type: 'string', example: 'PA' },
                  coordinates: sampleCoordinatesSchema,
                  testUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        name,
        etnia,
        phase,
        area_ha,
        municipality,
        state,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM terras_indigenas
      WHERE geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 10
    `);

    return {
      source: 'Terras Indígenas (FUNAI)',
      count: result.rows.length,
      samples: result.rows.map((r: any) => ({
        name: r.name,
        etnia: r.etnia,
        phase: r.phase,
        areaHa: r.area_ha,
        municipality: r.municipality,
        state: r.state,
        coordinates: {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(r.lat)},"lon":${parseFloat(r.lon)}}}}`
      }))
    };
  });

  /**
   * GET /samples/unidades-conservacao
   * Retorna coordenadas dentro de Unidades de Conservação
   */
  fastify.get('/samples/unidades-conservacao', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: Conservation Units coordinates (Unidades de Conservação)',
      description: `Returns up to 10 coordinate pairs located **inside conservation units** (ICMBio).

Includes both Integral Protection units (Proteção Integral) and Sustainable Use units (Uso Sustentável).

Use these coordinates to verify that the \`/check\` endpoint correctly flags them as **FAIL** or **WARNING** for conservation unit violations.`,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'Unidades de Conservação (ICMBio)' },
            count: { type: 'integer', example: 10 },
            message: { type: 'string', nullable: true, description: 'Informational message if data is unavailable' },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Parque Nacional do Araguaia' },
                  category: { type: 'string', example: 'Parque Nacional' },
                  group: { type: 'string', enum: ['Proteção Integral', 'Uso Sustentável'], example: 'Proteção Integral' },
                  areaHa: { type: 'number', example: 555000 },
                  municipality: { type: 'string', example: 'Bandeirantes do Tocantins' },
                  state: { type: 'string', example: 'TO' },
                  sphere: { type: 'string', enum: ['Federal', 'Estadual', 'Municipal'], example: 'Federal' },
                  coordinates: sampleCoordinatesSchema,
                  testUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        name,
        category,
        "group",
        area_ha,
        municipality,
        state,
        sphere,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM unidades_conservacao
      WHERE geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 10
    `);

    return {
      source: 'Unidades de Conservação (ICMBio)',
      count: result.rows.length,
      message: result.rows.length === 0
        ? 'Dados de Unidades de Conservação em processamento. API ICMBio temporariamente indisponível.'
        : undefined,
      samples: result.rows.map((r: any) => ({
        name: r.name,
        category: r.category,
        group: r.group,
        areaHa: r.area_ha,
        municipality: r.municipality,
        state: r.state,
        sphere: r.sphere,
        coordinates: {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(r.lat)},"lon":${parseFloat(r.lon)}}}}`
      }))
    };
  });

  /**
   * GET /samples/deter
   * Retorna coordenadas com alertas DETER recentes
   */
  fastify.get('/samples/deter', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: DETER real-time deforestation alerts',
      description: `Returns up to 10 coordinate pairs from **DETER real-time deforestation alerts** (INPE) from the last 90 days.

DETER (Detection of Deforestation in Real-Time) provides near-daily monitoring of the Amazon and Cerrado biomes.

Use these coordinates to verify that the \`/check\` endpoint correctly detects active deforestation events.`,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'DETER Real-Time Alerts (INPE)' },
            count: { type: 'integer', example: 10 },
            message: { type: 'string', nullable: true },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  alertDate: { type: 'string', format: 'date', description: 'Detection date', example: '2026-01-15' },
                  areaHa: { type: 'number', description: 'Alert area in hectares', example: 34.7 },
                  municipality: { type: 'string', example: 'Novo Progresso' },
                  state: { type: 'string', example: 'PA' },
                  classname: { type: 'string', description: 'Alert class (e.g. DESMATAMENTO_VEG)', example: 'DESMATAMENTO_VEG' },
                  sensor: { type: 'string', description: 'Satellite sensor used', example: 'CBERS4A' },
                  coordinates: sampleCoordinatesSchema,
                  testUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        alert_date,
        area_ha,
        municipality,
        state,
        classname,
        sensor,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM deter_alerts
      WHERE alert_date >= CURRENT_DATE - INTERVAL '90 days'
        AND geometry IS NOT NULL
      ORDER BY alert_date DESC, RANDOM()
      LIMIT 10
    `);

    return {
      source: 'DETER Real-Time Alerts (INPE)',
      count: result.rows.length,
      message: result.rows.length === 0
        ? 'Dados DETER em processamento. API INPE/TerraBrasilis temporariamente indisponível.'
        : undefined,
      samples: result.rows.map((r: any) => ({
        alertDate: r.alert_date,
        areaHa: r.area_ha,
        municipality: r.municipality,
        state: r.state,
        classname: r.classname,
        sensor: r.sensor,
        coordinates: {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(r.lat)},"lon":${parseFloat(r.lon)}}}}`
      }))
    };
  });

  /**
   * GET /samples/car
   * Retorna coordenadas com CAR cancelado/suspenso
   * Status codes: CA (Cancelado), SU (Suspenso), PE (Pendente), AT (Ativo)
   */
  fastify.get('/samples/car', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: CAR with irregular status (cancelled/suspended)',
      description: `Returns up to 10 CAR (Cadastro Ambiental Rural) registrations with **irregular status** — cancelled (CA), suspended (SU), or pending (PE).

Use the \`carNumber\` to test the CAR checker via \`POST /check\` with \`"type":"CAR"\`, which checks for irregular status and potential PRODES deforestation overlap.

**Status codes:**
- \`CA\` — Cancelado (Cancelled): registration was annulled
- \`SU\` — Suspenso (Suspended): temporarily suspended
- \`PE\` — Pendente (Pending): awaiting regularization
- \`AT\` — Ativo (Active): regular status`,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'CAR - Cadastro Ambiental Rural (SICAR)' },
            count: { type: 'integer', example: 10 },
            message: { type: 'string', nullable: true },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  carNumber: { type: 'string', description: 'CAR registration number', example: 'MT-5100250-XXXXXXXXXXXXXXXX' },
                  status: { type: 'string', enum: ['CA', 'SU', 'PE', 'AT'], example: 'CA' },
                  statusDescription: { type: 'string', example: 'CANCELADO' },
                  areaHa: { type: 'number', example: 120.5 },
                  municipality: { type: 'string', example: 'Sinop' },
                  state: { type: 'string', example: 'MT' },
                  coordinates: sampleCoordinatesSchema,
                  testUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        car_number,
        status,
        area_ha,
        municipality,
        state,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM car_registrations
      WHERE status IN ('CA', 'SU', 'PE')
        AND geometry IS NOT NULL
        AND NOT ST_IsEmpty(geometry)
      ORDER BY
        CASE
          WHEN status = 'CA' THEN 1
          WHEN status = 'SU' THEN 2
          ELSE 3
        END,
        RANDOM()
      LIMIT 10
    `);

    const statusMap: Record<string, string> = {
      'CA': 'CANCELADO',
      'SU': 'SUSPENSO',
      'PE': 'PENDENTE',
      'AT': 'ATIVO'
    };

    let rows = result.rows;
    let message: string | undefined;

    if (rows.length === 0) {
      const fallback = await db.execute(sql`
        SELECT
          car_number,
          status,
          area_ha,
          municipality,
          state,
          ST_Y(ST_Centroid(geometry)) as lat,
          ST_X(ST_Centroid(geometry)) as lon
        FROM car_registrations
        WHERE geometry IS NOT NULL
          AND NOT ST_IsEmpty(geometry)
        ORDER BY RANDOM()
        LIMIT 10
      `);

      rows = fallback.rows;
      if (rows.length === 0) {
        message = 'Nenhum CAR com geometria válida encontrado. Dados em processamento ou ausência de polígonos válidos.';
      } else {
        message = 'Nenhum CAR irregular com geometria válida encontrado. Retornando amostras com geometria válida de qualquer status.';
      }
    }

    return {
      source: 'CAR - Cadastro Ambiental Rural (SICAR)',
      count: rows.length,
      message,
      samples: rows.map((r: any) => ({
        carNumber: r.car_number,
        status: r.status,
        statusDescription: statusMap[r.status] || r.status,
        areaHa: r.area_ha,
        municipality: r.municipality,
        state: r.state,
        coordinates: {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        },
        testUrl: `POST /check {"input":{"type":"CAR","value":"${r.car_number}"}}`
      }))
    };
  });

  /**
   * GET /samples/prodes
   * Retorna coordenadas com desmatamento PRODES
   */
  fastify.get('/samples/prodes', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: PRODES deforestation polygons',
      description: `Returns up to 10 coordinate pairs located **inside PRODES deforestation polygons** (INPE), sorted by most recent year and largest area.

PRODES (Monitoring of the Brazilian Amazon Forest by Satellite) is the official annual deforestation monitoring system for all Brazilian biomes.

Use these coordinates to verify that the \`/check\` endpoint correctly detects deforestation using the PRODES checker.`,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'PRODES Deforestation (INPE)' },
            count: { type: 'integer', example: 10 },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  areaHa: { type: 'number', description: 'Deforested area in hectares', example: 250.3 },
                  year: { type: 'integer', description: 'Year of deforestation detection', example: 2024 },
                  municipality: { type: 'string', example: 'São Félix do Xingu' },
                  state: { type: 'string', example: 'PA' },
                  pathRow: { type: 'string', description: 'Landsat path/row', example: '224/062' },
                  coordinates: sampleCoordinatesSchema,
                  testUrl: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        area_ha,
        year,
        municipality,
        state,
        path_row,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM prodes_deforestation
      WHERE geometry IS NOT NULL
      ORDER BY year DESC, area_ha DESC, RANDOM()
      LIMIT 10
    `);

    return {
      source: 'PRODES Deforestation (INPE)',
      count: result.rows.length,
      samples: result.rows.map((r: any) => ({
        areaHa: r.area_ha,
        year: r.year,
        municipality: r.municipality,
        state: r.state,
        pathRow: r.path_row,
        coordinates: {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(r.lat)},"lon":${parseFloat(r.lon)}}}}`
      }))
    };
  });

  /**
   * GET /samples/snap
   * Retorna coordenadas dentro de áreas protegidas SNAP (Uruguay)
   */
  fastify.get('/samples/snap', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: SNAP protected areas coordinates (Uruguay)',
      description: `Returns up to 10 coordinate pairs located **inside Uruguay's SNAP protected areas** (Sistema Nacional de Áreas Protegidas).

Managed by MVOTMA (Ministry of Environment), SNAP covers national parks, nature reserves, and protected landscapes across Uruguay.

Use these coordinates with \`"country":"UY"\` to verify the SNAP checker flags them as **FAIL** for protected area violations.

**Example request:**
\`\`\`json
POST /check
{
  "input": {
    "type": "COORDINATES",
    "value": { "lat": -34.4711, "lon": -56.1945 },
    "country": "UY"
  }
}
\`\`\``,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'SNAP - Sistema Nacional de Áreas Protegidas (Uruguay)' },
            country: { type: 'string', example: 'UY' },
            count: { type: 'integer', example: 10 },
            message: { type: 'string', nullable: true },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Protected area name', example: 'Parque Nacional Cabo Polonio' },
                  category: { type: 'string', description: 'SNAP category', example: 'Parque Nacional' },
                  areaHa: { type: 'number', example: 7900 },
                  department: { type: 'string', example: 'Rocha' },
                  municipality: { type: 'string', nullable: true },
                  legalStatus: { type: 'string', example: 'Vigente' },
                  establishedDate: { type: 'string', nullable: true },
                  coordinates: sampleCoordinatesSchema,
                  testUrl: { type: 'string', example: 'POST /check {"input":{"type":"COORDINATES","value":{"lat":-34.4711,"lon":-56.1945},"country":"UY"}}' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        name,
        category,
        area_ha,
        department,
        municipality,
        legal_status,
        established_date,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM snap_areas_uruguay
      WHERE geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 10
    `);

    return {
      source: 'SNAP - Sistema Nacional de Áreas Protegidas (Uruguay)',
      country: 'UY',
      count: result.rows.length,
      message: result.rows.length === 0
        ? 'No SNAP data found. Run: npm run seed:snap-areas'
        : undefined,
      samples: result.rows.map((r: any) => ({
        name: r.name,
        category: r.category,
        areaHa: r.area_ha,
        department: r.department,
        municipality: r.municipality,
        legalStatus: r.legal_status,
        establishedDate: r.established_date,
        coordinates: {
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(r.lat)},"lon":${parseFloat(r.lon)}},"country":"UY"}}`
      }))
    };
  });

  /**
   * GET /samples/dicose
   * Retorna RUC/CI com declarações DICOSE (Uruguay)
   */
  fastify.get('/samples/dicose', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: DICOSE livestock registry (Uruguay)',
      description: `Returns up to 10 Uruguayan producer documents (RUC or CI) with **DICOSE declarations** from the last 2 years.

DICOSE (Declaración Jurada de Existencias de Ganado) is Uruguay's official livestock census managed by MGAP. It registers all livestock establishments and their bovine, ovine, and equine counts.

Producers appearing in DICOSE are considered **registered/compliant** — this is a **positive** indicator. Missing declarations may indicate non-compliance.

**Document types:**
- **RUC** — Registro Único de Contribuyentes (12 digits): company/corporate tax ID
- **CI** — Cédula de Identidad (7–8 digits): individual national ID

**Example request:**
\`\`\`json
POST /check
{
  "input": {
    "type": "RUC",
    "value": "210000000001",
    "country": "UY"
  }
}
\`\`\``,
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string', example: 'DICOSE - Rural/Livestock Registry (Uruguay)' },
            country: { type: 'string', example: 'UY' },
            count: { type: 'integer', example: 10 },
            message: { type: 'string', nullable: true },
            samples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document: { type: 'string', description: 'RUC (12 digits) or CI (7-8 digits)', example: '210000000001' },
                  documentType: { type: 'string', enum: ['RUC', 'CI'], example: 'RUC' },
                  producerName: { type: 'string', nullable: true, example: 'Estancia El Ombú' },
                  establishmentId: { type: 'string', nullable: true, description: 'DICOSE establishment identifier', example: 'D-12345' },
                  year: { type: 'integer', example: 2024 },
                  areaHa: { type: 'number', nullable: true, description: 'Declared land area in hectares', example: 850.0 },
                  department: { type: 'string', nullable: true, example: 'Tacuarembó' },
                  section: { type: 'string', nullable: true, description: 'Cadastral section', example: '3' },
                  activity: { type: 'string', nullable: true, example: 'Ganadería' },
                  livestockSummary: { type: 'string', description: 'Summary of declared livestock', example: '500 bovinos, 200 ovinos' },
                  declarationStatus: { type: 'string', nullable: true, example: 'PRESENTADA' },
                  testUrl: { type: 'string', example: 'POST /check {"input":{"type":"RUC","value":"210000000001","country":"UY"}}' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const result = await db.execute(sql`
      SELECT
        producer_document,
        producer_name,
        establishment_id,
        year,
        area_ha,
        department,
        section,
        activity,
        livestock_count,
        declaration_status
      FROM dicose_registrations
      WHERE producer_document IS NOT NULL
        AND year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
      ORDER BY year DESC, RANDOM()
      LIMIT 10
    `);

    return {
      source: 'DICOSE - Rural/Livestock Registry (Uruguay)',
      country: 'UY',
      count: result.rows.length,
      message: result.rows.length === 0
        ? 'No DICOSE data found. Run: npm run seed:dicose -- --year=2024'
        : undefined,
      samples: result.rows.map((r: any) => {
        // Detectar tipo de documento (RUC tem 12 dígitos, CI tem 7-8)
        const docType = r.producer_document.length === 12 ? 'RUC' : 'CI';

        // Criar resumo de gado se disponível
        let livestockSummary = 'No livestock data';
        if (r.livestock_count) {
          const lc = typeof r.livestock_count === 'string'
            ? JSON.parse(r.livestock_count)
            : r.livestock_count;
          const species = [];
          if (lc.bovinos > 0) species.push(`${lc.bovinos} bovinos`);
          if (lc.ovinos > 0) species.push(`${lc.ovinos} ovinos`);
          if (lc.equinos > 0) species.push(`${lc.equinos} equinos`);
          livestockSummary = species.length > 0 ? species.join(', ') : 'No livestock';
        }

        return {
          document: r.producer_document,
          documentType: docType,
          producerName: r.producer_name,
          establishmentId: r.establishment_id,
          year: r.year,
          areaHa: r.area_ha,
          department: r.department,
          section: r.section,
          activity: r.activity,
          livestockSummary,
          declarationStatus: r.declaration_status,
          testUrl: `POST /check {"input":{"type":"${docType}","value":"${r.producer_document}","country":"UY"}}`
        };
      })
    };
  });

  /**
   * GET /samples/all
   * Retorna um exemplo de cada fonte (útil para overview)
   */
  fastify.get('/samples/all', {
    schema: {
      tags: ['samples'],
      summary: 'Sample: One example from each data source',
      description: `Returns a single random sample from **every available data source** — both Brazil and Uruguay.

Useful for:
- Quick end-to-end smoke testing across all checkers
- Verifying that all data sources have been seeded
- Frontend demo pages showing live data

Each result includes a \`testUrl\` with the exact request body to copy into \`POST /check\`.

**Brazil sources:** listaSuja, ibama, terrasIndigenas, unidadesConservacao, deter, car, prodes
**Uruguay sources:** snap, dicose`,
      response: {
        200: {
          type: 'object',
          properties: {
            listaSuja: { type: 'object', nullable: true, additionalProperties: true, description: 'Lista Suja sample (Brazil)' },
            ibama: { type: 'object', nullable: true, additionalProperties: true, description: 'IBAMA embargo sample (Brazil)' },
            terrasIndigenas: { type: 'object', nullable: true, additionalProperties: true, description: 'Indigenous land coordinates (Brazil)' },
            unidadesConservacao: { type: 'object', nullable: true, additionalProperties: true, description: 'Conservation unit coordinates (Brazil)' },
            deter: { type: 'object', nullable: true, additionalProperties: true, description: 'DETER real-time alert coordinates (Brazil)' },
            car: { type: 'object', nullable: true, additionalProperties: true, description: 'Irregular CAR registration (Brazil)' },
            prodes: { type: 'object', nullable: true, additionalProperties: true, description: 'PRODES deforestation coordinates (Brazil)' },
            snap: { type: 'object', nullable: true, additionalProperties: true, description: 'SNAP protected area coordinates (Uruguay)' },
            dicose: { type: 'object', nullable: true, additionalProperties: true, description: 'DICOSE livestock registration (Uruguay)' }
          }
        }
      }
    }
  }, async (request, reply) => {
    // Lista Suja
    const listaSuja = await db.execute(sql`
      SELECT document, name, type
      FROM lista_suja
      ORDER BY RANDOM()
      LIMIT 1
    `);

    // IBAMA
    const ibama = await db.execute(sql`
      SELECT document, name, embargo_count, type
      FROM ibama_embargoes
      WHERE embargo_count > 0
      ORDER BY RANDOM()
      LIMIT 1
    `);

    // TI
    const ti = await db.execute(sql`
      SELECT
        name,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM terras_indigenas
      WHERE geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 1
    `);

    // UC
    const uc = await db.execute(sql`
      SELECT
        name,
        "group",
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM unidades_conservacao
      WHERE geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 1
    `);

    // DETER
    const deter = await db.execute(sql`
      SELECT
        alert_date,
        classname,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM deter_alerts
      WHERE alert_date >= CURRENT_DATE - INTERVAL '90 days'
        AND geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 1
    `);

    // CAR irregular
    const car = await db.execute(sql`
      SELECT
        car_number,
        status,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM car_registrations
      WHERE status IN ('CA', 'SU', 'PE')
        AND geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 1
    `);

    // PRODES
    const prodes = await db.execute(sql`
      SELECT
        year,
        area_ha,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM prodes_deforestation
      WHERE geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 1
    `);

    // SNAP (Uruguay)
    const snap = await db.execute(sql`
      SELECT
        name,
        category,
        ST_Y(ST_Centroid(geometry)) as lat,
        ST_X(ST_Centroid(geometry)) as lon
      FROM snap_areas_uruguay
      WHERE geometry IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 1
    `);

    // DICOSE (Uruguay)
    const dicose = await db.execute(sql`
      SELECT
        producer_document,
        producer_name,
        year,
        department
      FROM dicose_registrations
      WHERE producer_document IS NOT NULL
        AND year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
      ORDER BY RANDOM()
      LIMIT 1
    `);

    return {
      // Brazil sources
      listaSuja: listaSuja.rows[0] ? {
        document: listaSuja.rows[0].document,
        name: listaSuja.rows[0].name,
        type: listaSuja.rows[0].type,
        testUrl: `POST /check {"input":{"type":"${listaSuja.rows[0].type}","value":"${listaSuja.rows[0].document}"}}`
      } : null,
      ibama: ibama.rows[0] ? {
        document: ibama.rows[0].document,
        name: ibama.rows[0].name,
        embargoCount: ibama.rows[0].embargo_count,
        testUrl: `POST /check {"input":{"type":"${ibama.rows[0].type}","value":"${ibama.rows[0].document}"}}`
      } : null,
      terrasIndigenas: ti.rows[0] ? {
        name: ti.rows[0].name,
        coordinates: { lat: parseFloat(ti.rows[0].lat as string), lon: parseFloat(ti.rows[0].lon as string) },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(ti.rows[0].lat as string)},"lon":${parseFloat(ti.rows[0].lon as string)}}}}`
      } : null,
      unidadesConservacao: uc.rows[0] ? {
        name: uc.rows[0].name,
        group: uc.rows[0].group,
        coordinates: { lat: parseFloat(uc.rows[0].lat as string), lon: parseFloat(uc.rows[0].lon as string) },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(uc.rows[0].lat as string)},"lon":${parseFloat(uc.rows[0].lon as string)}}}}`
      } : null,
      deter: deter.rows[0] ? {
        alertDate: deter.rows[0].alert_date,
        classname: deter.rows[0].classname,
        coordinates: { lat: parseFloat(deter.rows[0].lat as string), lon: parseFloat(deter.rows[0].lon as string) },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(deter.rows[0].lat as string)},"lon":${parseFloat(deter.rows[0].lon as string)}}}}`
      } : null,
      car: car.rows[0] ? {
        carNumber: car.rows[0].car_number,
        status: car.rows[0].status,
        coordinates: { lat: parseFloat(car.rows[0].lat as string), lon: parseFloat(car.rows[0].lon as string) },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(car.rows[0].lat as string)},"lon":${parseFloat(car.rows[0].lon as string)}}}}`
      } : null,
      prodes: prodes.rows[0] ? {
        year: prodes.rows[0].year,
        areaHa: prodes.rows[0].area_ha,
        coordinates: { lat: parseFloat(prodes.rows[0].lat as string), lon: parseFloat(prodes.rows[0].lon as string) },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(prodes.rows[0].lat as string)},"lon":${parseFloat(prodes.rows[0].lon as string)}}}}`
      } : null,

      // Uruguay sources
      snap: snap.rows[0] ? {
        name: snap.rows[0].name,
        category: snap.rows[0].category,
        country: 'UY',
        coordinates: { lat: parseFloat(snap.rows[0].lat as string), lon: parseFloat(snap.rows[0].lon as string) },
        testUrl: `POST /check {"input":{"type":"COORDINATES","value":{"lat":${parseFloat(snap.rows[0].lat as string)},"lon":${parseFloat(snap.rows[0].lon as string)}},"country":"UY"}}`
      } : null,
      dicose: dicose.rows[0] ? (() => {
        const doc = String(dicose.rows[0].producer_document);
        const docType = doc.length === 12 ? 'RUC' : 'CI';
        return {
          document: doc,
          documentType: docType,
          producerName: dicose.rows[0].producer_name,
          year: dicose.rows[0].year,
          department: dicose.rows[0].department,
          country: 'UY',
          testUrl: `POST /check {"input":{"type":"${docType}","value":"${doc}","country":"UY"}}`
        };
      })() : null
    };
  });
};

export default samplesRoutes;
