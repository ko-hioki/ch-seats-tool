// zaproom Session Datastore クライアント
// 仕様: docs/zaproom-session-datastore.md
// - すべて credentials: 'include' 必須
// - PUT/POST はボディの SHA-256 を x-amz-content-sha256 ヘッダーに付与必須 (無いと 403)
// - 同時書き込みは ETag による楽観ロック (不一致は 409)

export function getSessionId() {
  return new URLSearchParams(location.search).get('sessionId');
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * データの読み込み
 * @returns {Promise<{etag: string, session: any, name: string}>}
 */
export async function loadSession(sessionId) {
  const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`セッションの読み込みに失敗しました (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * データの保存 (ETag 楽観ロック)
 * @returns {Promise<{conflict: boolean, etag?: string}>}
 */
export async function saveSession(sessionId, data, etag) {
  const body = JSON.stringify({
    content: JSON.stringify(data),
    etag,
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
    return { conflict: true };
  }
  if (!res.ok) {
    throw new Error(`保存に失敗しました (HTTP ${res.status})`);
  }
  const json = await res.json();
  return { conflict: false, etag: json.etag };
}

/**
 * 最新データを取得 → updater 適用 → 保存。409 ならリトライ。
 * プロフィール編集など「部分的な更新」を安全に行うためのパターン。
 * @param {string} sessionId
 * @param {(session: any) => any} updater
 * @returns {Promise<{etag: string, data: any}>}
 */
export async function saveWithRetry(sessionId, updater, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const { etag, session } = await loadSession(sessionId);
    const newData = updater(session);
    const result = await saveSession(sessionId, newData, etag);
    if (!result.conflict) {
      return { etag: result.etag, data: newData };
    }
  }
  throw new Error('保存の競合が解消できませんでした。時間をおいて再度お試しください。');
}
