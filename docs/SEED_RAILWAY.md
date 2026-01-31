# Popular Banco de Dados no Railway

Guia rápido para popular o banco de dados PostgreSQL no Railway com todos os dados.

## 🎯 Opções para Popular

### Opção 1: Via Railway CLI (Recomendado)

```bash
# 1. Instalar Railway CLI (se não tiver)
npm install -g @railway/cli

# 2. Login no Railway
railway login

# 3. Linkar ao projeto
railway link

# 4. Rodar o seed usando a DATABASE_URL do Railway
railway run npm run seed:all-production
```

O comando `railway run` automaticamente:
- ✅ Injeta todas as variáveis de ambiente do Railway
- ✅ Conecta ao banco de produção
- ✅ Usa as credenciais corretas

### Opção 2: Localmente com DATABASE_URL Manual

```bash
# 1. Copiar DATABASE_URL do Railway
# Vá em: Railway > Seu Projeto > caboose (PostgreSQL) > Connect > Copy URL

# 2. Exportar localmente
export DATABASE_URL="postgresql://postgres:password@caboose.proxy.rlwy.net:18740/railway"

# 3. Rodar seed
npm run seed:all-production
```

### Opção 3: Via Script One-Time no Railway

```bash
# Criar um serviço temporário para rodar o seed
railway run bash -c "npm install && npm run seed:all-production"
```

## 📋 Passo a Passo Completo

### 1. Preparar Dados Localmente

Primeiro, certifique-se de ter todos os arquivos de dados:

```bash
# Verificar arquivos existentes
ls -lh data/

# Deve ter:
# - lista_suja.json (230KB)
# - ibama_embargos.json (48MB)
# - prodes_sample.json (433B)
# - terras_indigenas.json (44MB)

# Se faltar algum, baixar:
npm run data:lista-suja          # Lista Suja
npm run data:ibama               # IBAMA
npm run data:prodes              # PRODES
npm run data:funai-terras-indigenas  # Terras Indígenas
```

### 2. Fazer Upload dos Dados (Opcional)

Se estiver rodando no servidor Railway:

```bash
# Via Railway CLI
railway up data/
```

### 3. Executar Seeds

```bash
# Via Railway CLI (RECOMENDADO)
railway run npm run seed:all-production

# O script irá pedir confirmação
# Digite "sim" para confirmar
```

### 4. Monitorar Progresso

O seed mostrará:
```
🚨 SEED DE PRODUÇÃO - ATENÇÃO 🚨

📊 Banco de dados: caboose.proxy.rlwy.net
🔗 URL: postgresql://postgres:***@caboose.proxy.rlwy.net:18740/railway

🌍 Você está rodando em PRODUÇÃO!

📋 Seeds que serão executados:

  1. Checker Sources
     Popula tabela de fontes de checkers

  2. Lista Suja
     Popula Lista Suja do Trabalho Escravo (678 registros)

  3. IBAMA Embargoes
     Popula embargos do IBAMA (65,953 documentos)

  4. PRODES Sample
     Popula amostras do PRODES (5 registros)

  5. Terras Indígenas
     Popula Terras Indígenas da FUNAI

⚠️  ATENÇÃO: As tabelas serão TRUNCADAS antes do seed!

Deseja continuar? (digite "sim" para confirmar): sim

🚀 Iniciando seed de produção...

[1/5] 🔄 Checker Sources...
    ✅ Checker Sources concluído em 2.3s

[2/5] 🔄 Lista Suja...
    ✅ Lista Suja concluído em 45.2s

...
```

## ⏱️ Tempo Estimado

| Etapa | Tempo Esperado |
|-------|----------------|
| Checker Sources | ~5s |
| Lista Suja | ~30-60s |
| IBAMA | ~5-15 min |
| PRODES Sample | ~5s |
| Terras Indígenas | ~15-30 min |
| **TOTAL** | **~20-45 min** |

## ✅ Verificar se Funcionou

### Via API

```bash
# Health check
curl https://defarm-check-api-production.up.railway.app/health

# Listar fontes (precisa de API Key)
curl https://defarm-check-api-production.up.railway.app/sources \
  -H "X-API-Key: YOUR_API_KEY"
```

### Via Railway Database

```bash
# Conectar ao banco via Railway CLI
railway connect caboose

# Dentro do psql:
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
```
       table        | count
--------------------+--------
 lista_suja         |    678
 ibama_embargoes    | 65,953
 prodes_sample      |      5
 terras_indigenas   |    574
 checker_sources    |      4
```

## 🔧 Troubleshooting

### Railway CLI não encontrado

```bash
# Instalar globalmente
npm install -g @railway/cli

# Ou usar via npx
npx @railway/cli run npm run seed:all-production
```

### Não consegue conectar ao banco

```bash
# Verificar se o serviço está ativo
railway status

# Ver logs
railway logs
```

### Timeout durante seed

- Normal para seeds grandes (IBAMA, Terras Indígenas)
- O Railway pode ter timeout de 30 minutos
- Se der timeout, rode os seeds individuais:

```bash
railway run npm run db:seed                    # Sources
railway run npm run seed:lista-suja-simple     # Lista Suja
railway run npm run seed:ibama-simple          # IBAMA
railway run npm run data:prodes                # PRODES
railway run npm run seed:terras-indigenas data/terras_indigenas.json  # Terras
```

### Arquivo de dados não encontrado

- Certifique-se de que os arquivos estão na pasta `data/`
- Faça upload: `railway up data/`
- Ou baixe novamente: `npm run data:all`

## 🚀 Após Popular

1. ✅ Verificar API: `/sources` deve retornar 4+ fontes
2. ✅ Fazer um check de teste: `POST /check`
3. ✅ Verificar logs: `railway logs`
4. ✅ Monitorar performance no Railway dashboard

## 📝 Manutenção

Para atualizar dados no futuro:

```bash
# 1. Baixar dados atualizados
npm run data:lista-suja
npm run data:ibama
npm run data:funai-terras-indigenas

# 2. Re-seed via Railway
railway run npm run seed:all-production
```

## 🔐 Segurança

- ⚠️ Nunca commite arquivos `.env` com credenciais reais
- ⚠️ Use Railway CLI quando possível (injeta vars automaticamente)
- ⚠️ Sempre confirme a DATABASE_URL antes de rodar seeds
- ⚠️ Faça backup antes de truncar tabelas em produção

## 📞 Suporte

- Railway Docs: https://docs.railway.app
- Railway CLI: https://docs.railway.app/develop/cli
- Logs: `railway logs --tail`
