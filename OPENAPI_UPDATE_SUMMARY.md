# OpenAPI Update Summary - CAR Endpoints

## ✅ Atualizações Realizadas no openapi.yaml

### 1. Nova Tag Adicionada

```yaml
tags:
  - name: car
    description: CAR (Cadastro Ambiental Rural) geometry queries
```

### 2. Três Novos Endpoints Documentados

#### GET /car/{carNumber}
- **Descrição:** Retorna dados de um registro CAR incluindo metadados e geometria do polígono
- **Parâmetros:**
  - `carNumber` (path, required): Número do registro CAR
  - `includeGeometry` (query, optional, default: true): Incluir geometria do polígono
- **Response:** Schema `CARRegistration`
- **Security:** Nenhuma (público)

#### GET /car/{carNumber}/geojson
- **Descrição:** Retorna registro CAR como GeoJSON Feature completo
- **Parâmetros:**
  - `carNumber` (path, required): Número do registro CAR
- **Response:** GeoJSON Feature (type, properties, geometry)
- **Security:** Nenhuma (público)

#### POST /car/batch
- **Descrição:** Consulta múltiplos registros CAR de uma vez (até 100)
- **Body:**
  - `carNumbers` (array, required, max 100): Array de números CAR
  - `includeGeometry` (boolean, optional, default: false): Incluir geometrias
- **Response:** Object com count, requested, cars[]
- **Security:** Nenhuma (público)

### 3. Novo Schema Adicionado

```yaml
CARRegistration:
  type: object
  required:
    - carNumber
    - state
  properties:
    carNumber: string
    status: enum [AT, PE, CA, SU]
    ownerDocument: string (nullable)
    ownerName: string (nullable)
    propertyName: string (nullable)
    areaHa: integer (nullable)
    state: string
    municipality: string (nullable)
    source: string
    createdAt: date-time
    geometry: object (nullable, GeoJSON MultiPolygon)
```

## 📊 Estatísticas

- **Linhas adicionadas:** ~280 linhas
- **Novos endpoints:** 3
- **Novos schemas:** 1
- **Nova tag:** 1

## 🔍 Validação

- ✅ Build TypeScript passou sem erros
- ✅ Sintaxe YAML válida
- ✅ Schemas referenciados corretamente
- ✅ Documentação completa com descrições e exemplos

## 📚 Estrutura do openapi.yaml Atualizado

```
openapi.yaml
├── info (atualizado - versão 2.1.0)
├── servers
├── tags (+ nova tag "car")
├── security
├── paths
│   ├── /check
│   ├── /sources
│   ├── /health
│   ├── /samples/*
│   ├── /car/{carNumber} ⭐ NOVO
│   ├── /car/{carNumber}/geojson ⭐ NOVO
│   └── /car/batch ⭐ NOVO
└── components
    ├── securitySchemes
    └── schemas
        ├── CheckRequest
        ├── CheckResponse
        ├── ...
        ├── CARSample
        └── CARRegistration ⭐ NOVO
```

## 🚀 Como Usar

### 1. Visualizar no Swagger UI

Inicie a API e acesse:
```
http://localhost:3000/docs
```

Os novos endpoints CAR aparecerão na seção **car** do Swagger UI.

### 2. Testar com Swagger UI

1. Expanda o endpoint `/car/{carNumber}`
2. Clique em "Try it out"
3. Digite um CAR number (ex: `AC-1200013-XXXXXXXX`)
4. Clique em "Execute"
5. Veja a resposta com metadados + geometria

### 3. Exemplo de Request (curl)

```bash
# GET com geometria
curl http://localhost:3000/car/AC-1200013-XXXXXXXX

# GET sem geometria
curl "http://localhost:3000/car/AC-1200013-XXXXXXXX?includeGeometry=false"

# GeoJSON Feature
curl http://localhost:3000/car/AC-1200013-XXXXXXXX/geojson

# Batch
curl -X POST http://localhost:3000/car/batch \
  -H "Content-Type: application/json" \
  -d '{"carNumbers": ["AC-1200013-X", "MT-5100048-Y"], "includeGeometry": false}'
```

## 📝 Próximos Passos

1. ✅ Implementação dos endpoints (concluída)
2. ✅ Documentação OpenAPI (concluída)
3. ✅ Build TypeScript validado (concluído)
4. 🔄 Testes manuais via Swagger UI (recomendado)
5. 🔄 Deploy para produção (quando pronto)

## 🔗 Arquivos Relacionados

- **OpenAPI Spec:** `openapi.yaml` (atualizado)
- **Implementação:** `src/api/routes/car.ts`
- **Documentação Completa:** `docs/CAR_ENDPOINTS.md`
- **Exemplos de Uso:** `examples/car-geometry-example.js`
- **Teste Script:** `test-car-endpoints.sh`

---

**Status:** ✅ OpenAPI totalmente atualizado e validado
