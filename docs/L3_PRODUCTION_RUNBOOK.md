# L3 Production Runbook

## 1) Pré-requisitos
- `DATABASE_URL` configurado no serviço.
- Build da API já publicado contendo:
  - migration `0021_l3_trend_snapshots.sql`
  - job `updateL3Trends`
  - rota `GET /insights/l3`

## 2) Aplicar migration
Opção padrão:
```bash
npm run db:migrate
```

Fallback (manual):
```bash
psql "$DATABASE_URL" -f src/db/migrations/0021_l3_trend_snapshots.sql
```

## 3) Bootstrap inicial dos snapshots
Executar uma vez:
```bash
npx tsx -e "import { updateL3Trends } from './src/worker/jobs/update-l3-trends.ts'; updateL3Trends().then(()=>process.exit(0))"
```

## 4) Verificação
```bash
curl -s "$API_URL/insights/l3?limit=5"
curl -s "$API_URL/insights/l3?country=BR&horizon=30&limit=1"
curl -s "$API_URL/insights/l3/portfolio?country=BR&horizon=30"
curl -s "$API_URL/insights/l3/audit-queue?country=BR&limit=10"
```

## 5) Monitoramento contínuo
- `GET /health` deve incluir `l3Status`.
- Job `L3 Trend Snapshots` roda diariamente (`08:30 BRT`).
- Alerta Telegram dispara quando snapshots ficam vazios por `L3_EMPTY_SNAPSHOT_ALERT_DAYS`.

## 6) Troubleshooting rápido
- `no such table l3_trend_snapshots`: migration não aplicada.
- `UNKNOWN` em excesso: histórico insuficiente para comparar janela anterior.
- snapshots vazios recorrentes: verificar volume de `check_requests` por país/horizonte.
