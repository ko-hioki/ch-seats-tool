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
  /** セッションごとの設定 (事業部リスト等)。2026-06-12 追加。欠損時はデフォルトで補完 (後方互換) */
  settings: AppSettings;
  /** ISO8601 */
  updatedAt: string;
}

/** 事業部 (コード保存・名称表示)。リストはセッションデータの settings.divisions で編集可能 */
export interface Division {
  code: string;
  label: string;
  /**
   * 色指定 (2026-06-15 追加・拡張)。
   * - hex 文字列 ('#rrggbb'): 任意色。bg/border/text は colorFromHex() で導出
   * - パレットキー ('blue', 'green' 等): 従来の NAMED_PALETTE から解決 (後方互換)
   * - undefined: 自動割り当て (PALETTE の順序に従う)
   */
  color?: string;
}

/**
 * セッションごとの設定。ツール本体 (zip) は社内の誰でもダウンロードできるため、
 * 組織固有のリスト (事業部等) はコードに埋め込まず、セッションデータ側で編集できるようにする。
 */
export interface AppSettings {
  divisions: Division[];
}

export interface Location {
  id: string;
  name: string;
  order: number;
  /** キャンバス(背景レイヤー)のサイズ。座席相対座標(0-1)の基準 */
  canvasWidth: number;
  canvasHeight: number;
  /** フロア図面 (dataURL)。無地キャンバスの場合は null */
  floorImage: string | null;
  /** 図面の元ピクセル幅(アスペクト比保持用) */
  floorImageWidth: number | null;
  /** 図面の元ピクセル高さ(アスペクト比保持用) */
  floorImageHeight: number | null;
  /**
   * キャンバス上の図面配置。null=図面なし
   * x,y: 図面左上のキャンバス相対座標(0-1基準)
   * scale: 図面を canvasWidth に対してどの倍率で表示するか (1=canvasWidth に幅が一致)
   */
  floorTransform: { x: number; y: number; scale: number } | null;
  /** 席表示倍率 0.4〜2.0 */
  seatScale: number;
}

/** 在籍状態 (2026-06-12 追加。欠損時は 'active' として正規化) */
export type MemberStatus = 'active' | 'retired';

export interface Member {
  id: string;
  /** 本名 */
  name: string;
  /** あだ名 (表示名) */
  nickname: string;
  /** 事業部コード (settings.divisions のコード。'' = 未設定。2026-06-12 追加。欠損時は '' として正規化) */
  division: string;
  /** 部署 (課・チームなど、自由入力) */
  department: string;
  /** メールアドレス (名簿同期のキー。'' = 未設定。2026-06-12 追加。欠損時は '' として正規化) */
  email: string;
  /** 在籍状態 ('retired' は一覧からデフォルト非表示・席に警告表示。2026-06-12 追加) */
  status: MemberStatus;
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
  /** 事業部コードの直接設定 (メンバー紐付けなしでも事業部色で表示。'' = 未設定。2026-06-12 追加) */
  division: string;
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
  /** ラベルのフォントスケール (1 = 基準サイズ。0.5〜3.0。2026-06-12 追加) */
  fontScale: number;
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
    settings: createDefaultSettings(),
    updatedAt: new Date().toISOString(),
  };
}

export function createLocation(name: string, order: number): Location {
  return {
    id: uid(),
    name,
    order,
    canvasWidth: BLANK_CANVAS.width,
    canvasHeight: BLANK_CANVAS.height,
    floorImage: null,
    floorImageWidth: null,
    floorImageHeight: null,
    floorTransform: null,
    seatScale: 1,
  };
}

export function createMember(attrs: Partial<Member> = {}): Member {
  return {
    id: uid(),
    name: '',
    nickname: '',
    division: '',
    department: '',
    email: '',
    status: 'active',
    icon: null,
    slackUserId: null,
    note: '',
    ...attrs,
  };
}

// ---- 事業部 (2026-06-12 追加) ----
// Member.division にはコードを保存し、表示には名称 (label) を使う。'' = 未設定。
// リスト本体はセッションデータの settings.divisions に保存し、設定ダイアログで編集できる
// (組織変更があっても zip の再アップロードが不要)。

/** デフォルト設定 (旧データの補完・新規セッション用)。事業部リストは空配列 */
export function createDefaultSettings(): AppSettings {
  return { divisions: [] };
}

/**
 * 事業部コード → 名称。'' (未設定) は ''。
 * リストに無いコード (削除済みの事業部等) はコードをそのまま返す (名称解決できなくてもデータは壊さない)。
 */
export function divisionLabel(
  divisions: Division[],
  code: string | null | undefined
): string {
  if (!code) return '';
  return divisions.find((d) => d.code === code)?.label ?? code;
}

/**
 * CSV 取り込み等の文字列から事業部コードを解決する。
 * divisions が空なら即 '' を返す。
 * コード完全一致 → 名称完全一致 → 名称部分一致 (一意に決まる場合のみ) の順。
 * 解決できなければ '' (無理に推測しない)。
 */
export function resolveDivisionCode(
  divisions: Division[],
  input: string | null | undefined
): string {
  if (!divisions || divisions.length === 0) return '';
  const v = (input ?? '').trim();
  if (!v) return '';
  const byCode = divisions.find((d) => d.code === v);
  if (byCode) return byCode.code;
  const byLabel = divisions.find((d) => d.label === v);
  if (byLabel) return byLabel.code;
  const partial = divisions.filter((d) => d.label.includes(v));
  if (partial.length === 1) return partial[0].code;
  return '';
}

/**
 * 色分けのグルーピングキー: 事業部 (設定時) → 部署 (フォールバック)。
 * 事業部はコードをキーにする (名称変更で色が変わらないように)。
 */
