const fs = require('fs');
const path = require('path');

function runtimeRoot(env = process.env) {
  const root = env.PITCHLIST_PIPELINE_RUNTIME_DIR;
  if (!root || !path.isAbsolute(root)) throw new Error('PITCHLIST_PIPELINE_RUNTIME_DIR must be an absolute path outside Git');
  const resolved = path.resolve(root);
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const relative = path.relative(repositoryRoot, resolved);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('PITCHLIST_PIPELINE_RUNTIME_DIR must be outside the Git checkout');
  }
  return resolved;
}

function atomicWriteJson(target, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fsImpl.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fsImpl.renameSync(temporary, target);
}

function writeStagingManifest(name, value, env = process.env) {
  if (!/^[a-z0-9][a-z0-9._-]*\.json$/i.test(name)) throw new Error('Invalid manifest filename');
  const target = path.join(runtimeRoot(env), 'data', 'staging', name);
  atomicWriteJson(target, value);
  return target;
}

module.exports = { runtimeRoot, atomicWriteJson, writeStagingManifest };
