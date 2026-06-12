// zaproom Session Datastore クライアント
// 仕様: docs/zaproom-session-datastore.md
// - すべて credentials: 'include' 必須
// - PUT/POST はボディの SHA-256 を x-amz-content-sha256 ヘッダーに付与必須 (無いと 403)
// - 同時書き込みは ETag による楽観ロック (不一致は 409)

/** GET /api/sessions/{sessionId} のレスポンス */
export interface SessionResponse {
  etag: string;
  /** セッションに保存された生データ (normalizeData で AppData に正規化する) */
  session: unknown;
  name: string;
}

/** 保存結果: 409 競合 or 成功 (新しい etag) */
export type SaveResult = { conflict: true } | { conflict: false; etag: string };

export function getSessionId(): string | null {
  return new URLSearchParams(location.search).get('sessionId');
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * データの読み込み
 */
export async function loadSession(sessionId: string): Promise<SessionResponse> {
  const res = await fetch(`/api/sessions/${sessionId}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`セッションの読み込みに失敗しました (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * データの保存 (ETag 楽観ロック)
 */
export async function saveSession(
  sessionId: string,
  data: unknown,
  etag: string | null
): Promise<SaveResult> {
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
  const json: { etag: string } = await res.json();
  return { conflict: false, etag: json.etag };
}

/**
 * 最新データを取得 → updater 適用 → 保存。409 ならリトライ。
 * プロフィール編集など「部分的な更新」を安全に行うためのパターン。
 */
export async function saveWithRetry<T>(
  sessionId: string,
  updater: (session: unknown) => T,
  maxRetries = 3
): Promise<{ etag: string; data: T }> {
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
