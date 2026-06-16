// 事業部/部署ごとの色分け
// 色のキーは「事業部コード (設定時) → 部署名 (フォールバック)」(lib/model.ts の memberColorKey)。
// キー文字列から決定的に色を割り当てる (パレットから順に、足りなければハッシュ)

export interface DepartmentColor {
  bg: string;
  border: string;
  text: string;
}

const PALETTE: DepartmentColor[] = [
  { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }, // blue
  { bg: '#dcfce7', border: '#22c55e', text: '#166534' }, // green
  { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }, // amber
  { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' }, // pink
  { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' }, // violet
  { bg: '#cffafe', border: '#06b6d4', text: '#155e75' }, // cyan
  { bg: '#ffedd5', border: '#f97316', text: '#9a3412' }, // orange
  { bg: '#ecfccb', border: '#84cc16', text: '#3f6212' }, // lime
  { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }, // red
  { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' }, // indigo
  { bg: '#f5f5f4', border: '#78716c', text: '#44403c' }, // stone
  { bg: '#ccfbf1', border: '#14b8a6', text: '#115e59' }, // teal
];

/** 名前付きパレット (事業部カラー選択 UI 用)。PALETTE と同一順・同一色値 (2026-06-15 追加) */
export interface NamedPaletteEntry {
  key: string;
  label: string;
  color: DepartmentColor;
}

export const NAMED_PALETTE: NamedPaletteEntry[] = [
  { key: 'blue',   label: 'ブルー',     color: PALETTE[0]  },
  { key: 'green',  label: 'グリーン',   color: PALETTE[1]  },
  { key: 'amber',  label: 'アンバー',   color: PALETTE[2]  },
  { key: 'pink',   label: 'ピンク',     color: PALETTE[3]  },
  { key: 'purple', label: 'パープル',   color: PALETTE[4]  },
  { key: 'cyan',   label: 'シアン',     color: PALETTE[5]  },
  { key: 'orange', label: 'オレンジ',   color: PALETTE[6]  },
  { key: 'lime',   label: 'ライム',     color: PALETTE[7]  },
  { key: 'red',    label: 'レッド',     color: PALETTE[8]  },
  { key: 'indigo', label: 'インディゴ', color: PALETTE[9]  },
  { key: 'stone',  label: 'グレー',     color: PALETTE[10] },
  { key: 'teal',   label: 'ティール',   color: PALETTE[11] },
];

/** パレットキー → DepartmentColor。存在しないキーは undefined */
export function paletteColorByKey(key: string): DepartmentColor | undefined {
  return NAMED_PALETTE.find((e) => e.key === key)?.color;
}

/**
 * hex 文字列 ('#rrggbb') かどうかを判定する。
 * 後方互換: パレットキー ('blue' 等) と区別するために使う (2026-06-15 追加)。
 */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * hex 文字列 ('#rrggbb') から DepartmentColor を導出する (2026-06-15 追加)。
 * - border: 指定 hex そのまま
 * - bg: 指定色を白 (255,255,255) と 15% で合成した淡色
 * - text: 指定色を HSL で明度を大幅に下げた暗色 (座席の淡い bg に乗っても読める)
 */
export function colorFromHex(hex: string): DepartmentColor {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // bg: 白と 15% ブレンド (白: 85%, 指定色: 15%)
  const bgR = Math.round(255 * 0.85 + r * 0.15);
  const bgG = Math.round(255 * 0.85 + g * 0.15);
  const bgB = Math.round(255 * 0.85 + b * 0.15);
  const bg = `rgb(${bgR},${bgG},${bgB})`;

  // text: HSL に変換して明度を 25% 程度まで下げた暗色
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : Math.round((delta / max) * 100);
  const text = `hsl(${h},${s}%,25%)`;

  return { bg, border: hex, text };
}

/**
 * Division.color の値 (hex '#rrggbb' またはパレットキー 'blue' 等) から DepartmentColor を解決する。
 * 未指定 (undefined/空) の場合は undefined を返す (呼び出し側で自動割り当てにフォールバック)。
 * (2026-06-15 追加)
 */
export function resolveColorValue(value: string | undefined): DepartmentColor | undefined {
  if (!value) return undefined;
  if (isHexColor(value)) return colorFromHex(value);
  return paletteColorByKey(value);
}

const NO_DEPT: DepartmentColor = { bg: '#f1f5f9', border: '#94a3b8', text: '#334155' };

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 全部署一覧から色マップを作る (一覧順で安定割り当て)。
 * overrides: key → パレットキー または hex 文字列 '#rrggbb' のマップ。
 * 指定されたキーはそのパレット色 (またはhex導出色) を使う。
 * overrides を持たないキーは PALETTE の順序に従った自動割り当て (既存挙動と同一)。
 * (2026-06-15: hex 文字列対応を追加)
 */
export function buildDepartmentColorMap(
  departments: string[],
  overrides?: Map<string, string>
): Map<string, DepartmentColor> {
  const uniq = [...new Set(departments.filter(Boolean))].sort();
  const map = new Map<string, DepartmentColor>();
  let autoIndex = 0;
  uniq.forEach((dept) => {
    const overrideKey = overrides?.get(dept);
    if (overrideKey) {
      const c = resolveColorValue(overrideKey);
      map.set(dept, c ?? PALETTE[hashString(dept) % PALETTE.length]);
    } else {
      const i = autoIndex++;
      map.set(dept, i < PALETTE.length ? PALETTE[i] : PALETTE[hashString(dept) % PALETTE.length]);
    }
  });
  return map;
}

export function departmentColor(
  colorMap: Map<string, DepartmentColor>,
  department: string | null | undefined
): DepartmentColor {
  if (!department) return NO_DEPT;
  return colorMap.get(department) ?? NO_DEPT;
}

export interface ZoneColor {
  key: string;
  label: string;
  fill: string;
  border: string;
  text: string;
}

// エリア (ゾーン) のプリセットカラー (半透明塗り + 枠 + ラベル文字色)
export const ZONE_COLORS: ZoneColor[] = [
  { key: 'blue', label: 'ブルー', fill: 'rgba(59, 130, 246, 0.16)', border: 'rgba(37, 99, 235, 0.55)', text: '#1d4ed8' },
  { key: 'green', label: 'グリーン', fill: 'rgba(34, 197, 94, 0.16)', border: 'rgba(22, 163, 74, 0.55)', text: '#15803d' },
  { key: 'amber', label: 'アンバー', fill: 'rgba(245, 158, 11, 0.18)', border: 'rgba(217, 119, 6, 0.55)', text: '#b45309' },
  { key: 'orange', label: 'オレンジ', fill: 'rgba(249, 115, 22, 0.16)', border: 'rgba(234, 88, 12, 0.55)', text: '#c2410c' },
  { key: 'red', label: 'レッド', fill: 'rgba(239, 68, 68, 0.14)', border: 'rgba(220, 38, 38, 0.55)', text: '#b91c1c' },
  { key: 'pink', label: 'ピンク', fill: 'rgba(236, 72, 153, 0.14)', border: 'rgba(219, 39, 119, 0.55)', text: '#be185d' },
  { key: 'violet', label: 'バイオレット', fill: 'rgba(139, 92, 246, 0.15)', border: 'rgba(124, 58, 237, 0.55)', text: '#6d28d9' },
  { key: 'cyan', label: 'シアン', fill: 'rgba(6, 182, 212, 0.16)', border: 'rgba(8, 145, 178, 0.55)', text: '#0e7490' },
  { key: 'teal', label: 'ティール', fill: 'rgba(20, 184, 166, 0.16)', border: 'rgba(13, 148, 136, 0.55)', text: '#0f766e' },
  { key: 'lime', label: 'ライム', fill: 'rgba(132, 204, 22, 0.18)', border: 'rgba(101, 163, 13, 0.55)', text: '#4d7c0f' },
  { key: 'indigo', label: 'インディゴ', fill: 'rgba(99, 102, 241, 0.16)', border: 'rgba(79, 70, 229, 0.55)', text: '#4338ca' },
  { key: 'slate', label: 'グレー', fill: 'rgba(100, 116, 139, 0.15)', border: 'rgba(71, 85, 105, 0.55)', text: '#334155' },
];

export function zoneColor(key: string): ZoneColor {
  return ZONE_COLORS.find((c) => c.key === key) ?? ZONE_COLORS[0];
}
