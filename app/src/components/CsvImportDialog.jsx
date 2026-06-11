import { useMemo, useState } from 'react';
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

// 列のマッピング先
const FIELDS = [
  { value: '', label: '(取り込まない)' },
  { value: 'name', label: '本名' },
  { value: 'nickname', label: 'あだ名' },
  { value: 'department', label: '部署/チーム' },
  { value: 'slackUserId', label: 'Slack ユーザー ID' },
  { value: 'note', label: 'メモ' },
];

const FIELD_LABELS = Object.fromEntries(FIELDS.map((f) => [f.value, f.label]));

/**
 * 社員名簿 (スプレッドシート貼り付け / CSV) の一括取り込みダイアログ。
 * 貼り付け → 列マッピング指定 → プレビュー → 取り込み の汎用フロー。
 */
export default function CsvImportDialog({ open, onClose, onImport, existingNames }) {
  const [step, setStep] = useState('paste'); // 'paste' | 'map'
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState([]);
  const [skipDup, setSkipDup] = useState(true);

  function reset() {
    setStep('paste');
    setText('');
    setRows([]);
    setMapping([]);
  }

  function close() {
    reset();
    onClose();
  }

  function handleParse() {
    const parsed = parseTable(text);
    if (parsed.length === 0) {
      alert('データが読み取れませんでした。スプレッドシートの範囲をコピーして貼り付けてください。');
      return;
    }
    setRows(parsed);
    const headerLike = parsed[0];
    const guessed = guessMapping(headerLike);
    const looksLikeHeader = guessed.some((g) => g !== '');
    setHasHeader(looksLikeHeader);
    setMapping(looksLikeHeader ? guessed : headerLike.map(() => ''));
    setStep('map');
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setText(await file.text());
  }

  const dataRows = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader]);
  const colCount = rows[0]?.length ?? 0;

  const { candidates, skipped } = useMemo(() => {
    if (step !== 'map') return { candidates: [], skipped: 0 };
    const nameIdx = mapping.indexOf('name');
    const existing = new Set((existingNames ?? []).map((n) => n.trim()));
    const list = [];
    let skippedCount = 0;
    for (const row of dataRows) {
      const attrs = {};
      mapping.forEach((field, i) => {
        if (field) attrs[field] = (row[i] ?? '').trim();
      });
      if (!attrs.name && !attrs.nickname) continue; // 名前が無い行はスキップ
      if (skipDup && nameIdx >= 0 && attrs.name && existing.has(attrs.name)) {
        skippedCount++;
        continue;
      }
      list.push(attrs);
    }
    return { candidates: list, skipped: skippedCount };
  }, [step, dataRows, mapping, skipDup, existingNames]);

  function handleImport() {
    if (candidates.length === 0) {
      alert('取り込めるデータがありません。列マッピングで「本名」を指定してください。');
      return;
    }
    onImport(candidates);
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>名簿の一括取り込み</DialogTitle>
          <DialogDescription>
            スプレッドシートの範囲をコピーして貼り付けるか、CSV ファイルを選択してください。
          </DialogDescription>
        </DialogHeader>

        {step === 'paste' ? (
          <div className="grid gap-3">
            <Textarea
              rows={10}
              placeholder={'例 (タブ区切り / カンマ区切り):\n氏名\t部署\nやまだ太郎\t開発部\nすずき花子\t総務部'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv"
                onChange={onFile}
                className="text-sm"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                キャンセル
              </Button>
              <Button onClick={handleParse} disabled={!text.trim()}>
                次へ (列の対応づけ)
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
              />
              1 行目はヘッダー行 (取り込まない)
            </label>
            <div className="grid gap-2">
              <Label>列の対応づけ</Label>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: colCount }, (_, i) => (
                  <div key={i} className="grid w-40 gap-1">
                    <span className="truncate text-xs text-muted-foreground">
                      列{i + 1}
                      {hasHeader && rows[0]?.[i] ? `: ${rows[0][i]}` : ''}
                    </span>
                    <Select
                      className="h-8"
                      value={mapping[i] ?? ''}
                      onChange={(e) =>
                        setMapping((m) => m.map((v, j) => (j === i ? e.target.value : v)))
                      }
                    >
                      {FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={skipDup}
                onChange={(e) => setSkipDup(e.target.checked)}
              />
              既存メンバーと同じ本名の行はスキップする
            </label>
            <div className="grid gap-1">
              <Label>プレビュー (先頭 10 件)</Label>
              <div className="max-h-48 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {['name', 'nickname', 'department', 'slackUserId', 'note']
                        .filter((f) => mapping.includes(f))
                        .map((f) => (
                          <th key={f} className="px-2 py-1.5 text-left font-medium">
                            {FIELD_LABELS[f]}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.slice(0, 10).map((c, i) => (
                      <tr key={i} className="border-t">
                        {['name', 'nickname', 'department', 'slackUserId', 'note']
                          .filter((f) => mapping.includes(f))
                          .map((f) => (
                            <td key={f} className="px-2 py-1">
                              {c[f] ?? ''}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                取り込み対象: {candidates.length} 件
                {skipped > 0 ? ` / 同名スキップ: ${skipped} 件` : ''}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('paste')}>
                戻る
              </Button>
              <Button onClick={handleImport}>取り込む ({candidates.length} 件)</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
