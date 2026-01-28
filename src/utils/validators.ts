import { InputType } from '../types/input.js';

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

// Valida coordenadas
export function validateCoordinates(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// Normaliza input baseado no tipo
export function normalizeInput(type: InputType, value: any): string {
  switch (type) {
    case InputType.CNPJ:
      return normalizeCNPJ(value as string);
    case InputType.CPF:
      return normalizeCPF(value as string);
    case InputType.CAR:
      return normalizeCAR(value as string);
    case InputType.IE:
      return normalizeIE(value as string);
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
    default:
      return String(value);
  }
}
