# zaproom Session Datastore リファレンス

> 出典: https://zaproom.kayac.com/tools/57e4G83WDGEM (Session Datastore Kitchen Sink) 2026-06-11 取得

zaproom ツールにサーバー側のデータ保存・共有機能を追加する仕組み。セッション URL を共有するだけで、複数人がリアルタイムに同じデータを読み書きできる。

## 概要

- これまでの zaproom ツールはブラウザ内(localStorage)だけのデータ保持だったが、Session Datastore はサーバー側にデータを保存する
- ツール画面上部の zaproom 標準 UI (SessionSelector) でセッションの作成・切り替えが可能
- zaproom が URL に `?sessionId=...` を付与する
- 同時書き込みは ETag による楽観的ロックで保護される

## アクセス制御

- `visibility: "private"` — 作成者のみ閲覧・書込(デフォルト)
- `visibility: "internal"` — 組織メンバー全員が閲覧可。書き込みは write_scope による
- `write_scope: "author-only"` — セッション作成者のみ書き込み可(デフォルト)
- `write_scope: "internal"` — 組織メンバー全員が書き込み可
- manifest.json の配列は「セッション作成時にユーザーが選べる選択肢」を定義する(セッション自体の設定ではない)
- 別途メールアドレス指定の ACL 機能もある(2026-06-09 リリース、#club-zaproom 告知参照)

## manifest.json (zip のトップレベルに配置)

```json
{
  "version": 1,
  "features": {
    "session_datastore": {
      "enabled": true,
      "visibility": ["private", "internal"],
      "write_scope": ["author-only", "internal"]
    }
  }
}
```

## API (ツール iframe 内から呼び出す。すべて `credentials: 'include'` 必須)

### セッション ID の取得

```js
const sessionId = new URLSearchParams(location.search).get('sessionId');
```

### データの読み込み — GET /api/sessions/{sessionId}

```js
const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
const { etag, session, name } = await res.json();
// etag    - ETag(更新時に必要)
// name    - セッション名
// session - JSON オブジェクト(保存したデータ)
```

GET では `x-amz-content-sha256` ヘッダーは不要。

### データの保存 — PUT /api/sessions/{sessionId}

```js
const body = JSON.stringify({
  content: JSON.stringify(newData),
  etag: currentEtag,
});

const hash = await sha256Hex(body);

const res = await fetch(`/api/sessions/${sessionId}`, {
  method: 'PUT',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'x-amz-content-sha256': hash,
  },
  body,
});

if (res.status === 409) {
  // ETag 不一致 → 最新データを再取得してリトライ
}
const { etag } = await res.json(); // 新しい ETag
```

### x-amz-content-sha256 ヘッダー (POST/PUT で必須)

ツールのサブドメインは CloudFront + OAC 経由で Lambda に接続されているため、POST/PUT ではリクエストボディの SHA-256 ハッシュをヘッダーに付与する必要がある。無いと 403 Forbidden。

```js
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### コンフリクト処理パターン

```js
async function saveWithRetry(sessionId, updater, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const { etag, session } = await loadSession(sessionId);
    const newData = updater(session);
    const result = await saveSession(sessionId, newData, etag);
    if (!result.conflict) return result;
  }
  throw new Error('Max retries exceeded');
}
```

### その他のエンドポイント (通常は zaproom の SessionSelector UI が担当するためツール側での呼び出しは不要)

- `GET /api/sessions` → `{ sessions }` (各要素: id, name, visibility, write_scope, created_at)
- `POST /api/sessions` body: `{ name, content, visibility, write_scope }` (write_scope 省略時 'author-only') → `{ id, etag }`

## ローカル開発

- ビルドあり構成(Vite): `vite-plugin-session-datastore.mjs`(ローカルエミュレータ)を vite.config.js のプラグインに追加。`base: './'` 必須(zaproom はルート相対パスで配信されない)。manifest.json は public/ に配置
- ビルドレス構成: Node/Bun のエミュレータスクリプト `_emulator.mjs` を起動(`node _emulator.mjs .`)。セッションデータはインメモリで再起動でリセット。zip 生成前に削除する
- 開発サーバー起動時にコンソールへ `?sessionId=...` 付き URL が表示される

## zip 生成

- ビルドあり: `bun run build` → `cp spec.md dist/` → `cd dist && zip -r ../app.zip . -x '.*' -x '__MACOSX/*'`
- ビルドレス: `cd {app-dir} && zip -r app.zip . -x '.*' -x '__MACOSX/*'`
- index.html と manifest.json が zip のトップレベルに来ること
