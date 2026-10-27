import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['src', 'scripts', 'test']) {
  for (const file of await readdir(new URL(`../${dir}/`, import.meta.url))) {
    if (!file.endsWith('.mjs')) continue;
    const result = spawnSync(process.execPath, ['--check', new URL(`../${dir}/${file}`, import.meta.url).pathname], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(1);
  }
}
console.log('Mycelium memory build/syntax check passed; no database connection.');
