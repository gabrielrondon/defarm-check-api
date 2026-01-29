# Scripts CAR - Guia de Uso

> Como baixar e processar dados do Cadastro Ambiental Rural (CAR)

---

## 📥 Download de Dados

### Estado Individual

Baixar CAR de um estado específico:

```bash
npm run data:car MT    # Mato Grosso
npm run data:car SP    # São Paulo
npm run data:car BA    # Bahia
npm run data:car PA    # Pará
# ... qualquer UF
```

**Saída:** `data/car_mt.json` (ou car_sp.json, car_ba.json, etc.)

**Tempo estimado:** 2-10 minutos por estado (depende do tamanho)

**Volume:**
- Estados pequenos (AC, AP, RR, etc.): ~1-2 MB
- Estados médios (BA, TO, PR, etc.): ~5-10 MB
- Estados grandes (MT, SP, MG, etc.): ~15-30 MB

---

### Todos os Estados

Baixar CAR de **TODOS os 27 estados** do Brasil:

```bash
npm run data:car-all
```

**⚠️ ATENÇÃO:**
- Pode demorar **2-4 HORAS**
- Download de **~10-15 GB** de dados JSON
- Requer conexão estável

**Saída:** 27 arquivos `data/car_*.json`

---

### Apenas Estados Prioritários

Baixar apenas os **10 principais estados** do agronegócio (~90% da produção):

```bash
npm run data:car-all -- --priority
```

**Estados inclusos:** MT, PA, GO, MS, RS, PR, SP, MG, BA, TO

**Tempo estimado:** 30-60 minutos

**Volume:** ~5-7 GB

---

## 💾 Seed no Banco de Dados

### Seed de Um Estado

Fazer seed de um arquivo CAR específico:

```bash
npm run seed:car data/car_mt.json
npm run seed:car data/car_sp.json
# ... qualquer arquivo
```

**O que faz:**
1. DELETE registros do estado no banco (ex: `DELETE FROM car_registrations WHERE state = 'MT'`)
2. Batch INSERT de 100 registros por vez
3. ON CONFLICT: atualiza se CAR já existe

**Tempo estimado:** 1-5 minutos por estado

---

### Seed de Todos os Estados

Fazer seed de **todos os arquivos CAR** encontrados em `data/`:

```bash
npm run seed:car-all
```

**O que faz:**
1. Busca todos os arquivos `car_*.json` em `data/`
2. Faz seed sequencial de cada um
3. Log de progresso e estatísticas

**Tempo estimado:** 30-90 minutos (para 27 estados)

---

## 🔄 Workflow Completo

### Primeira Vez (Setup Inicial)

```bash
# 1. Baixar estados prioritários (recomendado)
npm run data:car-all -- --priority

# 2. Fazer seed no banco
npm run seed:car-all

# 3. Verificar
psql $DATABASE_URL -c "SELECT state, COUNT(*) FROM car_registrations GROUP BY state ORDER BY state;"
```

---

### Atualização Mensal

```bash
# 1. Baixar estados atualizados (pode baixar só alguns)
npm run data:car MT
npm run data:car PA
npm run data:car GO

# 2. Seed (atualiza registros existentes)
npm run seed:car data/car_mt.json
npm run seed:car data/car_pa.json
npm run seed:car data/car_go.json
```

**Ou tudo de uma vez:**

```bash
npm run data:car-all -- --priority && npm run seed:car-all
```

---

## 📊 Monitoramento

### Verificar Status do Banco

```sql
-- Total de registros por estado
SELECT state, COUNT(*) as total, SUM(area_ha) as area_total_ha
FROM car_registrations
GROUP BY state
ORDER BY total DESC;

-- Status dos CARs
SELECT status, COUNT(*) as total
FROM car_registrations
GROUP BY status;

-- Estados cobertos
SELECT DISTINCT state FROM car_registrations ORDER BY state;
```

---

## 🚨 Troubleshooting

### "No CAR registrations found"

**Causa:** Estado pode não ter dados no SICAR ou layer incorreto

**Solução:**
1. Verificar se UF existe: `AC, AL, AM, AP, BA, CE, DF, ES, GO, MA, MG, MS, MT, PA, PB, PE, PI, PR, RJ, RN, RO, RR, RS, SC, SE, SP, TO`
2. Checar logs para erros de conexão
3. Tentar novamente (pode ser timeout)

---

### "WFS request failed: 500"

**Causa:** GeoServer do SICAR pode estar sobrecarregado

**Solução:**
1. Aguardar alguns minutos
2. Tentar novamente
3. Baixar estados individualmente (menos carga)

---

### "Batch insert failed"

**Causa:** Geometrias muito grandes ou SQL inválido

**Solução:**
1. Verificar se arquivo JSON está correto
2. Checar PostgreSQL logs
3. Reduzir batch size em `seed-car.ts` (de 100 para 50)

---

## 📝 Notas Importantes

1. **Limite WFS:** 10.000 features por request
   - Estados grandes (MT, SP, MG) podem retornar menos registros
   - TODO: Implementar paginação para cobertura completa

2. **ON CONFLICT:** Seed usa `car_number` como chave única
   - Se CAR já existe, atualiza status/dados
   - Permite atualizações incrementais

3. **Delay entre requests:** 2 segundos
   - Evita sobrecarregar GeoServer do SICAR
   - Pode aumentar se houver erros 429 (rate limit)

4. **Validação de geometrias:**
   - Script valida WKT antes de inserir
   - Geometrias inválidas são logadas mas não bloqueiam o processo

---

## 📚 Próximos Passos

Após completar o setup:

1. **Testar API:**
   ```bash
   curl -X POST http://localhost:3000/check \
     -H "Content-Type: application/json" \
     -H "X-API-Key: $API_KEY" \
     -d '{"type":"COORDINATES","value":{"lat":-15.123,"lon":-56.456}}'
   ```

2. **Configurar Cron Jobs:** Ver Task #16
3. **Configurar Alertas Telegram:** Ver Task #17
4. **Documentação Comercial:** Ver Task #20
