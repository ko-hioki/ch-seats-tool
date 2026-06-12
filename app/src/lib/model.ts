// データモデル定義とユーティリティ

export const DATA_VERSION = 1;

// ---- ドメイン型 (spec.md「データ構造」参照) ----

export type SeatType = 'fixed' | 'free' | 'meeting' | 'other';

export interface AppData {
  version: number;
  locations: Location[];
  members: Member[];
  seats: Seat[];
  /** エリア (ゾーン)。2026-06-11 追加。欠損時は [] として正規化 (後方互換) */
  zones: Zone[];
  /** ISO8601 */
  updatedAt: string;
}

export interface Location {
  id: string;
  name: string;
  order: number;
  /** フロア図面 (dataURL)。無地キャンバスの場合は null */
  floorImage: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** 席表示倍率 0.4〜2.0 (2026-06-11 追加。欠損時は 1 として正規化) */
  seatScale: number;
}

export interface Member {
  id: string;
  /** 本名 */
  name: string;
  /** あだ名 (表示名) */
  nickname: string;
  /** 部署/チーム (色分けキー) */
  department: string;
  /** 小さく縮小したアイコン (dataURL) */
  icon: string | null;
  /** Slack DM リンク用 (任意) */
  slackUserId: string | null;
  note: string;
}

export interface Seat {
  id: string;
  locationId: string;
  /** 図面上の相対座標 (0-1) */
  x: number;
  y: number;
  /** 席ユニット単位のサイズ倍率 0.5〜6.0 (2026-06-11 追加。欠損時は 1 として正規化) */
  w: number;
  h: number;
  /** 度 */
  rotation: number;
  /** 席番号など (任意) */
  label: string;
  /** 直書きの名前 (メンバー登録不要の主役フィールド) */
  name: string;
  /** 台帳メンバーとの紐付け (任意)。紐付け時は表示名・色分け・詳細が台帳から解決される */
  memberId: string | null;
  type: SeatType;
}

export interface Zone {
  id: string;
  locationId: string;
  /** 図面上の相対座標・サイズ (0-1) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** プリセットカラーのキー (lib/colors.ts の ZONE_COLORS。12 色・半透明) */
  color: string;
  /** エリア名 (例: "OPエリア") */
  label: string;
}

/** 机テンプレートの席 1 つ分の定義 (dx/dy は席ユニット単位のオフセット) */
export interface SeatTemplateSeat {
  dx: number;
  dy: number;
  w: number;
  h: number;
  rotation: number;
  type: SeatType;
}

export interface SeatTemplate {
  id: string;
  label: string;
  seats: SeatTemplateSeat[];
}

/** 座席の表示名モード: あだ名優先 (デフォルト) | 本名優先 */
export type NameMode = 'nickname' | 'real';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function createEmptyData(): AppData {
  return {
    version: DATA_VERSION,
    locations: [],
    members: [],
    seats: [],
    zones: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createLocation(name: string, order: number): Location {
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

export function createMember(attrs: Partial<Member> = {}): Member {
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

export function createSeat(
  locationId: string,
  x: number,
  y: number,
  attrs: Partial<Seat> = {}
): Seat {
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

export function clampSeatSize(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
    ? Math.min(SEAT_SIZE_MAX, Math.max(SEAT_SIZE_MIN, v))
    : 1;
}

/**
 * 机テンプレート: クリック位置を中心に一式配置する席セットの定義。
 * dx は席ユニット幅 (seatW)、dy は席ユニット高さ (seatH = seatW×0.62) 単位のオフセット。
 * 対面島は上段を 180° 回転して向かい合わせにする。
 */
export const SEAT_TEMPLATES: SeatTemplate[] = [
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
export function createZone(
  locationId: string,
  rect: Partial<Pick<Zone, 'x' | 'y' | 'w' | 'h'>> = {},
  attrs: Partial<Zone> = {}
): Zone {
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
export function seatDisplayName(
  seat: Seat | null | undefined,
  member: Member | null | undefined,
  nameMode: NameMode = 'nickname'
): string {
  if (member) {
    if (nameMode === 'real') return member.name || member.nickname || '';
    return member.nickname || member.name || '';
  }
  return seat?.name ?? '';
}

export const SEAT_TYPES: { value: SeatType; label: string }[] = [
  { value: 'fixed', label: '固定席' },
  { value: 'free', label: 'フリーアドレス' },
  { value: 'meeting', label: '会議席' },
  { value: 'other', label: 'その他' },
];

export function seatTypeLabel(type: SeatType): string {
  return SEAT_TYPES.find((t) => t.value === type)?.label ?? type;
}

// 図面なしの場合の無地キャンバスサイズ
export const BLANK_CANVAS = { width: 1600, height: 1200 };

/**
 * 受信データの正規化 (欠損フィールドの補完)。null なら空データを返す。
 */
export function normalizeData(raw: unknown): AppData {
  const r = raw as
    | (Omit<Partial<AppData>, 'locations' | 'members' | 'seats' | 'zones'> & {
        locations?: Partial<Location>[];
        members?: Partial<Member>[];
        seats?: Partial<Seat>[];
        zones?: Partial<Zone>[];
      })
    | null
    | undefined;
  if (!r || typeof r !== 'object' || !Array.isArray(r.locations)) {
    return createEmptyData();
  }
  return {
    version: r.version ?? DATA_VERSION,
    locations: r.locations.map((l, i) => ({
      id: l.id ?? uid(),
      name: l.name ?? `拠点${i + 1}`,
      order: l.order ?? i,
      floorImage: l.floorImage ?? null,
      imageWidth: l.imageWidth ?? null,
      imageHeight: l.imageHeight ?? null,
      // 後方互換: 席サイズ倍率 (旧データには無い)
      seatScale: l.seatScale ?? 1,
    })),
    members: (r.members ?? []).map((m) => createMember(m)),
    seats: (r.seats ?? []).map((s) => ({
      id: s.id ?? uid(),
      locationId: s.locationId as string,
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
    zones: (r.zones ?? []).map((z) => ({
      id: z.id ?? uid(),
      locationId: z.locationId as string,
      x: typeof z.x === 'number' ? z.x : 0.1,
      y: typeof z.y === 'number' ? z.y : 0.1,
      w: typeof z.w === 'number' ? z.w : 0.2,
      h: typeof z.h === 'number' ? z.h : 0.15,
      color: typeof z.color === 'string' && z.color ? z.color : 'blue',
      label: typeof z.label === 'string' ? z.label : '',
    })),
    updatedAt: r.updatedAt ?? new Date().toISOString(),
  };
}