export function memberColorKey(
  m: Pick<Member, 'division' | 'department'> | null | undefined
): string {
  if (!m) return '';
  return m.division || m.department || '';
}

/** 所属の表示文字列: 事業部名称 (+部署があれば併記)。両方無ければ '' */
export function memberAffiliationLabel(
  divisions: Division[],
  m: Pick<Member, 'division' | 'department'> | null | undefined
): string {
  if (!m) return '';
  return [divisionLabel(divisions, m.division), m.department].filter(Boolean).join(' / ');
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
    division: '',
    ...attrs,
  };
}

// 席サイズ倍率の有効範囲 (席ユニット単位)
export const SEAT_SIZE_MIN = 0.5;
export const SEAT_SIZE_MAX = 6;

// ゾーンラベルのフォントスケールの有効範囲
export const ZONE_FONT_SCALE_MIN = 0.5;
export const ZONE_FONT_SCALE_MAX = 3.0;

export function clampZoneFontScale(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
    ? Math.min(ZONE_FONT_SCALE_MAX, Math.max(ZONE_FONT_SCALE_MIN, v))
    : 1;
}

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
    fontScale: 1,
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
    | (Omit<Partial<AppData>, 'locations' | 'members' | 'seats' | 'zones' | 'settings'> & {
        locations?: any[];
        members?: Partial<Member>[];
        seats?: Partial<Seat>[];
        zones?: Partial<Zone>[];
        settings?: { divisions?: Partial<Division>[] } | null;
      })
    | null
    | undefined;
  if (!r || typeof r !== 'object' || !Array.isArray(r.locations)) {
    return createEmptyData();
  }
  // 後方互換: 設定 (事業部リスト) は旧データに無い (2026-06-12 追加) → 空配列で補完。
  // 配列が存在する場合は空でも尊重する (全削除も編集者の意図とみなす)
  const rawDivisions = Array.isArray(r.settings?.divisions)
    ? r.settings.divisions
        .filter((d) => d && typeof d.code === 'string' && d.code.trim() !== '')
        .map((d) => ({
          code: (d.code as string).trim(),
          label:
            typeof d.label === 'string' && d.label.trim() !== ''
              ? d.label.trim()
              : (d.code as string).trim(),
          // 後方互換: color は旧データに無い (2026-06-15 追加) → undefined のまま
          ...(typeof d.color === 'string' && d.color ? { color: d.color } : {}),
        }))
    : null;
  return {
    version: r.version ?? DATA_VERSION,
    locations: r.locations.map((l: any, i: number) => {
      const oldW = (l as any).imageWidth ?? null;
      const oldH = (l as any).imageHeight ?? null;

      let canvasWidth: number;
      let canvasHeight: number;
      if (typeof l.canvasWidth === 'number' && l.canvasWidth > 0) {
        canvasWidth = l.canvasWidth;
      } else if (typeof oldW === 'number' && oldW > 0) {
        canvasWidth = oldW;
      } else {
        canvasWidth = BLANK_CANVAS.width;
      }
      if (typeof l.canvasHeight === 'number' && l.canvasHeight > 0) {
        canvasHeight = l.canvasHeight;
      } else if (typeof oldH === 'number' && oldH > 0) {
        canvasHeight = oldH;
      } else {
        canvasHeight = BLANK_CANVAS.height;
      }

      let floorTransform: { x: number; y: number; scale: number } | null;
      if (l.floorTransform != null && typeof l.floorTransform === 'object') {
        floorTransform = {
          x: typeof l.floorTransform.x === 'number' ? l.floorTransform.x : 0,
          y: typeof l.floorTransform.y === 'number' ? l.floorTransform.y : 0,
          scale: typeof l.floorTransform.scale === 'number' ? l.floorTransform.scale : 1,
        };
      } else if (l.floorImage) {
        floorTransform = { x: 0, y: 0, scale: 1 };
      } else {
        floorTransform = null;
      }

      const floorImageWidth: number | null =
        typeof l.floorImageWidth === 'number' ? l.floorImageWidth :
        (floorTransform && typeof oldW === 'number' ? oldW : null);
      const floorImageHeight: number | null =
        typeof l.floorImageHeight === 'number' ? l.floorImageHeight :
        (floorTransform && typeof oldH === 'number' ? oldH : null);

      return {
        id: l.id ?? uid(),
        name: l.name ?? `拠点${i + 1}`,
        order: l.order ?? i,
        canvasWidth,
        canvasHeight,
        floorImage: l.floorImage ?? null,
        floorImageWidth,
        floorImageHeight,
        floorTransform,
        // 後方互換: 席サイズ倍率 (旧データには無い)
        seatScale: l.seatScale ?? 1,
      };
    }),
    members: (r.members ?? []).map((m) =>
      // 後方互換: 事業部 (division)・メール (email)・在籍状態 (status) は
      // 旧データに無い (2026-06-12 追加) → ''/'active'
      createMember({
        ...m,
        division: typeof m.division === 'string' ? m.division : '',
        email: typeof m.email === 'string' ? m.email : '',
        status: m.status === 'retired' ? 'retired' : 'active',
      })
    ),
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
      // 後方互換: 事業部直接設定 (旧データには無い)
      division: typeof s.division === 'string' ? s.division : '',
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
      // 後方互換: フォントスケール (旧データには無い)
      fontScale: typeof z.fontScale === 'number' ? z.fontScale : 1,
    })),
    settings: { divisions: rawDivisions ?? createDefaultSettings().divisions },
    updatedAt: r.updatedAt ?? new Date().toISOString(),
  };
}
