import { pgTable, uuid, varchar, text, integer, boolean, jsonb, timestamp, date } from 'drizzle-orm/pg-core';

// Histórico de todas as verificações
export const checkRequests = pgTable('check_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  inputType: varchar('input_type', { length: 50 }).notNull(),
  inputValue: varchar('input_value', { length: 255 }).notNull(),
  inputNormalized: varchar('input_normalized', { length: 255 }),
  verdict: varchar('verdict', { length: 50 }),
  score: integer('score'),
  sourcesChecked: jsonb('sources_checked').$type<string[]>(),
  results: jsonb('results').$type<any[]>(),
  summary: jsonb('summary').$type<any>(),
  metadata: jsonb('metadata').$type<any>(),
  processingTimeMs: integer('processing_time_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by') // user_id se autenticado
});

// Registro de fontes/checkers
export const checkerSources = pgTable('checker_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).unique().notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  description: text('description'),
  dataSourceUrl: varchar('data_source_url', { length: 500 }),
  lastUpdated: timestamp('last_updated', { withTimezone: true }),
  isActive: boolean('is_active').default(true).notNull(),
  priority: integer('priority').default(5),
  config: jsonb('config').$type<any>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// Métricas de cache
export const checkerCacheStats = pgTable('checker_cache_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  checkerName: varchar('checker_name', { length: 100 }).notNull(),
  date: date('date').notNull(),
  totalRequests: integer('total_requests').default(0),
  cacheHits: integer('cache_hits').default(0),
  cacheMisses: integer('cache_misses').default(0),
  avgExecutionTimeMs: integer('avg_execution_time_ms')
});

// Índices para performance
export const checkRequestsIdx = {
  inputTypeIdx: 'idx_check_requests_input_type',
  inputValueIdx: 'idx_check_requests_input_value',
  createdAtIdx: 'idx_check_requests_created_at'
};
