# Launch Readiness

## Objective
Define an explicit GO/NO-GO gate for release focused on source coverage, interpretation quality, and stable API output.

## Gate 1: Source availability
- `GET /sources` must return non-empty catalog.
- `GET /samples/all` must include all expected keys:
  - `listaSuja`, `ibama`, `terrasIndigenas`, `unidadesConservacao`, `deter`, `car`, `prodes`, `snap`, `dicose`
- At least 3 sample groups must have a valid `testUrl` at any moment.

Command:
```bash
npm run test:smoke:launch
```

## Gate 2: Interpretation/output contract
- For authenticated `/check` smoke runs:
  - response must include `sources[]`
  - at least one source must be `sourceType: "direct"`
- `GET /insights/derived-rules` must return an array (can be empty in cold-start periods).

How to enforce auth checks:
```bash
REQUIRE_AUTH_SMOKE=true PRODUCTION_API_KEY=ck_xxx npm run test:smoke:launch
```

## Gate 3: Post-deploy automated smoke
- Workflow: `.github/workflows/production-smoke.yml`
- Triggers:
  - after successful `Check API CI` on `main`
  - hourly schedule
  - manual dispatch
- On failure, sends Telegram notification when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured.

Required repo secrets:
- `PRODUCTION_API_BASE_URL`
- `PRODUCTION_API_KEY` (optional for now, required when `REQUIRE_AUTH_SMOKE=true`)
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (optional but recommended)

## Gate 4: Incident and rollback
1. Confirm blast radius:
   - `GET /health`
   - latest smoke workflow run
2. Roll back application on Railway to previous stable deployment.
3. Re-run production smoke manually (`workflow_dispatch`).
4. If still failing, set launch status to `NO-GO` and keep previous stable version.

## Release decision
- `GO` when all 4 gates pass.
- `NO-GO` when any gate fails or when auth smoke is required and cannot be executed.
