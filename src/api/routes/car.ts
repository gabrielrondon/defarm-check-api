/**
 * CAR Routes - Query CAR registrations and geometries
 *
 * Endpoints for fetching CAR (Cadastro Ambiental Rural) data including:
 * - Basic CAR information (status, area, owner)
 * - Polygon geometries as GeoJSON
 */

import { FastifyPluginAsync } from 'fastify';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

const carRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /car/:carNumber
   * Get CAR registration data including polygon geometry
   */
  fastify.get('/car/:carNumber', {
    schema: {
      tags: ['CAR'],
      description: 'Get CAR registration details including polygon geometry',
      params: {
        type: 'object',
        required: ['carNumber'],
        properties: {
          carNumber: {
            type: 'string',
            description: 'CAR registration number (e.g., AC-1200013-...)'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          includeGeometry: {
            type: 'boolean',
            default: true,
            description: 'Include polygon geometry as GeoJSON (default: true)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            carNumber: { type: 'string' },
            status: { type: 'string' },
            ownerDocument: { type: 'string' },
            ownerName: { type: 'string' },
            propertyName: { type: 'string' },
            areaHa: { type: 'number' },
            state: { type: 'string' },
            municipality: { type: 'string' },
            source: { type: 'string' },
            createdAt: { type: 'string' },
            geometry: {
              type: 'object',
              description: 'GeoJSON geometry (if includeGeometry=true)'
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            carNumber: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { carNumber } = request.params as { carNumber: string };
    const { includeGeometry = true } = request.query as { includeGeometry?: boolean };

    try {
      // Query with optional geometry
      const query = includeGeometry
        ? sql`
          SELECT
            car_number,
            status,
            owner_document,
            owner_name,
            property_name,
            area_ha,
            state,
            municipality,
            source,
            created_at,
            ST_AsGeoJSON(geometry) as geometry_geojson
          FROM car_registrations
          WHERE car_number = ${carNumber}
          LIMIT 1
        `
        : sql`
          SELECT
            car_number,
            status,
            owner_document,
            owner_name,
            property_name,
            area_ha,
            state,
            municipality,
            source,
            created_at
          FROM car_registrations
          WHERE car_number = ${carNumber}
          LIMIT 1
        `;

      const result = await db.execute(query);

      if (!result.rows || result.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'CAR registration not found',
          carNumber: carNumber
        });
      }

      const car: any = result.rows[0];

      // Build response
      const response: any = {
        carNumber: car.car_number,
        status: car.status,
        ownerDocument: car.owner_document,
        ownerName: car.owner_name,
        propertyName: car.property_name,
        areaHa: car.area_ha,
        state: car.state,
        municipality: car.municipality,
        source: car.source,
        createdAt: car.created_at
      };

      // Add geometry if requested
      if (includeGeometry && car.geometry_geojson) {
        response.geometry = JSON.parse(car.geometry_geojson);
      }

      return reply.send(response);

    } catch (err) {
      fastify.log.error({ err, carNumber }, 'Failed to fetch CAR registration');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch CAR registration'
      });
    }
  });

  /**
   * GET /car/:carNumber/geojson
   * Get CAR as a complete GeoJSON Feature (for direct map rendering)
   */
  fastify.get('/car/:carNumber/geojson', {
    schema: {
      tags: ['CAR'],
      description: 'Get CAR registration as a GeoJSON Feature (ready for mapping)',
      params: {
        type: 'object',
        required: ['carNumber'],
        properties: {
          carNumber: {
            type: 'string',
            description: 'CAR registration number'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['Feature'] },
            properties: { type: 'object' },
            geometry: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    const { carNumber } = request.params as { carNumber: string };

    try {
      const result = await db.execute(sql`
        SELECT
          car_number,
          status,
          owner_document,
          owner_name,
          property_name,
          area_ha,
          state,
          municipality,
          source,
          ST_AsGeoJSON(geometry) as geometry_geojson
        FROM car_registrations
        WHERE car_number = ${carNumber}
        LIMIT 1
      `);

      if (!result.rows || result.rows.length === 0) {
        return reply.status(404).send({
          error: 'Not Found',
          message: 'CAR registration not found',
          carNumber: carNumber
        });
      }

      const car: any = result.rows[0];

      // Build GeoJSON Feature
      const feature = {
        type: 'Feature',
        properties: {
          carNumber: car.car_number,
          status: car.status,
          ownerDocument: car.owner_document,
          ownerName: car.owner_name,
          propertyName: car.property_name,
          areaHa: car.area_ha,
          state: car.state,
          municipality: car.municipality,
          source: car.source
        },
        geometry: car.geometry_geojson ? JSON.parse(car.geometry_geojson) : null
      };

      return reply.send(feature);

    } catch (err) {
      fastify.log.error({ err, carNumber }, 'Failed to fetch CAR GeoJSON');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch CAR GeoJSON'
      });
    }
  });

  /**
   * POST /car/batch
   * Get multiple CAR registrations at once
   */
  fastify.post('/car/batch', {
    schema: {
      tags: ['CAR'],
      description: 'Get multiple CAR registrations by numbers',
      body: {
        type: 'object',
        required: ['carNumbers'],
        properties: {
          carNumbers: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 100,
            description: 'Array of CAR numbers (max 100)'
          },
          includeGeometry: {
            type: 'boolean',
            default: false,
            description: 'Include polygon geometries (default: false due to size)'
          }
        }
      }
    }
  }, async (request, reply) => {
    const { carNumbers, includeGeometry = false } = request.body as {
      carNumbers: string[],
      includeGeometry?: boolean
    };

    try {
      // Build SQL with dynamic CAR number array
      const carNumberValues = sql.join(
        carNumbers.map(num => sql`${num}`),
        sql`, `
      );

      const query = includeGeometry
        ? sql`
          SELECT
            car_number,
            status,
            owner_document,
            owner_name,
            property_name,
            area_ha,
            state,
            municipality,
            source,
            ST_AsGeoJSON(geometry) as geometry_geojson
          FROM car_registrations
          WHERE car_number IN (${carNumberValues})
        `
        : sql`
          SELECT
            car_number,
            status,
            owner_document,
            owner_name,
            property_name,
            area_ha,
            state,
            municipality,
            source
          FROM car_registrations
          WHERE car_number IN (${carNumberValues})
        `;

      const result = await db.execute(query);

      // Map results
      const cars = result.rows.map((car: any) => {
        const response: any = {
          carNumber: car.car_number,
          status: car.status,
          ownerDocument: car.owner_document,
          ownerName: car.owner_name,
          propertyName: car.property_name,
          areaHa: car.area_ha,
          state: car.state,
          municipality: car.municipality,
          source: car.source
        };

        if (includeGeometry && car.geometry_geojson) {
          response.geometry = JSON.parse(car.geometry_geojson);
        }

        return response;
      });

      return reply.send({
        count: cars.length,
        requested: carNumbers.length,
        cars
      });

    } catch (err) {
      fastify.log.error({ err }, 'Failed to fetch batch CAR registrations');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to fetch batch CAR registrations'
      });
    }
  });

};

export default carRoutes;
