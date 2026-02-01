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

// Positive checkers (certifications, compliance indicators)
import { MapaOrganicosChecker } from './positive/mapa-organicos.js';

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

export { checkerRegistry };
export * from './base.js';
export * from './registry.js';
