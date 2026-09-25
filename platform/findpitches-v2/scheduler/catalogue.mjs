import { enabledMarkets } from '../markets/registry.mjs';
import { enabledGeographies, GEOGRAPHY_CATALOG_VERSION } from '../geography/catalog.mjs';

const META_KEY = 'geography_catalog_version';

export async function ensureSchedulerCatalogue(db, { now = new Date() } = {}) {
  if (!db?.prepare || typeof db.batch !== 'function') {
    throw new Error('findpitches_v2_scheduler_db_invalid');
  }

  const current = await db.prepare(
    'SELECT value FROM runtime_meta WHERE key = ?'
  ).bind(META_KEY).first();

  if (current?.value === GEOGRAPHY_CATALOG_VERSION) {
    // Old pilot rows can be reintroduced by the seed migration on a later deploy.
    // Prune them even when the catalogue version itself is already current so the
    // runtime converges to the canonical enabled-geography catalogue.
    const cleanup = await db.prepare("DELETE FROM scheduler_jobs WHERE id LIKE 'shadow-%'").run();
    return Object.freeze({
      changed: Number(cleanup?.meta?.changes || 0) > 0,
      version: GEOGRAPHY_CATALOG_VERSION,
      jobs: 0,
      pruned_legacy_jobs: Number(cleanup?.meta?.changes || 0)
    });
  }

  const schedule = roundRobinSchedule();
  const timestamp = now.toISOString();

  await db.batch([
    db.prepare("DELETE FROM scheduler_jobs WHERE id LIKE 'catalog:%'"),
    db.prepare("DELETE FROM scheduler_jobs WHERE id LIKE 'shadow-%'")
  ]);

  const statements = schedule.map((item, index) => {
    const sequence = String(index + 1).padStart(4, '0');
    return db.prepare(
      `INSERT INTO scheduler_jobs (
        id, market, region_code, location, query_group, priority, status,
        available_at, attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, 0, 'ready', ?, 0, ?, ?)`
    ).bind(
      `catalog:${sequence}:${item.market}:${item.code}`,
      item.market,
      item.code,
      item.name,
      timestamp,
      timestamp,
      timestamp
    );
  });

  if (statements.length) {
    const chunkSize = 50;
    for (let index = 0; index < statements.length; index += chunkSize) {
      await db.batch(statements.slice(index, index + chunkSize));
    }
  }

  await db.prepare(
    `INSERT INTO runtime_meta (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(META_KEY, GEOGRAPHY_CATALOG_VERSION, timestamp).run();

  return Object.freeze({
    changed: true,
    version: GEOGRAPHY_CATALOG_VERSION,
    jobs: schedule.length
  });
}

export function roundRobinSchedule() {
  const markets = enabledMarkets().map(market => market.code);
  const lists = new Map(markets.map(code => [code, enabledGeographies(code)]));
  const max = Math.max(0, ...[...lists.values()].map(items => items.length));
  const schedule = [];

  for (let index = 0; index < max; index += 1) {
    for (const market of markets) {
      const item = lists.get(market)[index];
      if (item) schedule.push(item);
    }
  }

  return Object.freeze(schedule);
}

export { META_KEY as GEOGRAPHY_CATALOG_META_KEY };
