// Per-thread restriction, never writes the account config or credentials.
import {isAbsolute, normalize} from 'node:path';
export function threadBoundary(worktree, profileId) {
  if (typeof worktree !== 'string' || !isAbsolute(worktree) || normalize(worktree) !== worktree || worktree.endsWith('/') || !/^myc-p0-[a-f0-9]{32}$/.test(profileId)) throw Error('isolated absolute worktree and profile id required');
  const disabled = ['shell_tool','view_image','code_mode','code_mode_only','multi_agent','multi_agent_v2','apps','enable_mcp_apps','plugins','remote_plugin','memory_tool','external_agent_memory_import','image_generation','imagegenext','request_permissions_tool','executor_capability_discovery','executor_capability_discovery_v2','multi_env_copy_file'];
  return {
    permissions: profileId, environments: [], selectedCapabilityRoots: [], runtimeWorkspaceRoots: [worktree],
    config: {
      ...Object.fromEntries(disabled.map(k => ['features.'+k,false])),
      // 0.164.0 reloads config for mcpServerStatus/list and refuses `[permissions]` profiles without default_permissions
      // (observed against the real CLI 4 Nov); naming the same per-thread profile keeps the boundary unchanged.
      default_permissions: profileId,
      'agents.enabled': false, web_search: 'disabled',
      // Extension tools have separate gates: hiding skill instructions does NOT disable skills.read.
      'cloud.skills.enabled': false, 'skills.bundled.enabled': false,
      'features.skip_host_skill_discovery': true,
      'features.token_budget.use_history_notes_extension': false,
      project_doc_max_bytes: 0, 'skills.include_instructions': false,
      // Custom profiles start with NO filesystem/network access. No extends/root/home grant.
      ['permissions.'+profileId]: {filesystem:{[worktree]:'read'},network:{enabled:false}}
    }
  };
}
export function verifyThreadBoundary(response, requested, worktree) {
  if (response?.activePermissionProfile?.id !== requested.permissions || response.activePermissionProfile.extends != null || response.approvalPolicy !== 'never' || response.cwd !== worktree) throw Error('Codex named permission boundary not confirmed; no model dispatch');
}
export function verifyNoExternalTools(status) {
  if (!status || !Array.isArray(status.data) || status.data.length || status.nextCursor != null) throw Error('Codex external MCP surface not empty; no model dispatch');
}
