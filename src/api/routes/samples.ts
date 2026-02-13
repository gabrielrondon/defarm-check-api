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

const samplesRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /samples/lista-suja
   * Retorna exemplos de CPF/CNPJ na Lista Suja
   */
  fastify.get('/samples/lista-suja', async (request, reply) => {
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
  fastify.get('/samples/ibama', async (request, reply) => {
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
  fastify.get('/samples/cgu-sancoes', async (request, reply) => {
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
  fastify.get('/samples/terras-indigenas', async (request, reply) => {
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
  fastify.get('/samples/unidades-conservacao', async (request, reply) => {
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
  fastify.get('/samples/deter', async (request, reply) => {
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
  fastify.get('/samples/car', async (request, reply) => {
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

    return {
      source: 'CAR - Cadastro Ambiental Rural (SICAR)',
      count: result.rows.length,
      message: result.rows.length === 0
        ? 'Nenhum CAR com status irregular encontrado. Dados em processamento ou todos registros estão ativos.'
        : undefined,
      samples: result.rows.map((r: any) => ({
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
  fastify.get('/samples/prodes', async (request, reply) => {
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
   * GET /samples/all
   * Retorna um exemplo de cada fonte (útil para overview)
   */
  fastify.get('/samples/all', async (request, reply) => {
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

    return {
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
      } : null
    };
  });
};

export default samplesRoutes;
