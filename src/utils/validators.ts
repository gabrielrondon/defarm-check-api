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

    // Para tipos universais, default é Brasil (backwards compatibility)
    case InputType.COORDINATES:
    case InputType.ADDRESS:
    case InputType.NAME:
    default:
      return Country.BRAZIL;
  }
}
