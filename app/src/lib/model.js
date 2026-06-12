// データモデル定義とユーティリティ

export const DATA_VERSION = 1;

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function createEmptyData() {
  return {
    version: DATA_VERSION,
    locations: [],
    members: [],
    seats: [],
    zones: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createLocation(name, order) {
  return {
    id: uid(),
    name,
    order,
    floorImage: null,
    imageWidth: null,
    imageHeight: null,
    seatScale: 1,
  };
}

export function createMember(attrs = {}) {
  return {
    id: uid(),
    name: '',
    nickname: '',
    department: '',
    icon: null,
    slackUserId: null,
    note: '',
    ...attrs,
  };
}

export function createSeat(locationId, x, y, attrs = {}) {
  return {
    id: uid(),
    locationId,
    x,
    y,
    // w/h: 席ユニット単位のサイズ倍率 (1 = 標準サイズ)。0.5〜6.0
    w: 1,
    h: 1,
    rotation: 0,
    label: '',
    name: '',
    memberId: null,
    type: 'fixed',
    ...attrs,
  };
}

// 席サイズ倍率の有効範囲 (席ユニット単位)
export const SEAT_SIZE_MIN = 0.5;
export const SEAT_SIZE_MAX = 6;

export function clampSeatSize(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
    ? Math.min(SEAT_SIZE_MAX, Math.max(SEAT_SIZE_MIN, v))
    : 1;
}

/**
 * 机テンプレート: クリック位置を中心に一式配置する席セットの定義。
 * dx は席ユニット幅 (seatW)、dy は席ユニット高さ (seatH = seatW×0.62) 単位のオフセット。
 * 対面島は上段を 180° 回転して向かい合わせにする。
 */
export const SEAT_TEMPLATES = [
  {
    id: 'single',
    label: '1人席',
    seats: [{ dx: 0, dy: 0, w: 1, h: 1, rotation: 0, type: 'fixed' }],
  },
  {
    id: 'pair-row',
    label: '2人掛け長机 (横並び)',
    seats: [
      { dx: -0.55, dy: 0, w: 1, h: 1, rotation: 0, type: 'fixed' },
      { dx: 0.55, dy: 0, w: 1, h: 1, rotation: 0, type: 'fixed' },
    ],
  },
  {
    id: 'island-4',
    label: '4人島 (2×2 対面)',
    seats: [
      { dx: -0.55, dy: -0.52, w: 1, h: 1, rotation: 180, type: 'fixed' },
      { dx: 0.55, dy: -0.52, w: 1, h: 1, rotation: 180, type: 'fixed' },
      { dx: -0.55, dy: 0.52, w: 1, h: 1, rotation: 0, type: 'fixed' },
      { dx: 0.55, dy: 0.52, w: 1, h: 1, rotation: 0, type: 'fixed' },
    ],
  },
  {
    id: 'island-6',
    label: '6人島 (3×2 対面)',
    seats: [
      { dx: -1.1, dy: -0.52, w: 1, h: 1, rotation: 180, type: 'fixed' },
      { dx: 0, dy: -0.52, w: 1, h: 1, rotation: 180, type: 'fixed' },
      { dx: 1.1, dy: -0.52, w: 1, h: 1, rotation: 180, type: 'fixed' },
      { dx: -1.1, dy: 0.52, w: 1, h: 1, rotation: 0, type: 'fixed' },
      { dx: 0, dy: 0.52, w: 1, h: 1, rotation: 0, type: 'fixed' },
      { dx: 1.1, dy: 0.52, w: 1, h: 1, rotation: 0, type: 'fixed' },
    ],
  },
  {
    id: 'meeting-table',
    label: '会議テーブル (横長)',
    seats: [{ dx: 0, dy: 0, w: 3, h: 1.5, rotation: 0, type: 'meeting' }],
  },
];

/**
 * エリア (ゾーン): 図面上の色付き区画 (「OPエリア」等)。座席より背面に描画する。
 * x, y, w, h は図面に対する相対値 (0-1)。color は ZONE_COLORS のキー。
 */
export function createZone(locationId, rect = {}, attrs = {}) {
  return {
    id: uid(),
    locationId,
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.15,
    color: 'blue',
    label: '',
    ...rect,
    ...attrs,
  };
}

/**
 * 座席の表示名を解決する。
 * 優先順: 紐付けメンバーのあだ名/本名 → seat.name (直接入力) → '' (空席)
 * nameMode: 'nickname' (あだ名優先・デフォルト) | 'real' (本名優先)
 */
export function seatDisplayName(seat, member, nameMode = 'nickname') {
  if (member) {
    if (nameMode === 'real') return member.name || member.nickname || '';
    return member.nickname || member.name || '';
  }
  return seat?.name ?? '';
}

export const SEAT_TYPES = [
  { value: 'fixed', label: '固定席' },
  { value: 'free', label: 'フリーアドレス' },
  { value: 'meeting', label: '会議席' },
  { value: 'other', label: 'その他' },
];

export function seatTypeLabel(type) {
  return SEAT_TYPES.find((t) => t.value === type)?.label ?? type;
}

// 図面なしの場合の無地キャンバスサイズ
export const BLANK_CANVAS = { width: 1600, height: 1200 };

/**
 * 受信データの正規化 (欠損フィールドの補完)。null なら空データを返す。
 */
export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.locations)) {
    return createEmptyData();
  }
  return {
    version: raw.version ?? DATA_VERSION,
    locations: raw.locations.map((l, i) => ({
      id: l.id ?? uid(),
      name: l.name ?? `拠点${i + 1}`,
      order: l.order ?? i,
      floorImage: l.floorImage ?? null,
      imageWidth: l.imageWidth ?? null,
      imageHeight: l.imageHeight ?? null,
      // 後方互換: 席サイズ倍率 (旧データには無い)
      seatScale: l.seatScale ?? 1,
    })),
    members: (raw.members ?? []).map((m) => createMember(m)),
    seats: (raw.seats ?? []).map((s) => ({
      id: s.id ?? uid(),
      locationId: s.locationId,
      x: typeof s.x === 'number' ? s.x : 0.5,
      y: typeof s.y === 'number' ? s.y : 0.5,
      // 後方互換: 席ごとのサイズ倍率 (旧データには無い → 1)
      w: clampSeatSize(s.w),
      h: clampSeatSize(s.h),
      rotation: s.rotation ?? 0,
      label: s.label ?? '',
      // 後方互換: 既存データに name が無くてもよい (直接入力の名前フィールド)
      name: typeof s.name === 'string' ? s.name : '',
      memberId: s.memberId ?? null,
      type: s.type ?? 'fixed',
    })),
    // 後方互換: エリア (ゾーン) は旧データに無い (2026-06-11 追加)
    zones: (raw.zones ?? []).map((z) => ({
      id: z.id ?? uid(),
      locationId: z.locationId,
      x: typeof z.x === 'number' ? z.x : 0.1,
      y: typeof z.y === 'number' ? z.y : 0.1,
      w: typeof z.w === 'number' ? z.w : 0.2,
      h: typeof z.h === 'number' ? z.h : 0.15,
      color: typeof z.color === 'string' && z.color ? z.color : 'blue',
      label: typeof z.label === 'string' ? z.label : '',
    })),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}
