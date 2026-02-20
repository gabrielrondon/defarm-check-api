import { InputType, Country } from '../types/input.js';

// ============================================================================
// BRASIL - Validators
// ============================================================================

// Valida e normaliza CNPJ
export function normalizeCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) {
    throw new Error('CNPJ inválido: deve ter 14 dígitos');
  }
  return cleaned;
}

// Valida e normaliza CPF
export function normalizeCPF(cpf: string): string {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) {
    throw new Error('CPF inválido: deve ter 11 dígitos');
  }
  return cleaned;
}

// Valida CAR (formato varia por estado)
export function normalizeCAR(car: string): string {
  const cleaned = car.replace(/\s+/g, '').toUpperCase();
  // Formato básico: XX-XXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  if (cleaned.length < 10) {
    throw new Error('CAR inválido: formato incorreto');
  }
  return cleaned;
}

// Valida Inscrição Estadual (formato varia muito por estado)
export function normalizeIE(ie: string): string {
  const cleaned = ie.replace(/\D/g, '');
  if (cleaned.length < 8) {
    throw new Error('IE inválido: muito curto');
  }
  return cleaned;
}

// ============================================================================
// URUGUAY - Validators
// ============================================================================

// Valida e normaliza RUC (Registro Único de Contribuyentes - Uruguay)
export function normalizeRUC(ruc: string): string {
  const cleaned = ruc.replace(/\D/g, '');
  if (cleaned.length !== 12) {
    throw new Error('RUC inválido: deve ter 12 dígitos');
  }
  return cleaned;
}

// Valida e normaliza CI (Cédula de Identidad - Uruguay)
export function normalizeCI(ci: string): string {
  // Remove separadores: . _ - /
  const cleaned = ci.replace(/[._\-\/]/g, '');

  if (!/^\d{7,8}$/.test(cleaned)) {
    throw new Error('CI inválida: deve ter 7 ou 8 dígitos');
  }

  // Valida check digit usando algoritmo uruguaio
  if (!validateCICheckDigit(cleaned)) {
    throw new Error('CI inválida: dígito verificador incorreto');
  }

  return cleaned;
}

// Valida dígito verificador da CI uruguaia
function validateCICheckDigit(ci: string): boolean {
  const digits = ci.slice(0, -1).split('').map(Number);
  const checkDigit = parseInt(ci.slice(-1));
  const multipliers = [2, 9, 8, 7, 6, 3, 4];

  // Preenche com zeros à esquerda se necessário (para CIs de 7 dígitos)
  while (digits.length < 7) {
    digits.unshift(0);
  }

  const sum = digits.reduce((acc, digit, i) => acc + digit * multipliers[i], 0);
  const calculated = (10 - (sum % 10)) % 10;

  return calculated === checkDigit;
}

// ============================================================================
// ARGENTINA - Validators
// ============================================================================

// Valida e normaliza CUIT (Clave Única de Identificación Tributaria - Argentina)
export function normalizeCUIT(cuit: string): string {
  const cleaned = cuit.replace(/[\-\.]/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    throw new Error('CUIT inválido: deve ter 11 dígitos');
  }
  return cleaned;
}

// Valida e normaliza CUIL (Clave Única de Identificación Laboral - Argentina)
export function normalizeCUIL(cuil: string): string {
  const cleaned = cuil.replace(/[\-\.]/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    throw new Error('CUIL inválido: deve ter 11 dígitos');
  }
  return cleaned;
}

// ============================================================================
// PARAGUAY - Validators
// ============================================================================

// Valida e normaliza RUC (Registro Único del Contribuyente - Paraguay)
export function normalizeRUC_PY(ruc: string): string {
  const cleaned = ruc.replace(/[\-\.]/g, '');
  if (!/^\d{6,11}$/.test(cleaned)) {
    throw new Error('RUC Paraguay inválido: deve ter 6-11 dígitos');
  }
  return cleaned;
}

// Valida e normaliza CI (Cédula de Identidad - Paraguay)
export function normalizeCI_PY(ci: string): string {
  const cleaned = ci.replace(/[\-\.\s]/g, '');
  if (!/^\d{7,8}$/.test(cleaned)) {
    throw new Error('CI Paraguay inválida: deve ter 7-8 dígitos');
  }
  return cleaned;
}

// ============================================================================
// BOLIVIA - Validators
// ============================================================================

// Valida e normaliza NIT (Número de Identificación Tributaria - Bolivia)
export function normalizeNIT_BO(nit: string): string {
  const cleaned = nit.replace(/[\-\.\s]/g, '');
  if (!/^\d{7,13}$/.test(cleaned)) {
    throw new Error('NIT Bolivia inválido: deve ter 7-13 dígitos');
  }
  return cleaned;
}

// Valida e normaliza CI (Cédula de Identidad - Bolivia)
export function normalizeCI_BO(ci: string): string {
  const cleaned = ci.replace(/[\-\.\s]/g, '');
  if (!/^\d{7}$/.test(cleaned)) {
    throw new Error('CI Bolivia inválida: deve ter 7 dígitos');
  }
  return cleaned;
}

// ============================================================================
// CHILE - Validators
// ============================================================================

