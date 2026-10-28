import { readFile } from 'node:fs/promises';
export const target = JSON.parse(await readFile(new URL('../target.json', import.meta.url), 'utf8'));

export function assertMigrationCatalog(tables) {
  for (const { table_schema: schema, table_name: table } of tables) {
    if (schema === target.schema) continue;
    if (target.existingUntouchedSchemas[schema]?.includes(table)) continue;
    throw new Error('Unexpected non-Mycelium table; inspect and stop.');
  }
}

export function assertDeploymentTarget(env) {
  if (env.MYCELIUM_DATABASE_HOST !== target.endpointHost || env.MYCELIUM_DATABASE_NAME !== target.database) {
    throw new Error('Deployment host/database does not match the inspected target.');
  }
  const url = new URL(env.MYCELIUM_DATABASE_URL);
  if (url.hostname !== target.endpointHost || decodeURIComponent(url.username) !== target.migrationRole) {
    throw new Error('Deployment credential is not the inspected migration target/role.');
  }
}
