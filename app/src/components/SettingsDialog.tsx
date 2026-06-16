import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { uid, type Division, type Member } from '@/lib/model';
import { NAMED_PALETTE, isHexColor, resolveColorValue } from '@/lib/colors';

interface SettingsDialogProps {
  open: boolean;
  divisions: Division[];
  members: Member[];
  onClose: () => void;
  onSave: (divisions: Division[]) => void;
}

// 行の編集中はコード重複や空欄も一時的に許容するため、内部 key を別に持つ
interface DivisionRow {
  key: string;
  code: string;
  label: string;
  /** パレットキー。undefined = 自動割り当て */
  color?: string;
}

/**
 * 設定ダイアログ (編集モードの歯車アイコンから)。
 * 事業部リストはツール本体 (zip) にハードコードせず、セッションデータの
 * settings.divisions として保存・編集する (組織変更で zip の再アップロードが不要)。
 * 使用中の事業部を削除してもメンバー側のコードは残り、名称解決できない場合はコードのまま表示される。
 */
/** 一括貼り付けテキストを解析して DivisionRow 配列に変換する */
function parseBulkText(text: string): DivisionRow[] {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      // 最初のタブかスペースで分割 (コードと名称)
      const match = trimmed.match(/^(\S+)[\t ]+(.*)/);
      if (!match) return null;
      const code = match[1].trim();
      const label = match[2].trim();
      if (!code) return null;
      return { key: uid(), code, label };
    })
    .filter((r): r is DivisionRow => r !== null);
}

// スプレッドシート風プリセットカラー (色相×濃淡の 36 色グリッド。2026-06-15 追加)
// 各行: 同じ色相を淡→中→濃の3段階で表現
const PRESET_COLORS: { hex: string; label: string }[] = [
  // 赤
  { hex: '#fca5a5', label: '赤 (淡)' },
  { hex: '#ef4444', label: '赤' },
  { hex: '#991b1b', label: '赤 (濃)' },
  // ピンク
  { hex: '#f9a8d4', label: 'ピンク (淡)' },
  { hex: '#ec4899', label: 'ピンク' },
  { hex: '#9d174d', label: 'ピンク (濃)' },
  // オレンジ
  { hex: '#fdba74', label: 'オレンジ (淡)' },
  { hex: '#f97316', label: 'オレンジ' },
  { hex: '#9a3412', label: 'オレンジ (濃)' },
  // アンバー
  { hex: '#fcd34d', label: 'アンバー (淡)' },
  { hex: '#f59e0b', label: 'アンバー' },
  { hex: '#92400e', label: 'アンバー (濃)' },
  // ライム
  { hex: '#bef264', label: 'ライム (淡)' },
  { hex: '#84cc16', label: 'ライム' },
  { hex: '#3f6212', label: 'ライム (濃)' },
  // グリーン
  { hex: '#86efac', label: 'グリーン (淡)' },
  { hex: '#22c55e', label: 'グリーン' },
  { hex: '#166534', label: 'グリーン (濃)' },
  // ティール
  { hex: '#5eead4', label: 'ティール (淡)' },
  { hex: '#14b8a6', label: 'ティール' },
  { hex: '#115e59', label: 'ティール (濃)' },
  // シアン
  { hex: '#67e8f9', label: 'シアン (淡)' },
  { hex: '#06b6d4', label: 'シアン' },
  { hex: '#155e75', label: 'シアン (濃)' },
  // ブルー
  { hex: '#93c5fd', label: 'ブルー (淡)' },
  { hex: '#3b82f6', label: 'ブルー' },
  { hex: '#1e40af', label: 'ブルー (濃)' },
  // インディゴ
  { hex: '#a5b4fc', label: 'インディゴ (淡)' },
  { hex: '#6366f1', label: 'インディゴ' },
  { hex: '#3730a3', label: 'インディゴ (濃)' },
  // バイオレット
  { hex: '#c4b5fd', label: 'バイオレット (淡)' },
  { hex: '#8b5cf6', label: 'バイオレット' },
  { hex: '#5b21b6', label: 'バイオレット (濃)' },
  // グレー
  { hex: '#cbd5e1', label: 'グレー (淡)' },
  { hex: '#78716c', label: 'グレー' },
  { hex: '#44403c', label: 'グレー (濃)' },
];

