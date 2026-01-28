import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../../utils/logger.js';
import { ValidationError } from '../../utils/errors.js';

export async function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error({ err: error, path: request.url }, 'Request error');

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      statusCode: 400,
      details: error.errors
    });
  }

  // Custom validation errors
  if (error instanceof ValidationError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      statusCode: 400,
      details: error.details
    });
  }

  // Fastify errors
  if ('statusCode' in error) {
    return reply.status(error.statusCode || 500).send({
      error: error.name,
      message: error.message,
      statusCode: error.statusCode || 500
    });
  }

  // Default error
  return reply.status(500).send({
    error: 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
    statusCode: 500
  });
}
