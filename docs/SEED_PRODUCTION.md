# Guia: Popular Banco de Dados de Produção

Este guia explica como popular o banco de dados de produção com todos os dados das fontes.

## 📋 Pré-requisitos

Antes de começar, certifique-se de ter:

1. ✅ Todos os arquivos de dados baixados na pasta `data/`:
   - `lista_suja.json`
   - `ibama_embargos.json`
   - `prodes_sample.json`
   - `terras_indigenas.json`

2. ✅ DATABASE_URL de produção configurada

3. ✅ Banco de dados criado e migrations rodadas

## 🚀 Como Popular - Passo a Passo

### Opção 1: Script Automatizado (Recomendado)

Use o script que roda todos os seeds em sequência:

```bash
# 1. Configure a DATABASE_URL de produção
export DATABASE_URL="postgresql://user:password@host:5432/database"

# 2. Execute o script de seed
npm run seed:all-production
```

O script irá:
- ✅ Mostrar qual banco será usado
- ✅ Pedir confirmação antes de começar
- ✅ Executar todos os seeds em ordem
- ✅ Mostrar progresso e tempo de cada etapa
- ✅ Exibir resumo final

**Seeds executados:**
1. Checker Sources (fontes de checkers)
2. Lista Suja (678 registros)
3. IBAMA Embargoes (65,953 documentos)
4. PRODES Sample (5 registros)
5. Terras Indígenas (dados FUNAI)

### Opção 2: Seeds Individuais

Se preferir rodar um seed específico:

```bash
# Configurar DATABASE_URL
export DATABASE_URL="postgresql://user:password@host:5432/database"

# Fontes de checkers (OBRIGATÓRIO - rodar primeiro!)
npm run db:seed

# Lista Suja
npm run seed:lista-suja-simple

# IBAMA
npm run seed:ibama-simple

# PRODES
npm run data:prodes

# Terras Indígenas
npm run seed:terras-indigenas data/terras_indigenas.json
```

## ⚠️ ATENÇÃO

- 🔴 **Os scripts fazem TRUNCATE nas tabelas antes de popular!**
- 🔴 **Todos os dados existentes serão removidos!**
- 🔴 **Sempre confirme a DATABASE_URL antes de executar!**

## 🎯 Verificar se Funcionou

Após popular os dados, verifique:

### 1. Via API

```bash
# Health check
curl https://sua-api.com/health

# Listar fontes
curl https://sua-api.com/sources \
  -H "X-API-Key: sua_api_key"

# Fazer um check de teste
curl -X POST https://sua-api.com/check \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sua_api_key" \
  -d '{
    "input": {
      "type": "CNPJ",
      "value": "12345678000190"
    }
  }'
```

### 2. Via Banco de Dados

```sql
-- Verificar contadores
SELECT 'lista_suja' as table, COUNT(*) as count FROM lista_suja
UNION ALL
SELECT 'ibama_embargoes', COUNT(*) FROM ibama_embargoes
UNION ALL
SELECT 'prodes_sample', COUNT(*) FROM prodes_sample
UNION ALL
SELECT 'terras_indigenas', COUNT(*) FROM terras_indigenas
UNION ALL
SELECT 'checker_sources', COUNT(*) FROM checker_sources;
```

**Contagens esperadas:**
- `lista_suja`: ~678 registros
- `ibama_embargoes`: ~65,953 registros
- `prodes_sample`: 5 registros
- `terras_indigenas`: ~574 registros
- `checker_sources`: 4 registros

## 📝 Logs

Os logs de cada seed são exibidos no console com:
- ✅ Progresso em tempo real
- ✅ Contadores de inserção
- ✅ Tempo de execução
- ✅ Erros detalhados (se houver)

## 🔧 Troubleshooting

### Erro: "DATABASE_URL não está definida"

```bash
# Verifique se a variável está setada
echo $DATABASE_URL

# Se não estiver, exporte novamente
export DATABASE_URL="postgresql://..."
```

### Erro: Timeout na conexão

- Verifique se o banco está acessível
- Confira firewall/security groups
- Teste conexão: `psql $DATABASE_URL`

### Erro: Tabela não existe

```bash
# Rode as migrations primeiro
npm run db:migrate
```

### Seed muito lento

- Normal para grandes volumes (IBAMA, Terras Indígenas)
- IBAMA: ~5-10 minutos
- Terras Indígenas: ~10-20 minutos (geometrias grandes)

### Erro em geometria (Terras Indígenas)

- Verifique se PostGIS está instalado
- Verifique extensão: `CREATE EXTENSION IF NOT EXISTS postgis;`

## 📊 Estimativa de Tempo

| Seed | Tempo Estimado |
|------|----------------|
| Checker Sources | < 5 segundos |
| Lista Suja | ~30 segundos |
| IBAMA | ~5-10 minutos |
| PRODES Sample | < 5 segundos |
| Terras Indígenas | ~10-20 minutos |
| **TOTAL** | **~15-30 minutos** |

## 🔄 Atualizar Dados

Para atualizar os dados no futuro:

```bash
# 1. Baixar dados atualizados
npm run data:lista-suja
npm run data:ibama
npm run data:funai-terras-indigenas

# 2. Rodar seeds novamente
npm run seed:all-production
```

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs completos
2. Confira que todas as dependências estão instaladas
3. Valide a estrutura do banco (migrations)
4. Abra uma issue com os logs de erro
