export const LEGACY_INFLIGHT_INSPECTION_TARGET = Object.freeze({
  workflow_name: 'pitchlist-texas-acquisition',
  instance_id: 'cf_d9de4e04c49d1ad3d02156da21d02d30db1f0bbb60c0e0185ebee0c8eef41fe5',
  state_code: 'MI',
  mode: 'discover',
  replay_key: 'discover:MI:128:4',
  controller_state_version: 12,
  controller_state_sha256: 'bab094984c928a20db4ee6dfd929a9e94e066cae9ad7baa76b84820c945a754b'
});

export function summarizeLegacyInflightInspection(payload) {
  const result = payload?.result;
  if (!payload || payload.success !== true || !result || typeof result !== 'object') {
    throw new Error('legacy_inflight_inspection_cloudflare_response_invalid');
  }
  const status = String(result.status || '').trim();
  if (!status) throw new Error('legacy_inflight_inspection_status_missing');
  return Object.freeze({
    workflow_name: LEGACY_INFLIGHT_INSPECTION_TARGET.workflow_name,
    instance_id: LEGACY_INFLIGHT_INSPECTION_TARGET.instance_id,
    state_code: LEGACY_INFLIGHT_INSPECTION_TARGET.state_code,
    mode: LEGACY_INFLIGHT_INSPECTION_TARGET.mode,
    replay_key: LEGACY_INFLIGHT_INSPECTION_TARGET.replay_key,
    controller_state_version: LEGACY_INFLIGHT_INSPECTION_TARGET.controller_state_version,
    controller_state_sha256: LEGACY_INFLIGHT_INSPECTION_TARGET.controller_state_sha256,
    workflow_status: status,
    terminal: ['complete', 'errored', 'terminated'].includes(status),
    success: result.success === true,
    error: result.error || null,
    output: result.output ?? null,
    start: result.start || null,
    end: result.end || null
  });
}
