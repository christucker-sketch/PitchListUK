export function connectionSettings(env = process.env) {
  const value = env.MYCELIUM_DATABASE_URL;
  if (!value || !env.MYCELIUM_DATABASE_HOST || !env.MYCELIUM_DATABASE_NAME) {
    throw new Error('Dedicated Mycelium URL, expected host and database name are required.');
  }
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid Mycelium connection configuration.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !url.username || !url.password
      || !url.hostname.endsWith('.neon.tech')
      || url.hostname !== env.MYCELIUM_DATABASE_HOST
      || decodeURIComponent(url.pathname.slice(1)) !== env.MYCELIUM_DATABASE_NAME
      || !['require', 'verify-full'].includes(url.searchParams.get('sslmode'))) {
    throw new Error('Mycelium target/authentication/TLS guard refused the connection.');
  }
  return { connectionString: value };
}

// readOnly: every query and transaction runs inside a READ ONLY transaction, so even a coding mistake cannot write
// (defence in depth for recall; the database role is the real boundary).
export async function connect(env = process.env, { readOnly = false } = {}) {
  const { connectionString } = connectionSettings(env);
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString);
  const opts = () => ({ fetchOptions: { signal: AbortSignal.timeout(15000) }, ...(readOnly ? { readOnly: true } : {}) });
  return {
    readOnly,
    query: readOnly
      ? async (text, values = []) => (await sql.transaction([sql.query(text, values)], opts()))[0]
      : (text, values = []) => sql.query(text, values, opts()),
    transaction: statements => sql.transaction(statements.map(s => sql.query(s.text, s.values ?? [])), opts())
  };
}
