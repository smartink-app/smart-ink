import type { Plugin } from 'vite';
import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';
export function allowedLocalRequest(req: IncomingMessage): boolean {
  const host = req.headers.host || '';
  const remote = req.socket.remoteAddress || '';
  return /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
    && (!req.headers.origin || req.headers.origin === `http://${host}`);
}
export function validRow(row: unknown): row is string[] {
  return Array.isArray(row) && row.length === 8 && row.every(v => typeof v === 'string' && v.length <= 20000)
    && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,199}$/.test(row[0]) && ['new', 'investigating', 'resolved'].includes(row[6]);
}
export function googleFeedbackBridge(env: Record<string, string>): Plugin {
  const url = env.GOOGLE_FEEDBACK_WEBAPP_URL || '';
  const token = env.GOOGLE_FEEDBACK_SECRET || '';
  const configured = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) && token.length >= 32;
  const destination = createHash('sha256').update(url).digest('hex');
  return { name: 'local-google-feedback', configureServer(server) {
    server.middlewares.use('/api/feedback-google', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      const reply = (status: number, body: object) => { res.statusCode = status; res.end(JSON.stringify(body)); };
      if (!allowedLocalRequest(req)) return reply(403, { ok: false });
      if (req.method === 'GET') return reply(200, { configured, destination });
      if (req.method !== 'POST') return reply(405, { ok: false });
      if (!configured) return reply(503, { ok: false });
      if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { ok: false });
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 180000) { reply(413, { ok: false }); return; }
        }
        const { row } = JSON.parse(body);
        if (!validRow(row)) return reply(400, { ok: false });
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, row }), signal: AbortSignal.timeout(40000) });
        const answer = await response.json() as { ok?: boolean; id?: string };
        if (!response.ok || answer.ok !== true || answer.id !== row[0]) return reply(502, { ok: false });
        reply(200, { ok: true, id: row[0] });
      } catch { reply(502, { ok: false }); }
    });
  } };
}
