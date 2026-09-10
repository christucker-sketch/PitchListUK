import { controllerStateStub } from './controller-state-maintenance.mjs';

export function globalControllerCutoverEnabled(env = {}) {
  return String(env.GLOBAL_CONTROLLER_CUTOVER_ENABLED || '').trim().toLowerCase() === 'true';
}

export async function readControllerAuthority(env = {}) {
  const response = await controllerStateStub(env).fetch('https://controller-state.internal/meta');
  if (!response.ok) throw new Error('Controller state metadata is unavailable');
  const payload = await response.json();
  const state = payload?.state || null;
  if (!state) throw new Error('Controller state is not initialized');
  return state;
}

export async function assertAuthoritativeUsMutationAllowed(env = {}, dispatch = {}) {
  if (!(dispatch?.country === 'US' && dispatch?.mutation_capable)) return true;
  if (!globalControllerCutoverEnabled(env)) {
    throw new Error('US production mutation is blocked until the Cloudflare controller cutover flag is explicitly enabled');
  }
  const state = await readControllerAuthority(env);
  if (state.authority !== 'authoritative') {
    throw new Error(`US production mutation requires authoritative controller state; current authority is ${state.authority || 'unknown'}`);
  }
  return true;
}
