# Worker Service + Telegram - Setup Completo

> Sistema de atualização automática rodando na Railway com notificações Telegram

**Última atualização:** Janeiro 2026

---

## 📋 Visão Geral

O **Worker Service** é um processo separado da API que roda 24/7 na Railway executando cron jobs automáticos e enviando notificações via Telegram.

**Arquitetura:**
```
Railway
├── API Service (Fastify)  → Porta 3000, responde requests HTTP
└── Worker Service (Node-Cron) → Background jobs + Telegram notifications
```

**Benefícios:**
- ✅ Roda 24/7 (não depende do seu computador)
- ✅ Escalável e confiável
- ✅ Logs centralizados no Railway
- ✅ Notificações instant⬢neas via Telegram
- ✅ Auto-restart em caso de falha

---

## 🤖 Criar Bot do Telegram

### 1. Falar com o BotFather

1. Abrir Telegram e procurar: **@BotFather**
2. Enviar: `/newbot`
3. Escolher nome: `DeFarm Check Bot`
4. Escolher username: `defarm_check_bot` (ou similar)

**BotFather vai responder com:**
```
Done! Congratulations on your new bot...
Use this token to access the HTTP API:
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

⚠️ **Guardar esse token!** É seu `TELEGRAM_BOT_TOKEN`

### 2. Criar Canal/Grupo (Opcional)

**Opção A: Enviar notificações só para você**
- Simplesmente inicie conversa com o bot
- Pegue seu chat_id (próximo passo)

**Opção B: Canal privado (recomendado para time)**
1. Criar canal privado no Telegram: `DeFarm Check Alerts`
2. Adicionar o bot como administrador do canal
3. Enviar uma mensagem qualquer no canal
4. Pegue o chat_id do canal (próximo passo)

### 3. Obter Chat ID

**Método 1: Via API (mais fácil)**

```bash
# Substituir BOT_TOKEN pelo token do BotFather
curl "https://api.telegram.org/botBOT_TOKEN/getUpdates"
```

**Resposta (procure por chat.id):**
```json
{
  "result": [
    {
      "update_id": 12345,
      "message": {
        "chat": {
          "id": -1001234567890,  ← ESTE É O CHAT_ID
          "title": "DeFarm Check Alerts",
          "type": "channel"
        }
      }
    }
  ]
}
```

**Método 2: Via bot auxiliar**
1. Adicionar `@userinfobot` ao seu canal/grupo
2. Ele vai informar o chat_id

---

## ⚙️ Configurar Variáveis de Ambiente

### Railway - API Service

Já configurado (não precisa mudar):
```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
PORT=3000
```

### Railway - Worker Service (NOVO)

Adicionar essas variáveis no Worker Service:

```env
# Database (mesma do API Service)
DATABASE_URL=postgresql://...

# Telegram (NOVAS)
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890

# Node Environment
NODE_ENV=production
TZ=America/Sao_Paulo
```

**⚠️ Importante:**
- `TELEGRAM_BOT_TOKEN`: Token do BotFather
- `TELEGRAM_CHAT_ID`: ID do canal/chat (pode ser negativo)
- `TZ`: Timezone para cron jobs (horário de Brasília)

---

## 🚀 Deploy na Railway

### Opção 1: Via Procfile (Recomendado)

Railway detecta automaticamente o `Procfile` e cria 2 serviços:

1. **Deploy o projeto normalmente**
   - Railway vai ler `Procfile`
   - Criar 2 processos: `web` (API) e `worker` (cron jobs)

2. **Verificar no Dashboard**
   - Você verá 2 serviços separados:
     - `check-api-web` (API)
     - `check-api-worker` (Background jobs)

### Opção 2: Criar Worker Manualmente

Se Railway não criou automaticamente:

1. **Dashboard Railway → New Service**
2. **Link ao mesmo repositório GitHub**
3. **Settings → Configure:**
   - Name: `check-api-worker`
   - Start Command: `npm run worker`
   - Add variáveis: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

---

## ✅ Testar

### 1. Verificar Worker está rodando

**Railway Dashboard → Worker Service → Logs**

Você deve ver:
```
🤖 Worker Service Starting...
Testing Telegram connection...
✅ Worker Service Started Successfully
Scheduled jobs: 6
```

### 2. Verificar Telegram

Você deve receber mensagem no Telegram:
```
✅ Telegram Bot Conectado!

Bot de notificações da Check API está ativo.
Você receberá alertas sobre:
  • Execução de jobs
  • Novidades detectadas
  • Falhas e erros
  • Health checks
  • Resumos diários/semanais
```

### 3. Testar Job Manualmente (Local)

```bash
# Testar localmente com suas credenciais
export TELEGRAM_BOT_TOKEN="seu_token"
export TELEGRAM_CHAT_ID="seu_chat_id"

# Rodar worker localmente
npm run dev:worker