// ---- カラーピッカーポップオーバー (inline swatches + カスタム hex。2026-06-15 改訂) ----
function ColorSwatch({ value, onChange }: { value: string | undefined; onChange: (c: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [open]);

  const currentColor = value ? resolveColorValue(value) : undefined;
  // カスタム hex の現在値 (hex の場合はその値、パレットキーの場合はキーの border 色、未指定は #888888)
  const customHexDefault = value && isHexColor(value) ? value : '#888888';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="色を選択"
        className="flex h-7 w-7 items-center justify-center rounded border border-border hover:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={
          currentColor
            ? { backgroundColor: currentColor.bg, borderColor: currentColor.border }
            : { backgroundColor: '#f1f5f9', borderColor: '#94a3b8' }
        }
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="block h-3 w-3 rounded-full"
          style={
            currentColor
              ? { backgroundColor: currentColor.border }
              : { backgroundColor: '#94a3b8' }
          }
        />
      </button>
      {open ? (
        <div className="absolute left-0 top-8 z-50 w-64 rounded-md border bg-white p-2 shadow-md text-slate-900">
          <p className="mb-1.5 text-xs font-medium text-slate-500">色を選択</p>
          {/* プリセットグリッド (6列×6行 = 36色) */}
          <div className="grid grid-cols-6 gap-0.5 mb-1.5">
            {PRESET_COLORS.map((preset) => {
              const isSelected = value === preset.hex;
              return (
                <button
                  key={preset.hex}
                  type="button"
                  title={preset.label}
                  className={`h-7 w-full rounded border hover:scale-110 transition-transform ${isSelected ? 'border-slate-700 ring-1 ring-slate-700' : 'border-transparent'}`}
                  style={{ backgroundColor: preset.hex }}
                  onClick={() => { onChange(preset.hex); setOpen(false); }}
                >
                  <span className="sr-only">{preset.label}</span>
                </button>
              );
            })}
          </div>
          {/* 旧パレットキー (後方互換 / 淡色系) */}
          <p className="mb-1 text-xs text-slate-400">淡色プリセット</p>
          <div className="grid grid-cols-6 gap-0.5 mb-1.5">
            {NAMED_PALETTE.map((entry) => {
              const isSelected = value === entry.key;
              return (
                <button
                  key={entry.key}
                  type="button"
                  title={entry.label}
                  className={`h-7 w-full rounded border hover:scale-110 transition-transform ${isSelected ? 'border-slate-700 ring-1 ring-slate-700' : 'border-transparent'}`}
                  style={{ backgroundColor: entry.color.bg, borderColor: isSelected ? entry.color.border : undefined }}
                  onClick={() => { onChange(entry.key); setOpen(false); }}
                >
                  <span className="sr-only">{entry.label}</span>
                </button>
              );
            })}
          </div>
          {/* 区切り */}
          <div className="border-t my-1.5" />
          {/* カスタム色 + 自動 */}
          <div className="flex items-center gap-1.5">
            {/* 自動 */}
            <button
              type="button"
              title="自動 (パレット順で自動割り当て)"
              className={`flex h-7 items-center justify-center rounded border px-2 text-xs hover:border-slate-500 ${!value ? 'border-slate-700 ring-1 ring-slate-700 font-medium' : 'border-slate-300 text-slate-600'}`}
              style={{ backgroundColor: '#f1f5f9', minWidth: '2.5rem' }}
              onClick={() => { onChange(undefined); setOpen(false); }}
            >
              自動
            </button>
            {/* カスタム hex */}
            <label
              className={`flex h-7 flex-1 cursor-pointer items-center gap-1 rounded border px-1.5 text-xs hover:border-slate-500 ${value && isHexColor(value) ? 'border-slate-700 ring-1 ring-slate-700' : 'border-slate-300'}`}
              title="カスタム色 (クリックしてカラーピッカーを開く)"
            >
              <span
                className="inline-block h-4 w-4 flex-shrink-0 rounded-sm border border-slate-300"
                style={{ backgroundColor: value && isHexColor(value) ? value : customHexDefault }}
              />
              <span className="text-slate-600">カスタム</span>
              <input
                ref={colorInputRef}
                type="color"
                className="sr-only"
                defaultValue={customHexDefault}
                onChange={(e) => {
                  onChange(e.target.value);
                }}
                onBlur={() => setOpen(false)}
              />
            </label>
          </div>
          {/* 現在値ラベル */}
          <p className="mt-1.5 text-xs text-slate-400 truncate">
            {value
              ? (isHexColor(value)
                  ? `カスタム: ${value}`
                  : (NAMED_PALETTE.find((e) => e.key === value)?.label ?? value))
              : '自動'}
          </p>
        </div>
      ) : null}
    </div>
  );
}


