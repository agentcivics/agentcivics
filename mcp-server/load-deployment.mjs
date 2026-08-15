/**
 * load-deployment.mjs — resolve on-chain IDs for the active network.
 *
 * The test scripts each used to hardcode their own copy of the IDs, which is
 * exactly how they ended up several deployments behind: all four still named
 * package 0x9ca7fde1… (v5.0, retired by the v5.3 fresh redeploy) and one of
 * them a ModerationBoard belonging to the abandoned v4 package. One loader,
 * one source of truth, no copies to forget.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadDeployment(network) {
  const candidates = [
    join(here, `deployments.${network}.json`),
    join(here, 'deployments.json'),
    join(here, '..', 'move', `deployments.${network}.json`),
    join(here, '..', 'move', 'deployments.json'),
  ];
  for (const candidate of candidates) {
    let deploy;
    try { deploy = JSON.parse(readFileSync(candidate, 'utf8')); } catch { continue; }
    // A deployment file for the wrong chain is worse than none: the IDs resolve
    // to nothing and the failure surfaces as a confusing ObjectNotFound.
    if (deploy.network && deploy.network !== network) continue;
    return { ...deploy, _source: candidate };
  }
  throw new Error(
    `No deployment file for network '${network}'. Tried:\n  ${candidates.join('\n  ')}`,
  );
}
