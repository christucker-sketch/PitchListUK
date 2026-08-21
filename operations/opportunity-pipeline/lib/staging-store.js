const fs = require('fs');
const path = require('path');

function runtimeRoot(env = process.env) {
  const root = env.PITCHLIST_PIPELINE_RUNTIME_DIR;
  if (!root || !path.isAbsolute(root)) throw new Error('PITCHLIST_PIPELINE_RUNTIME_DIR must be an absolute path outside Git');
  return root;
}

function atomicWriteJson(target, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fsImpl.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fsImpl.renameSync(temporary, target);
}

function writeStagingManifest(name, value, env = process.env) {
  if (!/^[a-z0-9][a-z0-9._-]*\.json$/i.test(name)) throw new Error('Invalid manifest filename');
  const target = path.join(runtimeRoot(env), 'staging', name);
  atomicWriteJson(target, value);
  return target;
}

module.exports = { runtimeRoot, atomicWriteJson, writeStagingManifest };
