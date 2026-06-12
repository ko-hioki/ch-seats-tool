import { useEffect, useMemo, useState } from 'react';
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
      setRows(divisions.map((d) => ({ key: uid(), code: d.code, label: d.label })));
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
      .map((r) => ({ code: r.code.trim(), label: r.label.trim() }))
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
    onSave(cleaned.map((r) => ({ code: r.code, label: r.label || r.code })));
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
                    <td colSpan={4} className="px-2 py-4 text-center text-xs text-muted-foreground">
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
