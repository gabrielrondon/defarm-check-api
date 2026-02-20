// Import and register all checkers
import { checkerRegistry } from './registry.js';

// Social checkers
import slaveLaborChecker from './social/slave-labor.js';

// Legal checkers
import cguSanctionsChecker from './legal/cgu-sanctions.js';

// Environmental checkers
import carChecker from './environmental/car.js';
import deforestationChecker from './environmental/deforestation.js';
import ibamaEmbargoesChecker from './environmental/ibama-embargoes.js';
import { DeterAlertChecker } from './environmental/deter-alerts.js';
import { IndigenousLandChecker } from './environmental/indigenous-lands.js';
import { ConservationUnitChecker } from './environmental/conservation-units.js';
import { QueimadasChecker } from './environmental/queimadas.js';
import { MapBiomasAlertaChecker } from './environmental/mapbiomas-alerta.js';
import { AnaOutorgasChecker } from './environmental/ana-outorgas.js';
import { CarProdesIntersectionChecker } from './environmental/car-prodes-intersection.js';
import mapBiomasLandUseChecker from './environmental/mapbiomas-land-use.js';
import ndviProductivityChecker from './environmental/ndvi-productivity.js';
import reservaLegalComplianceChecker from './environmental/reserva-legal-compliance.js';
import pastureDegradationChecker from './environmental/pasture-degradation.js';
import landUseHistoryChecker from './environmental/land-use-history.js';
import productivityBenchmarkChecker from './environmental/productivity-benchmark.js';
import fireScarMappingChecker from './environmental/fire-scar-mapping.js';
import phenologyCropCyclesChecker from './environmental/phenology-crop-cycles.js';
import carbonStockChecker from './environmental/carbon-stock.js';
import waterBodyMonitoringChecker from './environmental/water-body-monitoring.js';
import soilErosionRiskChecker from './environmental/soil-erosion-risk.js';
import irrigationDetectionChecker from './environmental/irrigation-detection.js';
import cropMappingChecker from './environmental/crop-mapping.js';
import grazingPatternAnalyzerChecker from './environmental/grazing-pattern-analyzer.js';

// Positive checkers (certifications, compliance indicators)
import { MapaOrganicosChecker } from './positive/mapa-organicos.js';

// Uruguay checkers
import snapProtectedAreasChecker from './uruguay/snap-protected-areas.js';
import dicoseRuralChecker from './uruguay/dicose-rural.js';

// Register all checkers
checkerRegistry.register(slaveLaborChecker);
checkerRegistry.register(cguSanctionsChecker);
checkerRegistry.register(carChecker);
checkerRegistry.register(deforestationChecker);
checkerRegistry.register(ibamaEmbargoesChecker);
checkerRegistry.register(new DeterAlertChecker());
checkerRegistry.register(new IndigenousLandChecker());
checkerRegistry.register(new ConservationUnitChecker());
checkerRegistry.register(new QueimadasChecker());
checkerRegistry.register(new MapBiomasAlertaChecker());
checkerRegistry.register(new MapaOrganicosChecker());
checkerRegistry.register(new AnaOutorgasChecker());
checkerRegistry.register(new CarProdesIntersectionChecker());
checkerRegistry.register(mapBiomasLandUseChecker);
checkerRegistry.register(ndviProductivityChecker);
checkerRegistry.register(reservaLegalComplianceChecker);
checkerRegistry.register(pastureDegradationChecker);
checkerRegistry.register(landUseHistoryChecker);
checkerRegistry.register(productivityBenchmarkChecker);
checkerRegistry.register(fireScarMappingChecker);
checkerRegistry.register(phenologyCropCyclesChecker);
checkerRegistry.register(carbonStockChecker);
checkerRegistry.register(waterBodyMonitoringChecker);
checkerRegistry.register(soilErosionRiskChecker);
checkerRegistry.register(irrigationDetectionChecker);
checkerRegistry.register(cropMappingChecker);
checkerRegistry.register(grazingPatternAnalyzerChecker);

// Uruguay checkers
checkerRegistry.register(snapProtectedAreasChecker);
checkerRegistry.register(dicoseRuralChecker);

export { checkerRegistry };
export * from './base.js';
export * from './registry.js';
