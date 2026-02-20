import { z } from 'zod';

// Países suportados
export enum Country {
  BRAZIL = 'BR',
  URUGUAY = 'UY',
  ARGENTINA = 'AR',
  PARAGUAY = 'PY',
  BOLIVIA = 'BO',
  CHILE = 'CL',
  COLOMBIA = 'CO',
  PERU = 'PE'
}

// Tipos de input suportados
export enum InputType {
  // Brasil
  CNPJ = 'CNPJ',
  CPF = 'CPF',
  CAR = 'CAR',
  IE = 'IE', // Inscrição Estadual

  // Uruguay
  RUC = 'RUC', // Registro Único de Contribuyentes (12 dígitos)
  CI = 'CI',   // Cédula de Identidad (7-8 dígitos + check digit)

  // Argentina
  CUIT = 'CUIT',  // Clave Única de Identificación Tributaria (11 dígitos)
  CUIL = 'CUIL',  // Clave Única de Identificación Laboral (11 dígitos)

  // Paraguay
  RUC_PY = 'RUC_PY', // Registro Único del Contribuyente (11 dígitos)
  CI_PY = 'CI_PY',   // Cédula de Identidad paraguaya (7-8 dígitos)

  // Bolivia
  NIT_BO = 'NIT_BO', // Número de Identificación Tributaria (13 dígitos)
  CI_BO = 'CI_BO',   // Cédula de Identidad boliviana (7 dígitos)

  // Chile
  RUT = 'RUT',  // Rol Único Tributario (8-9 dígitos + dígito verificador)

  // Colombia
  NIT_CO = 'NIT_CO', // Número de Identificación Tributaria colombiano (10 dígitos)
  CC_CO = 'CC_CO',   // Cédula de Ciudadanía colombiana (8-10 dígitos)

  // Peru
  RUC_PE = 'RUC_PE', // Registro Único de Contribuyentes peruano (11 dígitos)
  DNI_PE = 'DNI_PE', // Documento Nacional de Identidad peruano (8 dígitos)

  // Universal
  COORDINATES = 'COORDINATES',
  ADDRESS = 'ADDRESS',
  NAME = 'NAME' // Nome do produtor/empresa
}

// Schema Zod para validação
export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180)
});

export const InputSchema = z.object({
  type: z.nativeEnum(InputType),
  value: z.union([
    z.string().min(1),
    CoordinatesSchema
  ]),
  country: z.nativeEnum(Country).optional() // País opcional (auto-detectado por tipo de documento)
});

export const CheckOptionsSchema = z.object({
  sources: z.array(z.string()).optional().default(['all']),
  useCache: z.boolean().optional().default(true),
  includeEvidence: z.boolean().optional().default(true),
  timeout: z.number().optional().default(30000)
});

export const CheckRequestSchema = z.object({
  input: InputSchema,
  options: CheckOptionsSchema.optional()
});

// Types inferidos dos schemas
export type Coordinates = z.infer<typeof CoordinatesSchema>;
export type Input = z.infer<typeof InputSchema>;
export type CheckOptions = z.infer<typeof CheckOptionsSchema>;
export type CheckRequest = z.infer<typeof CheckRequestSchema>;

// Tipo normalizado (interno)
export interface NormalizedInput {
  type: InputType;
  value: string;
  originalValue: string | Coordinates;
  country: Country; // País sempre presente após normalização
  coordinates?: Coordinates;
  metadata?: Record<string, any>;
}
