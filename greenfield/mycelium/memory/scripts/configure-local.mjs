// Pipe the authenticated Windows Neon CLI output here; never pass a URI on the command line or print it.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { connectionSettings } from '../src/connection.mjs';
export async function configureLocal(input, destination = new URL('../.env.local', import.meta.url)) {
  const value=input.trim(), url=new URL(value);
  if (decodeURIComponent(url.pathname.slice(1)) !== 'neondb' || decodeURIComponent(url.username) !== 'neondb_owner') throw Error('Invalid target.');
  const env={ MYCELIUM_DATABASE_URL:value, MYCELIUM_DATABASE_HOST:url.hostname, MYCELIUM_DATABASE_NAME:'neondb' };
  connectionSettings(env);
  await writeFile(destination,Object.entries(env).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{flag:'wx',mode:0o600});
  return { host:url.hostname, database:'neondb', role:'neondb_owner' };
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const chunks=[]; for await(const chunk of process.stdin)chunks.push(chunk);
    const result=await configureLocal(Buffer.concat(chunks).toString('utf8'));
    console.log(`Saved ignored local configuration for ${result.host}/${result.database} (${result.role}). Compare this host with the Neon Console target before writes.`);
  } catch {
    console.error('Local configuration refused (invalid target/CLI output or .env.local already exists). No credentials printed.');
    process.exitCode=1;
  }
}
