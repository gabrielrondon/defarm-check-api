import { CheckStatus, Severity } from '../types/checker.js';
import { SourceResult } from '../types/verdict.js';

function isRiskStatus(status?: string): boolean {
  return status === CheckStatus.FAIL || status === CheckStatus.WARNING;
}

function findByName(results: SourceResult[], candidates: string[]): SourceResult | undefined {
  return results.find((result) =>
    candidates.some((candidate) => result.name.toLowerCase().includes(candidate.toLowerCase()))
  );
}

export function deriveCompositeSources(results: SourceResult[]): SourceResult[] {
  const derived: SourceResult[] = [];

  const prodes = findByName(results, ['prodes']);
  const deter = findByName(results, ['deter']);
  const car = findByName(results, ['car registry', 'car - cadastro ambiental rural', 'car']);
  const ibama = findByName(results, ['ibama embargoes', 'ibama']);
  const queimadas = findByName(results, ['inpe fire hotspots', 'queimadas', 'fire hotspots']);

  if (prodes && deter && isRiskStatus(prodes.status) && isRiskStatus(deter.status)) {
    derived.push({
      name: 'Cross Source: Deforestation Escalation',
      category: 'environmental',
      sourceType: 'derived',
      status: CheckStatus.FAIL,
      severity: Severity.HIGH,
      message: 'PRODES and DETER both indicate active deforestation risk in the same analysis.',
      details: {
        ruleId: 'cross_deforestation_escalation_v1',
        basedOn: [prodes.name, deter.name],
        statuses: {
          prodes: prodes.status,
          deter: deter.status
        }
      },
      executionTimeMs: 0,
      cached: false
    });
  }

  if (car && (isRiskStatus(prodes?.status) || isRiskStatus(deter?.status)) && isRiskStatus(car.status)) {
    derived.push({
      name: 'Cross Source: CAR Compliance Watch',
      category: 'environmental',
      sourceType: 'derived',
      status: CheckStatus.WARNING,
      severity: Severity.MEDIUM,
      message: 'CAR irregularity combined with deforestation indicators requires manual audit.',
      details: {
        ruleId: 'cross_car_compliance_watch_v1',
        basedOn: [car.name, prodes?.name, deter?.name].filter(Boolean),
        statuses: {
          car: car.status,
          prodes: prodes?.status ?? null,
          deter: deter?.status ?? null
        }
      },
      executionTimeMs: 0,
      cached: false
    });
  }

  if (ibama && car && isRiskStatus(ibama.status) && isRiskStatus(car.status)) {
    derived.push({
      name: 'Cross Source: Embargoed CAR Escalation',
      category: 'environmental',
      sourceType: 'derived',
      status: CheckStatus.FAIL,
      severity: Severity.CRITICAL,
      message: 'IBAMA embargo signal combined with CAR irregularity indicates critical compliance risk.',
      details: {
        ruleId: 'cross_embargoed_car_escalation_v1',
        basedOn: [ibama.name, car.name],
        statuses: {
          ibama: ibama.status,
          car: car.status
        }
      },
      executionTimeMs: 0,
      cached: false
    });
  }

  if (queimadas && deter && isRiskStatus(queimadas.status) && isRiskStatus(deter.status)) {
    derived.push({
      name: 'Cross Source: Active Fire Pressure',
      category: 'environmental',
      sourceType: 'derived',
      status: CheckStatus.WARNING,
      severity: Severity.HIGH,
      message: 'Fire hotspots and DETER alerts together suggest active pressure requiring rapid follow-up.',
      details: {
        ruleId: 'cross_active_fire_pressure_v1',
        basedOn: [queimadas.name, deter.name],
        statuses: {
          queimadas: queimadas.status,
          deter: deter.status
        }
      },
      executionTimeMs: 0,
      cached: false
    });
  }

  return derived;
}
