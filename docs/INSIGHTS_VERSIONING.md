# Insights Versioning Policy

## Escopo
Versionamento de `insights.l2` e `insights.l3` no contrato da API.

## Regras
- `l2.version` e `l3.version` devem seguir semver (`MAJOR.MINOR.PATCH`).
- Mudanças aditivas (novos campos/sinais opcionais): incrementar `MINOR`.
- Mudanças de bug sem alteração de shape: incrementar `PATCH`.
- Mudanças incompatíveis (remoção/renomeação/semântica quebrando consumidor): incrementar `MAJOR`.

## Compatibilidade
- Nunca remover campos sem fase de depreciação.
- Preferir adicionar novo campo e manter o antigo por pelo menos 1 ciclo de release.
- Sempre atualizar:
  - `openapi.yaml` backend
  - `public/openapi.yaml` frontend
  - `src/lib/api.ts` frontend

## Checklist de release de insights
1. Atualizar versão no payload (`l2.version` e/ou `l3.version`).
2. Documentar mudança em `docs/L1_L2_L3_ROADMAP.md` ou changelog técnico.
3. Executar smoke test em `/check` e `/insights/l3`.
