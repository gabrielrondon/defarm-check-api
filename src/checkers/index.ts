// Import and register all checkers
import { checkerRegistry } from './registry.js';

// Social checkers
import slaveLaborChecker from './social/slave-labor.js';

// Environmental checkers
import carChecker from './environmental/car.js';
import deforestationChecker from './environmental/deforestation.js';
import ibamaEmbargoesChecker from './environmental/ibama-embargoes.js';

// Register all checkers
checkerRegistry.register(slaveLaborChecker);
checkerRegistry.register(carChecker);
checkerRegistry.register(deforestationChecker);
checkerRegistry.register(ibamaEmbargoesChecker);

export { checkerRegistry };
export * from './base.js';
export * from './registry.js';