// Valida e normaliza RUT (Rol Único Tributario - Chile)
// Formato: XXXXXXXX-X (dígito verificador pode ser 0-9 ou K)
export function normalizeRUT(rut: string): string {
  const cleaned = rut.replace(/\./g, '').replace(/-/g, '');
  // RUT sem o dígito verificador: 7-8 dígitos; total com DV: 8-9 chars
  if (!/^\d{7,8}[0-9Kk]$/.test(cleaned)) {
    throw new Error('RUT inválido: formato esperado XXXXXXXX-X');
  }
  return cleaned.toUpperCase();
}

// ============================================================================
// COLOMBIA - Validators
// ============================================================================

// Valida e normaliza NIT (Número de Identificación Tributaria - Colombia)
export function normalizeNIT_CO(nit: string): string {
  const cleaned = nit.replace(/[\-\.\s]/g, '');
  if (!/^\d{9,10}$/.test(cleaned)) {
    throw new Error('NIT Colombia inválido: deve ter 9-10 dígitos');
  }
  return cleaned;
}

// Valida e normaliza CC (Cédula de Ciudadanía - Colombia)
export function normalizeCC_CO(cc: string): string {
  const cleaned = cc.replace(/[\-\.\s]/g, '');
  if (!/^\d{8,10}$/.test(cleaned)) {
    throw new Error('CC Colombia inválida: deve ter 8-10 dígitos');
  }
  return cleaned;
}

// ============================================================================
// PERU - Validators
// ============================================================================

// Valida e normaliza RUC (Registro Único de Contribuyentes - Peru)
export function normalizeRUC_PE(ruc: string): string {
  const cleaned = ruc.replace(/[\-\.\s]/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    throw new Error('RUC Peru inválido: deve ter 11 dígitos');
  }
  return cleaned;
}

// Valida e normaliza DNI (Documento Nacional de Identidad - Peru)
export function normalizeDNI_PE(dni: string): string {
  const cleaned = dni.replace(/[\-\.\s]/g, '');
  if (!/^\d{8}$/.test(cleaned)) {
    throw new Error('DNI Peru inválido: deve ter 8 dígitos');
  }
  return cleaned;
}

// ============================================================================
// UNIVERSAL - Validators
// ============================================================================

// Valida coordenadas
export function validateCoordinates(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// Normaliza input baseado no tipo
export function normalizeInput(type: InputType, value: any): string {
  switch (type) {
    // Brasil
    case InputType.CNPJ:
      return normalizeCNPJ(value as string);
    case InputType.CPF:
      return normalizeCPF(value as string);
    case InputType.CAR:
      return normalizeCAR(value as string);
    case InputType.IE:
      return normalizeIE(value as string);

    // Uruguay
    case InputType.RUC:
      return normalizeRUC(value as string);
    case InputType.CI:
      return normalizeCI(value as string);

    // Argentina
    case InputType.CUIT:
      return normalizeCUIT(value as string);
    case InputType.CUIL:
      return normalizeCUIL(value as string);

    // Paraguay
    case InputType.RUC_PY:
      return normalizeRUC_PY(value as string);
    case InputType.CI_PY:
      return normalizeCI_PY(value as string);

    // Bolivia
    case InputType.NIT_BO:
      return normalizeNIT_BO(value as string);
    case InputType.CI_BO:
      return normalizeCI_BO(value as string);

    // Chile
    case InputType.RUT:
      return normalizeRUT(value as string);

    // Colombia
    case InputType.NIT_CO:
      return normalizeNIT_CO(value as string);
    case InputType.CC_CO:
      return normalizeCC_CO(value as string);

    // Peru
    case InputType.RUC_PE:
      return normalizeRUC_PE(value as string);
    case InputType.DNI_PE:
      return normalizeDNI_PE(value as string);

    // Universal
    case InputType.COORDINATES:
      if (typeof value === 'object' && 'lat' in value && 'lon' in value) {
        if (!validateCoordinates(value.lat, value.lon)) {
          throw new Error('Coordenadas inválidas');
        }
        return `${value.lat},${value.lon}`;
      }
      throw new Error('Formato de coordenadas inválido');
    case InputType.ADDRESS:
      return String(value).trim();
    case InputType.NAME:
      return String(value).trim();
    default:
      return String(value);
  }
}

// Detecta país baseado no tipo de input
export function detectCountryFromInputType(type: InputType, explicitCountry?: Country): Country {
  // Se país foi especificado explicitamente, usar ele
  if (explicitCountry) {
    return explicitCountry;
  }

  // Auto-detectar por tipo de documento
  switch (type) {
    case InputType.CNPJ:
    case InputType.CPF:
    case InputType.CAR:
    case InputType.IE:
      return Country.BRAZIL;

    case InputType.RUC:
    case InputType.CI:
      return Country.URUGUAY;

    case InputType.CUIT:
    case InputType.CUIL:
      return Country.ARGENTINA;

    case InputType.RUC_PY:
    case InputType.CI_PY:
      return Country.PARAGUAY;

    case InputType.NIT_BO:
    case InputType.CI_BO:
      return Country.BOLIVIA;

    case InputType.RUT:
      return Country.CHILE;

    case InputType.NIT_CO:
    case InputType.CC_CO:
      return Country.COLOMBIA;

    case InputType.RUC_PE:
    case InputType.DNI_PE:
      return Country.PERU;

    // Para tipos universais, default é Brasil (backwards compatibility)
    case InputType.COORDINATES:
    case InputType.ADDRESS:
    case InputType.NAME:
    default:
      return Country.BRAZIL;
  }
}
