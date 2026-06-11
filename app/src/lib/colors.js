// 部署/チームごとの色分け
// 部署名から決定的に色を割り当てる (パレットから順に、足りなければハッシュ)

const PALETTE = [
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

const NO_DEPT = { bg: '#f1f5f9', border: '#94a3b8', text: '#334155' };

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 全部署一覧から色マップを作る (一覧順で安定割り当て)
 * @param {string[]} departments
 * @returns {Map<string, {bg: string, border: string, text: string}>}
 */
export function buildDepartmentColorMap(departments) {
  const uniq = [...new Set(departments.filter(Boolean))].sort();
  const map = new Map();
  uniq.forEach((dept, i) => {
    map.set(dept, i < PALETTE.length ? PALETTE[i] : PALETTE[hashString(dept) % PALETTE.length]);
  });
  return map;
}

export function departmentColor(colorMap, department) {
  if (!department) return NO_DEPT;
  return colorMap.get(department) ?? NO_DEPT;
}

// エリア (ゾーン) のプリセットカラー (半透明塗り + 枠 + ラベル文字色)
export const ZONE_COLORS = [
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

export function zoneColor(key) {
  return ZONE_COLORS.find((c) => c.key === key) ?? ZONE_COLORS[0];
}
