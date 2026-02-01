import { pgTable, uuid, varchar, text, integer, boolean, jsonb, timestamp, date, doublePrecision } from 'drizzle-orm/pg-core';

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

// Tabela de desmatamento PRODES (dados geoespaciais)
// Nota: geometria será gerenciada via SQL direto (PostGIS)
export const prodesDeforestation = pgTable('prodes_deforestation', {
  id: uuid('id').defaultRandom().primaryKey(),
  year: integer('year').notNull(),
  areaHa: integer('area_ha').notNull(),
  state: varchar('state', { length: 2 }),
  municipality: varchar('municipality', { length: 255 }),
  pathRow: varchar('path_row', { length: 10 }),
  source: varchar('source', { length: 50 }).default('PRODES'),
  // geometria será adicionada via SQL: geometry(MULTIPOLYGON, 4326)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de alertas DETER (desmatamento em tempo real - INPE)
// Nota: geometria será gerenciada via SQL direto (PostGIS)
export const deterAlerts = pgTable('deter_alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  alertDate: date('alert_date').notNull(), // Data do alerta
  areaHa: integer('area_ha').notNull(), // Área desmatada/degradada
  state: varchar('state', { length: 2 }),
  municipality: varchar('municipality', { length: 255 }),
  classname: varchar('classname', { length: 50 }), // DESMATAMENTO_VEG, DEGRADACAO, etc
  sensor: varchar('sensor', { length: 20 }), // LANDSAT_8, SENTINEL_2, etc
  pathRow: varchar('path_row', { length: 10 }), // Path/Row do satélite
  source: varchar('source', { length: 20 }).default('DETER-B'),
  // geometria será adicionada via SQL: geometry(MULTIPOLYGON, 4326)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de Terras Indígenas (FUNAI)
// Nota: geometria será gerenciada via SQL direto (PostGIS)
export const terrasIndigenas = pgTable('terras_indigenas', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(), // Nome da Terra Indígena
  etnia: varchar('etnia', { length: 100 }), // Etnia indígena
  phase: varchar('phase', { length: 50 }), // Declarada, Homologada, Regularizada
  areaHa: integer('area_ha'), // Área em hectares
  state: varchar('state', { length: 2 }),
  municipality: varchar('municipality', { length: 255 }),
  modalidade: varchar('modalidade', { length: 50 }), // Tipo de TI
  source: varchar('source', { length: 50 }).default('FUNAI'),
  // geometria será adicionada via SQL: geometry(MULTIPOLYGON, 4326)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de Queimadas/Focos de Calor (INPE)
// Nota: geometria será gerenciada via SQL direto (PostGIS)
export const queimadasFocos = pgTable('queimadas_focos', {
  id: uuid('id').defaultRandom().primaryKey(),
  latitude: varchar('latitude', { length: 20 }).notNull(),
  longitude: varchar('longitude', { length: 20 }).notNull(),
  dateTime: timestamp('date_time', { withTimezone: true }).notNull(), // Data/hora do foco
  satellite: varchar('satellite', { length: 50 }), // Satélite que detectou (AQUA, TERRA, NPP, etc)
  municipality: varchar('municipality', { length: 255 }),
  state: varchar('state', { length: 50 }), // Estado por extenso (ex: PARÁ, PIAUÍ, MARANHÃO)
  biome: varchar('biome', { length: 50 }), // Amazônia, Cerrado, Mata Atlântica, etc
  frp: integer('frp'), // Fire Radiative Power (potência radiativa do fogo)
  riskLevel: varchar('risk_level', { length: 20 }), // Baixo, Médio, Alto, Crítico
  source: varchar('source', { length: 50 }).default('INPE'),
  // geometria será adicionada via SQL: geometry(POINT, 4326)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de Alertas MapBiomas (desmatamento validado)
// Nota: geometria será gerenciada via SQL direto (PostGIS)
export const mapbiomasAlerta = pgTable('mapbiomas_alerta', {
  id: uuid('id').defaultRandom().primaryKey(),
  alertCode: varchar('alert_code', { length: 50 }).notNull().unique(), // Código único do alerta
  areaHa: integer('area_ha').notNull(), // Área desmatada em hectares
  detectedAt: date('detected_at').notNull(), // Data de detecção
  publishedAt: date('published_at').notNull(), // Data de publicação/validação
  state: varchar('state', { length: 2 }),
  municipality: varchar('municipality', { length: 255 }),
  biome: varchar('biome', { length: 50 }),
  deforestationClass: varchar('deforestation_class', { length: 100 }), // agriculture, mining, urban, etc
  deforestationSpeed: varchar('deforestation_speed', { length: 20 }), // slow, moderate, fast
  source: varchar('source', { length: 50 }), // DETER, SAD, GLAD, etc
  statusName: varchar('status_name', { length: 50 }).default('published'),
  // Intersecções com territórios especiais
  indigenousLand: boolean('indigenous_land').default(false),
  conservationUnit: boolean('conservation_unit').default(false),
  embargoedArea: boolean('embargoed_area').default(false),
  authorizedArea: boolean('authorized_area').default(false),
  // Dados de propriedades rurais cruzadas
  carCodes: jsonb('car_codes').$type<string[]>(), // CAR codes que intersectam
  carIntersectionCount: integer('car_intersection_count').default(0),
  // Metadados
  sourceData: varchar('source_data', { length: 50 }).default('MapBiomas Alerta'),
  // geometria será adicionada via SQL: geometry(MULTIPOLYGON, 4326)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de Produtores Orgânicos (MAPA/CNPO)
export const mapaOrganicos = pgTable('mapa_organicos', {
  id: uuid('id').defaultRandom().primaryKey(),
  document: varchar('document', { length: 20 }).notNull(), // CPF/CNPJ normalizado
  documentFormatted: varchar('document_formatted', { length: 25 }), // Formato original
  type: varchar('type', { length: 10 }).notNull(), // CPF ou CNPJ
  producerName: text('producer_name').notNull(), // Nome do produtor
  entityType: varchar('entity_type', { length: 50 }), // CERTIFICADORA, OPAC, OCS
  entityName: text('entity_name'), // Nome da entidade certificadora
  country: varchar('country', { length: 100 }), // País
  state: varchar('state', { length: 50 }), // Estado
  city: varchar('city', { length: 255 }), // Município
  status: varchar('status', { length: 20 }).notNull(), // ATIVO ou INATIVO
  scope: text('scope'), // Escopo de atuação (produção primária, processamento, etc)
  activities: text('activities'), // Produtos/atividades (pode ser muito longo)
  contact: varchar('contact', { length: 255 }), // Email de contato
  source: varchar('source', { length: 50 }).default('MAPA/CNPO'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de Unidades de Conservação (ICMBio)
// Nota: geometria será gerenciada via SQL direto (PostGIS)
export const unidadesConservacao = pgTable('unidades_conservacao', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(), // Nome da UC
  category: varchar('category', { length: 100 }), // Categoria (Parque, Reserva, etc)
  group: varchar('group', { length: 50 }), // Proteção Integral ou Uso Sustentável
  areaHa: integer('area_ha'), // Área em hectares
  state: varchar('state', { length: 2 }),
  municipality: varchar('municipality', { length: 255 }),
  sphere: varchar('sphere', { length: 50 }), // Federal, Estadual, Municipal
  source: varchar('source', { length: 50 }).default('ICMBio'),
  // geometria será adicionada via SQL: geometry(MULTIPOLYGON, 4326)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de CAR - Cadastro Ambiental Rural (SICAR)
// Nota: geometria será gerenciada via SQL direto (PostGIS)
export const carRegistrations = pgTable('car_registrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  carNumber: varchar('car_number', { length: 50 }).notNull().unique(), // Número do CAR
  status: varchar('status', { length: 50 }), // Ativo, Pendente, Cancelado, Suspenso
  ownerDocument: varchar('owner_document', { length: 20 }), // CPF/CNPJ do proprietário
  ownerName: text('owner_name'), // Nome do proprietário
  propertyName: text('property_name'), // Nome da propriedade
  areaHa: integer('area_ha'), // Área em hectares
  state: varchar('state', { length: 2 }).notNull(),
  municipality: varchar('municipality', { length: 255 }),
  source: varchar('source', { length: 50 }).default('SICAR'),
  // geometria será adicionada via SQL: geometry(MULTIPOLYGON, 4326)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela Lista Suja do Trabalho Escravo (MTE)
export const listaSuja = pgTable('lista_suja', {
  id: uuid('id').defaultRandom().primaryKey(),
  document: varchar('document', { length: 20 }).notNull().unique(), // CPF ou CNPJ sem formatação
  documentFormatted: varchar('document_formatted', { length: 25 }),
  type: varchar('type', { length: 10 }).notNull(), // CPF ou CNPJ
  name: text('name').notNull(),
  year: integer('year').notNull(),
  state: varchar('state', { length: 2 }),
  address: text('address'),
  workersAffected: integer('workers_affected'),
  cnae: varchar('cnae', { length: 50 }),
  inclusionDate: varchar('inclusion_date', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de Embargos IBAMA
export const ibamaEmbargoes = pgTable('ibama_embargoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  document: varchar('document', { length: 20 }).notNull(), // CPF ou CNPJ sem formatação
  documentFormatted: varchar('document_formatted', { length: 25 }),
  type: varchar('type', { length: 10 }).notNull(), // CPF ou CNPJ
  name: text('name').notNull(),
  embargoCount: integer('embargo_count').notNull(),
  totalAreaHa: integer('total_area_ha').notNull(),
  embargos: jsonb('embargos').$type<any[]>().notNull(), // Array de embargos com detalhes
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Tabela de Sanções da CGU (CEIS, CNEP, CEAF)
export const cguSancoes = pgTable('cgu_sancoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  document: varchar('document', { length: 20 }).notNull(), // CPF ou CNPJ sem formatação
  documentFormatted: varchar('document_formatted', { length: 25 }),
  type: varchar('type', { length: 10 }).notNull(), // CPF ou CNPJ
  name: text('name').notNull(),
  sanctionType: varchar('sanction_type', { length: 10 }).notNull(), // CEIS, CNEP, CEAF
  category: varchar('category', { length: 100 }), // Categoria da sanção
  startDate: date('start_date'), // Data de início da sanção
  endDate: date('end_date'), // Data de fim (se aplicável)
  description: text('description'), // Descrição da sanção/motivo
  sanctioningOrgan: varchar('sanctioning_organ', { length: 255 }), // Órgão sancionador
  processNumber: varchar('process_number', { length: 100 }), // Número do processo
  status: varchar('status', { length: 50 }), // ATIVO, CANCELADO, EXTINTO, etc
  federativeUnit: varchar('federative_unit', { length: 2 }), // UF (se aplicável)
  municipality: varchar('municipality', { length: 255 }), // Município (se aplicável)
  source: varchar('source', { length: 50 }).default('CGU'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

// Índices para performance
export const checkRequestsIdx = {
  inputTypeIdx: 'idx_check_requests_input_type',
  inputValueIdx: 'idx_check_requests_input_value',
  createdAtIdx: 'idx_check_requests_created_at'
};

export const listaSujaIdx = {
  documentIdx: 'idx_lista_suja_document',
  typeIdx: 'idx_lista_suja_type'
};

export const ibamaEmbargoesIdx = {
  documentIdx: 'idx_ibama_embargoes_document',
  typeIdx: 'idx_ibama_embargoes_type'
};

export const cguSancoesIdx = {
  documentIdx: 'idx_cgu_sancoes_document',
  typeIdx: 'idx_cgu_sancoes_type',
  sanctionTypeIdx: 'idx_cgu_sancoes_sanction_type',
  statusIdx: 'idx_cgu_sancoes_status'
};

export const deterAlertsIdx = {
  alertDateIdx: 'idx_deter_alerts_alert_date',
  stateIdx: 'idx_deter_alerts_state',
  classnameIdx: 'idx_deter_alerts_classname'
};

export const queimadasFocosIdx = {
  dateTimeIdx: 'idx_queimadas_focos_date_time',
  stateIdx: 'idx_queimadas_focos_state',
  biomeIdx: 'idx_queimadas_focos_biome',
  satelliteIdx: 'idx_queimadas_focos_satellite'
};

export const terrasIndigenasIdx = {
  nameIdx: 'idx_terras_indigenas_name',
  stateIdx: 'idx_terras_indigenas_state',
  phaseIdx: 'idx_terras_indigenas_phase'
};

export const unidadesConservacaoIdx = {
  nameIdx: 'idx_unidades_conservacao_name',
  stateIdx: 'idx_unidades_conservacao_state',
  groupIdx: 'idx_unidades_conservacao_group',
  categoryIdx: 'idx_unidades_conservacao_category'
};

export const carRegistrationsIdx = {
  carNumberIdx: 'idx_car_registrations_car_number',
  stateIdx: 'idx_car_registrations_state',
  statusIdx: 'idx_car_registrations_status',
  ownerDocumentIdx: 'idx_car_registrations_owner_document'
};

export const mapbiomasAlertaIdx = {
  alertCodeIdx: 'idx_mapbiomas_alerta_alert_code',
  detectedAtIdx: 'idx_mapbiomas_alerta_detected_at',
  publishedAtIdx: 'idx_mapbiomas_alerta_published_at',
  stateIdx: 'idx_mapbiomas_alerta_state',
  biomeIdx: 'idx_mapbiomas_alerta_biome',
  deforestationClassIdx: 'idx_mapbiomas_alerta_deforestation_class',
  embargoedAreaIdx: 'idx_mapbiomas_alerta_embargoed_area'
};

// Tabela de Outorgas (ANA) - Water Use Permits
export const anaOutorgas = pgTable('ana_outorgas', {
  id: uuid('id').defaultRandom().primaryKey(),
  intCd: varchar('int_cd', { length: 50 }), // Internal code
  numeroProcesso: varchar('numero_processo', { length: 100 }), // Process number
  codigoCnarh: varchar('codigo_cnarh', { length: 50 }), // CNARH registry code
  nomeRequerente: varchar('nome_requerente', { length: 500 }), // Requester name
  municipio: varchar('municipio', { length: 255 }),
  uf: varchar('uf', { length: 2 }),
  corpoHidrico: varchar('corpo_hidrico', { length: 255 }), // Water body
  regiaoHidrografica: varchar('regiao_hidrografica', { length: 255 }), // Hydrographic region
  finalidadePrincipal: varchar('finalidade_principal', { length: 100 }), // Main purpose (Irrigação, Indústria, etc.)
  tipoInterferencia: varchar('tipo_interferencia', { length: 100 }), // Interference type (Captação, Lançamento, etc.)
  resolucao: varchar('resolucao', { length: 100 }), // Resolution number
  dataPublicacao: date('data_publicacao'), // Publication date
  dataVencimento: date('data_vencimento'), // Expiration date
  categoria: varchar('categoria', { length: 50 }), // Category (Direito de Uso, Outorga Preventiva)
  volumeAnualM3: integer('volume_anual_m3'), // Annual volume in m³
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const anaOutorgasIdx = {
  codigoCnarhIdx: 'idx_ana_outorgas_codigo_cnarh',
  ufIdx: 'idx_ana_outorgas_uf',
  categoriaIdx: 'idx_ana_outorgas_categoria',
  dataVencimentoIdx: 'idx_ana_outorgas_data_vencimento',
  finalidadeIdx: 'idx_ana_outorgas_finalidade'
};

// Tabela de API Keys para autenticação
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(), // Nome/descrição da key (ex: "defarm-core production")
  keyPrefix: varchar('key_prefix', { length: 16 }).notNull(), // Primeiros 12 chars da key (para busca rápida)
  keyHash: varchar('key_hash', { length: 255 }).notNull().unique(), // Hash bcrypt da API key
  isActive: boolean('is_active').default(true).notNull(),
  rateLimit: integer('rate_limit').default(100).notNull(), // Requests por minuto
  permissions: jsonb('permissions').$type<string[]>().default(['read']), // ["read", "write", "admin"]
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // Opcional: data de expiração
  createdBy: varchar('created_by', { length: 100 }), // Quem criou (email, etc)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const apiKeysIdx = {
  keyHashIdx: 'idx_api_keys_key_hash',
  isActiveIdx: 'idx_api_keys_is_active'
};
