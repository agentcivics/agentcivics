/**
 * Snapshot of move/deployments.json at bundle time.
 *
 * This file is a thin re-export of the testnet deployment JSON so the
 * Worker doesn't have to fetch it at runtime. Updated by `mise run
 * deploy-workers` (which copies move/deployments.json → workers/src/
 * deployment.json and rebuilds). We deliberately bundle rather than
 * fetch to keep cold-start fast and to avoid a runtime dependency on
 * the docs site being up.
 *
 * Keep this file in sync with move/deployments.json by re-running the
 * deploy-workers task after any chain change.
 */
import data from './deployment.json' with { type: 'json' };

export default data;
