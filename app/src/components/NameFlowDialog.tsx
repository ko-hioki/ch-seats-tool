import { useMemo, useState } from 'react';
import { ListOrdered } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { parseTable, guessMapping } from '@/lib/csv';

/** 流し込みの 1 エントリ */
export interface FlowEntry {
  name: string;
  department?: string;
}

interface NameFlowDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (entries: FlowEntry[], registerToLedger: boolean) => void;
}

/**
 * 名前リスト流し込みモードの開始ダイアログ。
 * - 改行区切りの名前リスト: 従来どおり名前のみを順に割り当てる
 * - スプレッドシートの複数列貼り付け: 名前列/部署列を推定して同時に取り込める。
 *   部署列を選ぶと「台帳にも登録して部署色分けを有効化」を選択できる。
 * onStart には [{name, department?}] と registerToLedger フラグを渡す。
 */
export default function NameFlowDialog({ open, onClose, onStart }: NameFlowDialogProps) {
  const [text, setText] = useState('');
  const [nameColSel, setNameColSel] = useState<number | null>(null); // null = 推定値を使用
  const [deptColSel, setDeptColSel] = useState<number | null>(null); // null = 推定値 / -1 = 使わない
  const [register, setRegister] = useState(true);

  const parsed = useMemo(() => {
    const rows = parseTable(text);
    const multiCol = rows.some((r) => r.length > 1);
    if (!multiCol) {
      return { multiCol: false, rows, dataRows: rows, hasHeader: false, guessedName: 0, guessedDept: -1 };
    }
    const guessed = guessMapping(rows[0] ?? []);
    const hasHeader = guessed.some((g) => g !== '');
    const gi = guessed.indexOf('name');
    const di = guessed.indexOf('department');
    return {
      multiCol: true,
      rows,
      dataRows: hasHeader ? rows.slice(1) : rows,
      hasHeader,
      guessedName: gi >= 0 ? gi : 0,
      guessedDept: di,
    };
  }, [text]);

  const colCount = parsed.rows[0]?.length ?? 0;
  const nameCol = Math.min(nameColSel ?? parsed.guessedName, Math.max(0, colCount - 1));
  const deptColRaw = deptColSel ?? parsed.guessedDept;
  const deptCol = deptColRaw >= colCount ? -1 : deptColRaw;

  const entries = useMemo<FlowEntry[]>(() => {
    if (!parsed.multiCol) {
      return parsed.rows
        .map((r) => ({ name: (r[0] ?? '').trim() }))
        .filter((e) => e.name);
    }
    return parsed.dataRows
      .map((r) => {
        const name = (r[nameCol] ?? '').trim();
        const department = deptCol >= 0 ? (r[deptCol] ?? '').trim() : '';
        return department ? { name, department } : { name };
      })
      .filter((e) => e.name);
  }, [parsed, nameCol, deptCol]);

  function reset() {
    setText('');
    setNameColSel(null);
    setDeptColSel(null);
    setRegister(true);
  }

  function handleStart() {
    if (entries.length === 0) return;
    onStart(entries, parsed.multiCol && deptCol >= 0 && register);
    reset();
  }

  const colLabel = (i: number) =>
    `列${i + 1}${parsed.hasHeader && parsed.rows[0]?.[i] ? `: ${parsed.rows[0][i]}` : ''}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>名前リストの流し込み</DialogTitle>
          <DialogDescription>
            名簿などから名前リスト (改行区切り) やスプレッドシートの範囲 (名前・部署の列) を貼り付けて「流し込み開始」を押し、図面上の席または空き場所を順にクリックすると、先頭から順に名前が割り当てられます。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={8}
          placeholder={'山田太郎\n佐藤花子\n鈴木一郎\n…\n(スプレッドシートの複数列貼り付けにも対応)'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-sm"
        />
        {parsed.multiCol ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <div className="grid w-44 gap-1">
                <Label className="text-xs">名前列</Label>
                <Select
                  className="h-8"
                  value={String(nameCol)}
                  onChange={(e) => setNameColSel(Number(e.target.value))}
                >
                  {Array.from({ length: colCount }, (_, i) => (
                    <option key={i} value={i}>
                      {colLabel(i)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid w-44 gap-1">
                <Label className="text-xs">部署列 (任意)</Label>
                <Select
                  className="h-8"
                  value={String(deptCol)}
                  onChange={(e) => setDeptColSel(Number(e.target.value))}
                >
                  <option value={-1}>(使わない)</option>
                  {Array.from({ length: colCount }, (_, i) => (
                    <option key={i} value={i}>
                      {colLabel(i)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {entries.length > 0 ? (
              <div className="max-h-36 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">名前</th>
                      {deptCol >= 0 ? (
                        <th className="px-2 py-1.5 text-left font-medium">部署</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.slice(0, 5).map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{e.name}</td>
                        {deptCol >= 0 ? <td className="px-2 py-1">{e.department ?? ''}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {deptCol >= 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={register}
                  onChange={(e) => setRegister(e.target.checked)}
                />
                台帳にも登録して部署色分けを有効化
              </label>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">{entries.length} 件の名前</span>
          <Button onClick={handleStart} disabled={entries.length === 0}>
            <ListOrdered /> 流し込み開始
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
