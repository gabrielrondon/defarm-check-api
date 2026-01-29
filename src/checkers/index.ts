// Import and register all checkers
import { checkerRegistry } from './registry.js';

// Social checkers
import slaveLaborChecker from './social/slave-labor.js';

// Environmental checkers
import carChecker from './environmental/car.js';
import deforestationChecker from './environmental/deforestation.js';
import ibamaEmbargoesChecker from './environmental/ibama-embargoes.js';
import { DeterAlertChecker } from './environmental/deter-alerts.js';
import { IndigenousLandChecker } from './environmental/indigenous-lands.js';

// Register all checkers
checkerRegistry.register(slaveLaborChecker);
checkerRegistry.register(carChecker);
checkerRegistry.register(deforestationChecker);
checkerRegistry.register(ibamaEmbargoesChecker);
checkerRegistry.register(new DeterAlertChecker());
checkerRegistry.register(new IndigenousLandChecker());

export { checkerRegistry };
export * from './base.js';
export * from './registry.js';
