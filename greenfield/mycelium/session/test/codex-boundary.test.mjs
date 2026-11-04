import test from 'node:test';
import assert from 'node:assert/strict';
import {threadBoundary,verifyThreadBoundary,verifyNoExternalTools} from '../adapters/codex-boundary.mjs';
import {CodexSession} from '../adapters/codex-app-server.mjs';
const id='myc-p0-'+ 'a'.repeat(32), root='/isolated/worktree';
test('named permissions grant only the isolated worktree read access and no network; no root/home grant or inheritance',()=>{
 const p=threadBoundary(root,id);assert.equal(p.permissions,id);assert.equal(p.sandbox,undefined);
 assert.deepEqual(p.config['permissions.'+id],{filesystem:{[root]:'read'},network:{enabled:false}});
 assert.equal(p.config.default_permissions,id,'0.164.0 needs default_permissions naming the profile');assert.deepEqual(p.environments,[]);assert.deepEqual(p.runtimeWorkspaceRoots,[root]);
 for(const f of ['shell_tool','view_image','code_mode','multi_agent','multi_agent_v2','apps','enable_mcp_apps','plugins','memory_tool','request_permissions_tool'])assert.equal(p.config['features.'+f],false,f);
 assert.equal(p.config.web_search,'disabled');assert.equal(p.config['agents.enabled'],false);
});
test('broad or ambiguous worktree/profile inputs are rejected',()=>{
 for(const path of ['/','relative','/a/../b','/a/'])assert.throws(()=>threadBoundary(path,id));
 assert.throws(()=>threadBoundary(root,':read-only'));
});
test('profile echo, no inheritance, cwd and approval policy are required; no silent read-only fallback',()=>{
 const p=threadBoundary(root,id),good={activePermissionProfile:{id},approvalPolicy:'never',cwd:root};
 verifyThreadBoundary(good,p,root);
 for(const bad of [{},{...good,activePermissionProfile:{id:':read-only'}},{...good,activePermissionProfile:{id,extends:':read-only'}},{...good,cwd:'/home/myc'},{...good,approvalPolicy:'on-request'}])assert.throws(()=>verifyThreadBoundary(bad,p,root));
});
test('external MCP is refused, including incomplete pagination or malformed status',()=>{
 verifyNoExternalTools({data:[],nextCursor:null});
 for(const bad of [null,{}, {data:[{name:'filesystem'}]}, {data:[],nextCursor:'more'}])assert.throws(()=>verifyNoExternalTools(bad));
});
for(const failure of ['fallback','mcp','missing','cwd'])test('no allowance or inference when boundary fails: '+failure,async()=>{
 const methods=[];let reservations=0;
 const rpc={notify(){},async request(method,p){methods.push(method);
 if(method==='thread/start')return {thread:{id:'t'},activePermissionProfile:{id:failure==='fallback'?':read-only':p.permissions},approvalPolicy:'never',cwd:failure==='cwd'?'/home/myc':root};
 if(method==='mcpServerStatus/list')return failure==='missing'?{}:{data:failure==='mcp'?[{name:'filesystem'}]:[]};
 return {};
 }};
 const s=new CodexSession({rpc,reserve:async()=>{reservations++;throw Error('must not dispatch');},publish:async()=>({}),signal:new AbortController().signal,worktree:root});
 await assert.rejects(s.start('offline metadata refusal'));
 assert.equal(reservations,0);assert.ok(!methods.includes('turn/start'));
});

test('no in-process skills-read route: cloud and executor discovery disabled, no selected capability roots',()=>{
 const p=threadBoundary(root,id);
 assert.equal(p.config['cloud.skills.enabled'],false);
 assert.equal(p.config['features.executor_capability_discovery'],false);
 assert.equal(p.config['features.executor_capability_discovery_v2'],false);
 assert.deepEqual(p.selectedCapabilityRoots,[]);
 assert.equal(p.config['features.skip_host_skill_discovery'],true);
 assert.equal(p.config['skills.bundled.enabled'],false);
});
test('independent file-copy and history-note extensions are disabled explicitly',()=>{
 const p=threadBoundary(root,id);
 assert.equal(p.config['features.multi_env_copy_file'],false);
 assert.equal(p.config['features.token_budget.use_history_notes_extension'],false);
 assert.equal(p.config.default_permissions,id);
});
