#!/bin/bash

# Script para testar a Check API

API_URL="http://localhost:3000"

echo "========================================"
echo "Check API - Testes"
echo "========================================"
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Health Check
echo -e "${YELLOW}1. Health Check${NC}"
curl -s "$API_URL/health" | jq '.'
echo ""
echo ""

# 2. Listar sources
echo -e "${YELLOW}2. Listar Sources${NC}"
curl -s "$API_URL/sources" | jq '.'
echo ""
echo ""

# 3. Check CNPJ válido (PASS)
echo -e "${YELLOW}3. Check CNPJ Válido (PASS)${NC}"
curl -s -X POST "$API_URL/check" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "00.000.000/0001-00"
    }
  }' | jq '.'
echo ""
echo ""

# 4. Check CNPJ com problemas (FAIL)
echo -e "${YELLOW}4. Check CNPJ com Problemas (FAIL)${NC}"
curl -s -X POST "$API_URL/check" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12.345.678/0001-90"
    }
  }' | jq '.'
echo ""
echo ""

# 5. Check Coordenadas com desmatamento
echo -e "${YELLOW}5. Check Coordenadas (Desmatamento)${NC}"
curl -s -X POST "$API_URL/check" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "COORDINATES",
      "value": {
        "lat": -10.5,
        "lon": -55.2
      }
    }
  }' | jq '.'
echo ""
echo ""

# 6. Check CPF (mock)
echo -e "${YELLOW}6. Check CPF${NC}"
curl -s -X POST "$API_URL/check" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CPF",
      "value": "123.456.789-00"
    }
  }' | jq '.'
echo ""
echo ""

# 7. Check com cache (segunda vez)
echo -e "${YELLOW}7. Check com Cache (mesma query)${NC}"
echo "Primeira execução:"
curl -s -X POST "$API_URL/check" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "00.000.000/0001-00"
    }
  }' | jq '.metadata.cacheHitRate, .sources[0].cached'

echo ""
echo "Segunda execução (cache hit esperado):"
curl -s -X POST "$API_URL/check" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "00.000.000/0001-00"
    }
  }' | jq '.metadata.cacheHitRate, .sources[0].cached'

echo ""
echo ""
echo -e "${GREEN}Testes completos!${NC}"
