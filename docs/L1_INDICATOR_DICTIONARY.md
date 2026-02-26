# L1 Indicator Dictionary (v1)

## Objetivo
Definir IDs estáveis para indicadores operacionais (L1) retornados por `sources[].indicators`.

## Convenções
- `id`: snake_case, estável e sem acento.
- `direction`:
  - `HIGHER_IS_WORSE`
  - `LOWER_IS_WORSE`
  - `NEUTRAL`
- `unit`: usar `count`, `ha`, `km`, `days` quando aplicável.

## IBAMA Embargoes
- `ibama_has_active_embargo`
  - tipo: boolean
  - direction: `HIGHER_IS_WORSE`
- `ibama_embargo_count`
  - tipo: number
  - unit: `count`
  - direction: `HIGHER_IS_WORSE`
- `ibama_total_embargo_area_ha`
  - tipo: number
  - unit: `ha`
  - direction: `HIGHER_IS_WORSE`
- `ibama_nearby_embargo_count`
  - tipo: number
  - unit: `count`
  - direction: `HIGHER_IS_WORSE`
- `ibama_nearest_embargo_distance_km`
  - tipo: number
  - unit: `km`
  - direction: `LOWER_IS_WORSE`
- `ibama_nearby_embargo_area_ha`
  - tipo: number
  - unit: `ha`
  - direction: `HIGHER_IS_WORSE`

## PRODES Deforestation
- `prodes_deforestation_detected`
  - tipo: boolean
  - direction: `HIGHER_IS_WORSE`
- `prodes_area_ha`
  - tipo: number
  - unit: `ha`
  - direction: `HIGHER_IS_WORSE`
- `prodes_year`
  - tipo: number
  - direction: `NEUTRAL`

## DETER Real-Time Alerts
- `deter_coverage_applicable`
  - tipo: boolean
  - direction: `NEUTRAL`
- `deter_has_recent_alert`
  - tipo: boolean
  - direction: `HIGHER_IS_WORSE`
- `deter_recent_alert_count`
  - tipo: number
  - unit: `count`
  - direction: `HIGHER_IS_WORSE`
- `deter_alert_days_ago`
  - tipo: number
  - unit: `days`
  - direction: `LOWER_IS_WORSE`
- `deter_alert_area_ha`
  - tipo: number
  - unit: `ha`
  - direction: `HIGHER_IS_WORSE`
