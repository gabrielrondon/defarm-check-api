import { describe, it, expect } from 'vitest';
import {
  normalizeRUC,
  normalizeCI,
  detectCountryFromInputType
} from '../src/utils/validators.js';
import { InputType, Country } from '../src/types/input.js';

describe('Uruguay Validators', () => {
  describe('normalizeRUC', () => {
    it('should normalize valid 12-digit RUC', () => {
      const result = normalizeRUC('220123456789');
      expect(result).toBe('220123456789');
    });

    it('should normalize RUC with formatting', () => {
      const result = normalizeRUC('22-012345-6789');
      expect(result).toBe('220123456789');
    });

    it('should throw error for invalid RUC length', () => {
      expect(() => normalizeRUC('12345')).toThrow('RUC inválido: deve ter 12 dígitos');
    });

    it('should throw error for RUC with letters', () => {
      expect(() => normalizeRUC('22012345678A')).toThrow('RUC inválido: deve ter 12 dígitos');
    });
  });

  describe('normalizeCI', () => {
    it('should normalize valid 8-digit CI with valid check digit', () => {
      // Example: 1.234.567-8 (need to calculate actual valid CI)
      // Using algorithm: multiply by [2,9,8,7,6,3,4], check = 10 - (sum % 10)
      // 1*2 + 2*9 + 3*8 + 4*7 + 5*6 + 6*3 + 7*4 = 2+18+24+28+30+18+28 = 148
      // check = 10 - (148 % 10) = 10 - 8 = 2
      const result = normalizeCI('1.234.567-2');
      expect(result).toBe('12345672');
    });

    it('should normalize CI without formatting', () => {
      const result = normalizeCI('12345672');
      expect(result).toBe('12345672');
    });

    it('should throw error for invalid CI length', () => {
      expect(() => normalizeCI('123')).toThrow('CI inválida: deve ter 7 ou 8 dígitos');
    });

    it('should throw error for invalid check digit', () => {
      // 1234567-9 is invalid (correct should be 2)
      expect(() => normalizeCI('1234567-9')).toThrow('CI inválida: dígito verificador incorreto');
    });

    it('should handle 7-digit CI (with leading zero)', () => {
      // 0.123.456-7 -> calculate valid check digit
      // 0*2 + 1*9 + 2*8 + 3*7 + 4*6 + 5*3 + 6*4 = 0+9+16+21+24+15+24 = 109
      // check = 10 - (109 % 10) = 10 - 9 = 1
      const result = normalizeCI('123.456-1');
      expect(result).toBe('1234561');
    });
  });

  describe('detectCountryFromInputType', () => {
    it('should detect Brazil for CNPJ', () => {
      const country = detectCountryFromInputType(InputType.CNPJ);
      expect(country).toBe(Country.BRAZIL);
    });

    it('should detect Brazil for CPF', () => {
      const country = detectCountryFromInputType(InputType.CPF);
      expect(country).toBe(Country.BRAZIL);
    });

    it('should detect Uruguay for RUC', () => {
      const country = detectCountryFromInputType(InputType.RUC);
      expect(country).toBe(Country.URUGUAY);
    });

    it('should detect Uruguay for CI', () => {
      const country = detectCountryFromInputType(InputType.CI);
      expect(country).toBe(Country.URUGUAY);
    });

    it('should use explicit country if provided', () => {
      const country = detectCountryFromInputType(InputType.COORDINATES, Country.URUGUAY);
      expect(country).toBe(Country.URUGUAY);
    });

    it('should default to Brazil for universal types', () => {
      const country = detectCountryFromInputType(InputType.COORDINATES);
      expect(country).toBe(Country.BRAZIL);
    });

    it('should default to Brazil for ADDRESS type', () => {
      const country = detectCountryFromInputType(InputType.ADDRESS);
      expect(country).toBe(Country.BRAZIL);
    });
  });
});
