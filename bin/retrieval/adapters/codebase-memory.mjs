import { execSync } from 'node:child_process';
import { PROVIDET_IDS, STATUS, createEnvelope, elapsed } from './shared.mjs';

export const id = PROVIDET_IDS.CODEBASE_MEMORY;

export function checkAvailability() { return 'not_installed'; }

export async function execute(request) {
  const e = createEnvelope(id);
  const t = performance.now();
  e.status = STATUS.UNAVAILABLE;
  e.error = 'Codebase Memory implementation required for architecture provider';
  e.duration_ms = elapsed(t);
  return e;
}
