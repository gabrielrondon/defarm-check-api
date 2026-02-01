import { z } from 'zod';

// Tipos de input suportados
export enum InputType {
  CNPJ = 'CNPJ',
  CPF = 'CPF',
  CAR = 'CAR',
  IE = 'IE', // Inscrição Estadual
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
  ])
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
  coordinates?: Coordinates;
  metadata?: Record<string, any>;
}
