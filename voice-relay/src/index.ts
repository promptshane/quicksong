/** Personal, secret-protected command queue for QuickSong's phone PWA.
 * Cloudflare Worker + D1. Stores instructions only, never song data.
 */
interface QueryResult<T> { results: T[] }
interface PreparedQuery {
  bind(...values: unknown[]): PreparedQuery;
  run(): Promise<unknown>;
  all<T>(): Promise<QueryResult<T>>;
}
interface Database { prepare(statement: string): PreparedQuery }
interface Env { DB: Database; VOICE_TOKEN: string; ALLOWED_ORIGIN?: string }
interface PendingCommand { id: string; payload: string; created_at: number }

function respond(data: unknown, status = 200, origin: string | null = null): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = new Set(['https://promptshane.github.io', 'http://localhost:5173']);
    if (env.ALLOWED_ORIGIN) allowed.add(env.ALLOWED_ORIGIN);
    const corsOrigin = origin && allowed.has(origin) ? origin : null;

    if (origin && !corsOrigin) return respond({ error: 'Origin not permitted' }, 403);
    if (request.method === 'OPTIONS') return respond({}, 204, corsOrigin);
    if (request.method === 'GET' && url.pathname === '/health') return respond({ ok: true }, 200, corsOrigin);

    // Do not accept requests unless a sufficiently long secret is configured.
    if (!env.VOICE_TOKEN || env.VOICE_TOKEN.length < 32 ||
        request.headers.get('Authorization') !== 'Bearer ' + env.VOICE_TOKEN) {
      return respond({ error: 'Unauthorized' }, 401, corsOrigin);
    }

    if (request.method === 'GET' && url.pathname === '/v1/commands') {
      const rows = await env.DB.prepare(
        'SELECT id, payload, created_at FROM commands WHERE acknowledged_at IS NULL AND created_at > ? ORDER BY created_at ASC LIMIT 20',
      ).bind(Date.now() - 24 * 60 * 60 * 1000).all<PendingCommand>();
      return respond({ commands: rows.results.map((row) => ({ id: row.id, command: JSON.parse(row.payload) })) }, 200, corsOrigin);
    }
    if (request.method === 'POST' && (url.pathname === '/v1/commands' || url.pathname === '/v1/ack')) {
      const raw = await request.text();
      if (raw.length > 4096) return respond({ error: 'Payload too large' }, 413, corsOrigin);
      let input: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Not an object');
        input = parsed as Record<string, unknown>;
      } catch {
        return respond({ error: 'Invalid JSON' }, 400, corsOrigin);
      }
      if (url.pathname === '/v1/commands') {
        const command = input.command;
        if (!command || typeof command !== 'object' || Array.isArray(command)) return respond({ error: 'Invalid command' }, 400, corsOrigin);
        // The client independently checks each supported command and its arguments.
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO commands (id, payload, created_at) VALUES (?, ?, ?)')
          .bind(id, JSON.stringify(command), Date.now()).run();
        return respond({ ok: true, id }, 201, corsOrigin);
      }
      if (typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.id)) return respond({ error: 'Invalid id' }, 400, corsOrigin);
      await env.DB.prepare('UPDATE commands SET acknowledged_at = ? WHERE id = ?')
        .bind(Date.now(), input.id).run();
      return respond({ ok: true }, 200, corsOrigin);
    }
    return respond({ error: 'Not found' }, 404, corsOrigin);
  },
};