export default function SettingsDialog({
  open,
  divisions,
  members,
  onClose,
  onSave,
}: SettingsDialogProps) {
  const [rows, setRows] = useState<DivisionRow[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    if (open) {
      setRows(divisions.map((d) => ({ key: uid(), code: d.code, label: d.label, color: d.color })));
      setBulkOpen(false);
      setBulkText('');
    }
  }, [open, divisions]);

  const bulkParsed = useMemo(() => parseBulkText(bulkText), [bulkText]);

  // 事業部コードごとの使用人数 (削除時の注意喚起用)
  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.division) map.set(m.division, (map.get(m.division) ?? 0) + 1);
    }
    return map;
  }, [members]);

  const setRow = (key: string, patch: Partial<DivisionRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () => setRows((rs) => [...rs, { key: uid(), code: '', label: '' }]);

  const deleteRow = (key: string) => {
    const row = rows.find((r) => r.key === key);
    const used = row ? usage.get(row.code.trim()) ?? 0 : 0;
    if (
      used > 0 &&
      !confirm(
        `この事業部は ${used} 人のメンバーに設定されています。削除してもメンバーのコードは残りますが、名称解決できずコードがそのまま表示されます。削除しますか？`
      )
    ) {
      return;
    }
    setRows((rs) => rs.filter((r) => r.key !== key));
  };

  const moveRow = (key: string, dir: number) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  function handleSave() {
    const cleaned = rows
      .map((r) => ({ code: r.code.trim(), label: r.label.trim(), color: r.color }))
      .filter((r) => r.code !== '' || r.label !== '');
    if (cleaned.some((r) => r.code === '')) {
      alert('コードが空の行があります。コードを入力するか行を削除してください。');
      return;
    }
    const codes = cleaned.map((r) => r.code);
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) {
      alert(`コード「${dup}」が重複しています。コードは一意にしてください。`);
      return;
    }
    onSave(
      cleaned.map((r) => ({
        code: r.code,
        label: r.label || r.code,
        ...(r.color ? { color: r.color } : {}),
      }))
    );
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>
            このセッションのデータとして保存される設定です (ツール本体の再アップロードは不要)。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>事業部リスト ({rows.length} 件)</Label>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus /> 行を追加
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            コードはメンバーに保存される識別子 (色分けキー)、名称は画面表示に使われます。
            使用中の事業部を削除してもメンバーのコードは残ります (名称解決できない場合はコードのまま表示)。
          </p>
          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-xs">
                <tr>
                  <th className="w-8 px-1.5 py-1.5" title="色">色</th>
                  <th className="w-36 px-2 py-1.5 text-left font-medium">コード</th>
                  <th className="px-2 py-1.5 text-left font-medium">名称</th>
                  <th className="w-16 px-2 py-1.5 text-right font-medium">使用</th>
                  <th className="w-28 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const used = usage.get(r.code.trim()) ?? 0;
                  return (
                    <tr key={r.key} className="border-t">
                      <td className="px-1.5 py-1">
                        <ColorSwatch
                          value={r.color}
                          onChange={(c) => setRow(r.key, { color: c })}
                        />
                      </td>
                      <td className="px-1.5 py-1">
                        <Input
                          className="h-8 font-mono text-xs"
                          value={r.code}
                          placeholder="oc_xx"
                          onChange={(e) => setRow(r.key, { code: e.target.value })}
                        />
                      </td>
                      <td className="px-1.5 py-1">
                        <Input
                          className="h-8"
                          value={r.label}
                          placeholder="〇〇事業本部 〇〇事業部"
                          onChange={(e) => setRow(r.key, { label: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground">
                        {used > 0 ? `${used}人` : '-'}
                      </td>
                      <td className="px-1.5 py-1">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="上へ"
                            disabled={i === 0}
                            onClick={() => moveRow(r.key, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="下へ"
                            disabled={i === rows.length - 1}
                            onClick={() => moveRow(r.key, 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="削除"
                            onClick={() => deleteRow(r.key)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-xs text-muted-foreground">
                      事業部がありません。「行を追加」で登録してください (空のままでも保存できます)。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        {/* 一括貼り付けセクション (折りたたみ可能) */}
        <div className="rounded-md border">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium hover:bg-muted/50"
            onClick={() => setBulkOpen((v) => !v)}
          >
            {bulkOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            一括貼り付けで追加 / 置き換え
          </button>
          {bulkOpen ? (
            <div className="grid gap-2 border-t p-3">
              <Textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="font-mono text-xs"
                placeholder={`例:\noc_dev 開発事業部\nsales 営業部\n...(1行1件、コードと名称をスペースまたはタブで区切り)`}
              />
              {bulkText.trim() ? (
                <p className="text-xs text-muted-foreground">
                  解析結果: {bulkParsed.length} 件
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkParsed.length === 0}
                  onClick={() => {
                    setRows((rs) => [...rs, ...bulkParsed]);
                    setBulkText('');
                  }}
                >
                  末尾に追加 ({bulkParsed.length} 件)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={bulkParsed.length === 0}
                  onClick={() => {
                    if (
                      rows.length === 0 ||
                      confirm(`現在の ${rows.length} 件のリストを解析結果 ${bulkParsed.length} 件で置き換えますか？`)
                    ) {
                      setRows(bulkParsed);
                      setBulkText('');
                    }
                  }}
                >
                  置き換え ({bulkParsed.length} 件)
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
