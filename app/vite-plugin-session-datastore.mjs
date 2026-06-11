// vite-plugin-session-datastore.mjs
// zaproom Session Datastore のローカルエミュレータ (開発時のみ使用)。
// docs/zaproom-session-datastore.md の API 仕様を満たす簡易実装:
//   GET  /api/sessions            -> { sessions: [{id, name, visibility, write_scope, created_at}] }
//   POST /api/sessions            -> { id, etag }   body: { name, content, visibility, write_scope }
//   GET  /api/sessions/{id}       -> { etag, session, name }
//   PUT  /api/sessions/{id}       -> { etag } / 409  body: { content, etag }
// セッションデータはインメモリ。サーバー再起動でリセットされる。
import crypto from 'node:crypto';

function etagOf(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 32);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

export default function sessionDatastorePlugin() {
  /** @type {Map<string, {name: string, content: string, etag: string, visibility: string, write_scope: string, created_at: string}>} */
  const sessions = new Map();

  // 開発用のデフォルトセッションを 1 つ用意しておく
  const defaultId = 'local-dev-session';
  const defaultContent = JSON.stringify(null);
  sessions.set(defaultId, {
    name: 'ローカル開発セッション',
    content: defaultContent,
    etag: etagOf(defaultContent),
    visibility: 'internal',
    write_scope: 'internal',
    created_at: new Date().toISOString(),
  });

  return {
    name: 'session-datastore-emulator',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        const match = url.pathname.match(/^\/api\/sessions(?:\/([^/]+))?$/);
        if (!match) return next();
        const id = match[1] ? decodeURIComponent(match[1]) : null;

        try {
          // 一覧
          if (!id && req.method === 'GET') {
            return sendJson(res, 200, {
              sessions: [...sessions.entries()].map(([sid, s]) => ({
                id: sid,
                name: s.name,
                visibility: s.visibility,
                write_scope: s.write_scope,
                created_at: s.created_at,
              })),
            });
          }

          // 作成
          if (!id && req.method === 'POST') {
            if (!req.headers['x-amz-content-sha256']) {
              return sendJson(res, 403, { error: 'x-amz-content-sha256 header is required' });
            }
            const body = JSON.parse((await readBody(req)) || '{}');
            const newId = 'local-' + crypto.randomBytes(6).toString('hex');
            const content = body.content ?? JSON.stringify(null);
            const session = {
              name: body.name ?? 'unnamed',
              content,
              etag: etagOf(content),
              visibility: body.visibility ?? 'private',
              write_scope: body.write_scope ?? 'author-only',
              created_at: new Date().toISOString(),
            };
            sessions.set(newId, session);
            return sendJson(res, 200, { id: newId, etag: session.etag });
          }

          if (!id) return sendJson(res, 405, { error: 'method not allowed' });

          const session = sessions.get(id);

          // 読み込み
          if (req.method === 'GET') {
            if (!session) return sendJson(res, 404, { error: 'session not found' });
            let parsed = null;
            try {
              parsed = JSON.parse(session.content);
            } catch {
              parsed = null;
            }
            return sendJson(res, 200, { etag: session.etag, session: parsed, name: session.name });
          }

          // 保存 (ETag 楽観ロック)
          if (req.method === 'PUT') {
            if (!session) return sendJson(res, 404, { error: 'session not found' });
            if (!req.headers['x-amz-content-sha256']) {
              return sendJson(res, 403, { error: 'x-amz-content-sha256 header is required' });
            }
            const body = JSON.parse((await readBody(req)) || '{}');
            if (body.etag !== session.etag) {
              return sendJson(res, 409, { error: 'etag mismatch', etag: session.etag });
            }
            session.content = body.content ?? JSON.stringify(null);
            session.etag = etagOf(session.content + ':' + Date.now());
            return sendJson(res, 200, { etag: session.etag });
          }

          return sendJson(res, 405, { error: 'method not allowed' });
        } catch (e) {
          return sendJson(res, 500, { error: String(e) });
        }
      });

      server.httpServer?.once('listening', () => {
        setTimeout(() => {
          const address = server.httpServer.address();
          const port = typeof address === 'object' && address ? address.port : 5173;
          // eslint-disable-next-line no-console
          console.log(
            `\n  [session-datastore] セッション付き URL: http://localhost:${port}/?sessionId=${defaultId}\n`
          );
        }, 100);
      });
    },
  };
}