# Ou testar job individual
tsx src/worker/jobs/check-data-freshness.ts
```

---

## 📅 Cronograma de Jobs

| Job | Horário | Frequência | O que faz |
|-----|---------|-----------|-----------|
| **DETER** | 03:00 | Diária | Download alertas últimos 7 dias |
| **Lista Suja** | 02:00 (dia 1) | Mensal | Detecta novos/removidos |
| **IBAMA** | 02:00 (Dom) | Semanal | Download 155MB CSV |
| **TIs + UCs** | 04:00 (dia 1) | Mensal | FUNAI + ICMBio |
| **CAR** | 03:00 (dia 15) | Mensal | Estados prioritários |
| **Health Check** | 08:00 | Diária | Verifica freshness |

**Timezone:** America/Sao_Paulo (Horário de Brasília)

---

## 📱 Notificações Telegram

### O que você recebe:

**Início de Job:**
```
🤖 DETER Alerts iniciado
⏰ 29/01/2026 03:00:15
```

**Sucesso:**
```
✅ DETER Alerts completado com sucesso
⏱️ Duração: 127s

📊 Estatísticas:
  • newAlerts: 45
  • criticalAlerts: 2
```

**Falha:**
```
❌ Lista Suja FALHOU

🔴 Erro: Network timeout
⏰ 29/01/2026 02:15:33

⚠️ Ação necessária: verificar logs
```

**Novidades na Lista Suja:**
```
📋 Lista Suja - Atualização

🔴 3 novos empregadores adicionados

Exemplos:
  • Fazenda ABC Ltda
  • Empresa XYZ SA
  • João da Silva
```

**Alertas DETER Críticos:**
```
🚨 DETER - Alertas CRÍTICOS

📍 Estado: PA
🔥 Novos alertas: 12
📐 Área desmatada: 1,234 ha
⏰ Últimas 24h

⚠️ Desmatamento ativo detectado!
```

**Dados Obsoletos:**
```
⚠️ Dados Obsoletos Detectados

📦 Fonte: IBAMA Embargoes
📅 Idade: 15 dias
⏰ SLA máximo: 10 dias

⚠️ Atualização necessária!
```

---

## 🔍 Monitoramento

### Logs do Worker

**Railway Dashboard → Worker Service → Logs**

Ver logs em tempo real de todos os jobs.

### Métricas

**Ver próximas execuções:**
```
Worker running... Press Ctrl+C to stop
Scheduled jobs: 6
  - DETER Alerts: 0 3 * * *
  - Lista Suja: 0 2 1 * *
  - IBAMA Embargoes: 0 2 * * 0
  - ...
```

### Restart Manual

Se necessário forçar re-execução:

**Railway Dashboard → Worker Service → Restart**

---

## 🚨 Troubleshooting

### "Telegram not configured"

**Erro nos logs:**
```
Telegram credentials not configured. Notifications will be skipped.
```

**Solução:**
1. Verificar variáveis no Railway: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
2. Restart worker service
3. Verificar logs novamente

---

### "Failed to send Telegram message"

**Possíveis causas:**
1. **Bot token inválido**: Criar novo bot com BotFather
2. **Chat ID errado**: Re-obter com `/getUpdates`
3. **Bot não foi adicionado ao canal**: Adicionar como admin

**Solução:**
```bash
# Testar token e chat_id manualmente
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID" \
  -d "text=Test message"
```

---

### Worker crashando

**Ver logs no Railway:**
```
Uncaught exception: Cannot find module...
```

**Solução comum:**
1. Verificar se `npm run build` está gerando `dist/worker/index.js`
2. Verificar variáveis de ambiente (DATABASE_URL, etc.)
3. Restart worker

---

## 📊 Estatísticas (Futuro)

**Próximas features:**

- [ ] Dashboard web de métricas
- [ ] Gráficos de freshness ao longo do tempo
- [ ] Histórico de execuções
- [ ] Comandos Telegram interativos (`/status`, `/run job_name`)
- [ ] Retry automático com backoff exponencial

---

## ✅ Checklist de Setup

- [ ] Criar bot no Telegram (BotFather)
- [ ] Obter `TELEGRAM_BOT_TOKEN`
- [ ] Criar canal/grupo (opcional)
- [ ] Obter `TELEGRAM_CHAT_ID`
- [ ] Adicionar variáveis no Railway Worker Service
- [ ] Deploy via Procfile ou criar Worker Service manualmente
- [ ] Verificar logs: "Worker Service Started Successfully"
- [ ] Receber mensagem teste no Telegram
- [ ] Aguardar próximo job executar (ou restart para testar)
- [ ] Confirmar notificações chegando

---

## 🎉 Pronto!

Seu sistema está rodando 24/7 com notificações Telegram de tudo!

**Próximos passos:**
- Monitorar logs nos primeiros dias
- Ajustar horários se necessário (editar `src/worker/scheduler.ts`)
- Adicionar mais alertas customizados conforme necessário
