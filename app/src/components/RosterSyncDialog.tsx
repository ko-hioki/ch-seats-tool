import { useMemo, useState } from 'react';
import { UserMinus, UserPlus, UserPen } from 'lucide-react';
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
import { parseTable, guessMapping, type MemberCsvField } from '@/lib/csv';
import { divisionLabel, resolveDivisionCode, type Division, type Member } from '@/lib/model';

// 名簿同期で扱う列 (メールアドレスが同期キー。他は任意)
type RosterField = 'email' | 'name' | 'nickname' | 'division' | 'department' | 'slackUserId';

const FIELDS: { value: RosterField | ''; label: string }[] = [
  { value: '', label: '(取り込まない)' },
  { value: 'email', label: 'メールアドレス (同期キー)' },
  { value: 'name', label: '本名' },
  { value: 'nickname', label: 'あだ名 (ニックネーム)' },
  { value: 'division', label: '事業部' },
  { value: 'department', label: '部署' },
  { value: 'slackUserId', label: 'Slack ユーザー ID' },
];

const FIELD_LABELS: Record<string, string> = {
  name: '本名',
  nickname: 'あだ名',
  division: '事業部',
  department: '部署',
  slackUserId: 'Slack',
  status: '在籍状態',
};

/** 適用内容 (App 側で 1 mutate = Undo 1回 で反映する) */
export interface RosterSyncResult {
  added: Partial<Member>[];
  updates: { id: string; patch: Partial<Member> }[];
  retireIds: string[];
}

interface FieldChange {
  field: string;
  before: string;
  after: string;
}

interface UpdateItem {
  member: Member;
  patch: Partial<Member>;
  changes: FieldChange[];
}

interface RosterSyncDialogProps {
  open: boolean;
  members: Member[];
  divisions: Division[];
  existingNames: string[];
  onClose: () => void;
  onApply: (result: RosterSyncResult) => void;
}

const normEmail = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * 社員名簿 (スプレッドシート) との差分同期ダイアログ。
 * 名簿を貼り付け → 列マッピング (メールアドレス必須=キー) → 差分プレビュー → 適用。
 * - 新規: 台帳に無い email → メンバーを追加
 * - 更新: email 一致で名簿由来フィールド (本名・あだ名・事業部・部署・Slack・在籍状態) に差分がある人だけ反映
 *   (アイコン・メモ・席の紐付けは保持)
 * - 名簿にいない: 「退職にする」or「そのまま残す」を選択 (勝手に削除しない)。email 未設定のメンバーは対象外
 */
export default function RosterSyncDialog({
  open,
  members,
  divisions,
  existingNames,
  onClose,
  onApply,
}: RosterSyncDialogProps) {
  const [step, setStep] = useState<'paste' | 'map' | 'confirm'>('paste');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<(RosterField | '')[]>([]);
  // 「名簿にいない」メンバーのうち退職にする人の id (デフォルトは「そのまま残す」)
  const [retireIds, setRetireIds] = useState<Set<string>>(() => new Set());

  function reset() {
    setStep('paste');
    setText('');
    setRows([]);
    setMapping([]);
    setRetireIds(new Set());
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
    // 既存の列推定を再利用 (メモは名簿同期の対象外なので落とす)
    const guessed = guessMapping(parsed[0]).map((g): RosterField | '' =>
      g === 'note' ? '' : (g as Exclude<MemberCsvField, 'note'>)
    );
    const looksLikeHeader = guessed.some((g) => g !== '');
    setHasHeader(looksLikeHeader);
    setMapping(looksLikeHeader ? guessed : parsed[0].map(() => ''));
    setStep('map');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setText(await file.text());
  }

  const dataRows = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader]);
  const colCount = rows[0]?.length ?? 0;
  const hasEmailColumn = mapping.includes('email');

  // ---- 差分計算 ----
  const diff = useMemo(() => {
    const added: { attrs: Partial<Member>; email: string }[] = [];
    const updates: UpdateItem[] = [];
    let noEmailRows = 0; // email が空の行 (同期できない)
    let dupRows = 0; // 名簿内で email が重複した行 (先勝ち)
    let unchanged = 0;

    if (step !== 'confirm') {
      return { added, updates, missing: [] as Member[], noEmailRows, dupRows, unchanged, noEmailMembers: 0 };
    }

    // ---- 一括追加モード (メール列なし) ----
    if (!hasEmailColumn) {
      const existingNameSet = new Set(existingNames.map((n) => n.trim()));
      for (const row of dataRows) {
        const rec: Partial<Record<RosterField, string>> = {};
        mapping.forEach((field, i) => {
          if (field) rec[field] = (row[i] ?? '').trim();
        });
        const name = (rec.name ?? '').trim();
        const nickname = (rec.nickname ?? '').trim();
        if (!name && !nickname) {
          noEmailRows++;
          continue;
        }
        // 本名の完全一致で重複スキップ
        if (name && existingNameSet.has(name)) continue;
        const attrs: Partial<Member> = { status: 'active' };
        if (rec.name !== undefined) attrs.name = rec.name;
        if (rec.nickname !== undefined) attrs.nickname = rec.nickname;
        if (rec.division !== undefined) attrs.division = resolveDivisionCode(divisions, rec.division);
        if (rec.department !== undefined) attrs.department = rec.department;
        if (rec.slackUserId !== undefined) attrs.slackUserId = rec.slackUserId || null;
        added.push({ attrs, email: '' });
      }
      return { added, updates, missing: [] as Member[], noEmailRows, dupRows, unchanged, noEmailMembers: 0 };
    }

    // ---- 差分同期モード (メール列あり) ----
    const byEmail = new Map<string, Member>();
    for (const m of members) {
      const e = normEmail(m.email);
      if (e && !byEmail.has(e)) byEmail.set(e, m);
    }

    const seenEmails = new Set<string>();
    for (const row of dataRows) {
      const rec: Partial<Record<RosterField, string>> = {};
      mapping.forEach((field, i) => {
        if (field) rec[field] = (row[i] ?? '').trim();
      });
      const email = normEmail(rec.email);
      if (!email) {
        noEmailRows++;
        continue;
      }
      if (seenEmails.has(email)) {
        dupRows++;
        continue;
      }
      seenEmails.add(email);

      const existing = byEmail.get(email);
      if (!existing) {
        // 新規 (台帳に無い email)。名前が全く無い行は登録しようがないのでスキップ
        if (!rec.name && !rec.nickname) {
          noEmailRows++;
          continue;
        }
        const attrs: Partial<Member> = { email, status: 'active' };
        if (rec.name !== undefined) attrs.name = rec.name;
        if (rec.nickname !== undefined) attrs.nickname = rec.nickname;
        if (rec.division !== undefined) attrs.division = resolveDivisionCode(divisions, rec.division);
        if (rec.department !== undefined) attrs.department = rec.department;
        if (rec.slackUserId !== undefined) attrs.slackUserId = rec.slackUserId || null;
        added.push({ attrs, email });
        continue;
      }

      // 更新 (email 一致): マッピングした名簿由来フィールドのみ比較・反映
      const patch: Partial<Member> = {};
      const changes: FieldChange[] = [];
      const compare = (field: 'name' | 'nickname' | 'department', after: string | undefined) => {
        if (after === undefined) return;
        if ((existing[field] ?? '') !== after) {
          patch[field] = after;
          changes.push({ field, before: existing[field] || '(空)', after: after || '(空)' });
        }
      };
      compare('name', rec.name);
      compare('nickname', rec.nickname);
      compare('department', rec.department);
      if (rec.division !== undefined) {
        const resolved = resolveDivisionCode(divisions, rec.division);
        // 名簿側が空 → 未設定に揃える。解決できない文字列は既存値を保持 (勝手に消さない)
        if ((rec.division === '' || resolved !== '') && resolved !== (existing.division ?? '')) {
          patch.division = resolved;
          changes.push({
            field: 'division',
            before: divisionLabel(divisions, existing.division) || '(未設定)',
            after: divisionLabel(divisions, resolved) || '(未設定)',
          });
        }
      }
      if (rec.slackUserId !== undefined && (existing.slackUserId ?? '') !== rec.slackUserId) {
        patch.slackUserId = rec.slackUserId || null;
        changes.push({
          field: 'slackUserId',
          before: existing.slackUserId || '(空)',
          after: rec.slackUserId || '(空)',
        });
      }
      if (existing.status === 'retired') {
        // 名簿に載っている = 在籍に戻す
        patch.status = 'active';
        changes.push({ field: 'status', before: '退職', after: '在籍' });
      }
      if (changes.length > 0) {
        updates.push({ member: existing, patch, changes });
      } else {
        unchanged++;
      }
    }

    // 名簿にいない: email 設定済みの在籍メンバーで貼り付けに存在しない人。
    // email 未設定のメンバーは照合できないため対象外 (件数だけ注記)
    const missing = members.filter(
      (m) => m.status === 'active' && normEmail(m.email) !== '' && !seenEmails.has(normEmail(m.email))
    );
    const noEmailMembers = members.filter((m) => normEmail(m.email) === '').length;

    return { added, updates, missing, noEmailRows, dupRows, unchanged, noEmailMembers };
  }, [step, dataRows, mapping, members, divisions, hasEmailColumn, existingNames]);

  function handleApply() {
    onApply({
      added: diff.added.map((a) => a.attrs),
      updates: diff.updates.map((u) => ({ id: u.member.id, patch: u.patch })),
      retireIds: [...retireIds].filter((id) => diff.missing.some((m) => m.id === id)),
    });
    close();
  }

  const retireCount = diff.missing.filter((m) => retireIds.has(m.id)).length;
  const memberLabel = (m: Member) =>
    (m.nickname || m.name || '(名前なし)') + (m.nickname && m.name ? ` (${m.name})` : '');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {hasEmailColumn ? '名簿から同期 (差分反映)' : '名簿から取り込み (一括追加)'}
          </DialogTitle>
          <DialogDescription>
            社員名簿 (スプレッドシート) を貼り付けると、メールアドレスをキーに差分だけを台帳へ反映します。
            アイコン・メモ・席の紐付けは保持されます。
          </DialogDescription>
        </DialogHeader>

        {step === 'paste' ? (
          <div className="grid gap-3">
            <Textarea
              rows={10}
              placeholder={
                '例 (タブ区切り / カンマ区切り):\n本名\tニックネーム\t事業部\tメールアドレス\t部署\nやまだ太郎\tやまちゃん\tOC事業部\tyamada@example.com\t開発1課'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} className="text-sm" />
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
        ) : null}

        {step === 'map' ? (
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
              <Label>列の対応づけ (メールアドレスが同期キーです)</Label>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: colCount }, (_, i) => (
                  <div key={i} className="grid w-44 gap-1">
                    <span className="truncate text-xs text-muted-foreground">
                      列{i + 1}
                      {hasHeader && rows[0]?.[i] ? `: ${rows[0][i]}` : ''}
                    </span>
                    <Select
                      className="h-8"
                      value={mapping[i] ?? ''}
                      onChange={(e) =>
                        setMapping((m) =>
                          m.map((v, j) => (j === i ? (e.target.value as RosterField | '') : v))
                        )
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
            {!hasEmailColumn ? (
              <p className="text-xs text-muted-foreground">
                メールアドレス列を指定しない場合は、本名の完全一致で重複チェックしながら全行を新規追加します。
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                マッピングした列だけが同期されます (本名・あだ名・事業部・部署・Slack は任意)。
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('paste')}>
                戻る
              </Button>
              <Button onClick={() => setStep('confirm')}>
                次へ ({hasEmailColumn ? '差分の確認' : '追加内容の確認'})
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === 'confirm' ? (
          <div className="grid gap-3">
            {!hasEmailColumn ? (
              <p className="text-xs text-muted-foreground">
                追加モードで動作中 (メール未指定) — 本名の完全一致で重複チェックしながら新規追加します。
              </p>
            ) : null}
            <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
              {/* 新規 */}
              <section className="grid gap-1.5">
                <h3 className="flex items-center gap-1.5 text-sm font-bold">
                  <UserPlus className="h-4 w-4 text-emerald-600" /> {hasEmailColumn ? '新規' : '追加'} ({diff.added.length} 件)
                </h3>
                {diff.added.length > 0 ? (
                  <div className="rounded-md border">
                    {diff.added.map((a, i) => (
                      <div key={i} className="flex items-baseline gap-2 border-t px-2 py-1 text-xs first:border-t-0">
                        <span className="font-medium">
                          {a.attrs.nickname || a.attrs.name}
                          {a.attrs.nickname && a.attrs.name ? (
                            <span className="ml-1 font-normal text-muted-foreground">({a.attrs.name})</span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground">
                          {[divisionLabel(divisions, a.attrs.division), a.attrs.department]
                            .filter(Boolean)
                            .join(' / ')}
                        </span>
                        {a.email ? (
                          <span className="ml-auto font-mono text-muted-foreground">{a.email}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {hasEmailColumn ? 'なし (台帳に無いメールアドレスはありませんでした)' : 'なし (重複なしで追加できる行がありませんでした)'}
                  </p>
                )}
              </section>

              {/* 更新・名簿にいない: メール列ありの場合のみ表示 */}
              {hasEmailColumn ? (
                <>
                  {/* 更新 */}
                  <section className="grid gap-1.5">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold">
                      <UserPen className="h-4 w-4 text-blue-600" /> 更新 ({diff.updates.length} 件)
                    </h3>
                    {diff.updates.length > 0 ? (
                      <div className="rounded-md border">
                        {diff.updates.map((u) => (
                          <div key={u.member.id} className="border-t px-2 py-1 text-xs first:border-t-0">
                            <span className="font-medium">{memberLabel(u.member)}</span>
                            <span className="ml-2 text-muted-foreground">
                              {u.changes
                                .map((c) => `${FIELD_LABELS[c.field] ?? c.field}: ${c.before} → ${c.after}`)
                                .join(' / ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">なし (変更のあるメンバーはいませんでした)</p>
                    )}
                    {diff.unchanged > 0 ? (
                      <p className="text-xs text-muted-foreground">変更なし: {diff.unchanged} 件</p>
                    ) : null}
                  </section>

                  {/* 名簿にいない */}
                  <section className="grid gap-1.5">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold">
                      <UserMinus className="h-4 w-4 text-red-600" /> 名簿にいない ({diff.missing.length} 件)
                    </h3>
                    {diff.missing.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">一括選択:</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setRetireIds(new Set(diff.missing.map((m) => m.id)))}
                          >
                            すべて退職にする
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setRetireIds(new Set())}
                          >
                            すべてそのまま残す
                          </Button>
                        </div>
                        <div className="rounded-md border">
                          {diff.missing.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 border-t px-2 py-1 text-xs first:border-t-0"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium">{memberLabel(m)}</span>
                                <span className="ml-2 font-mono text-muted-foreground">{m.email}</span>
                              </span>
                              <Select
                                className="h-7 w-36 text-xs"
                                value={retireIds.has(m.id) ? 'retire' : 'keep'}
                                onChange={(e) =>
                                  setRetireIds((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.value === 'retire') next.add(m.id);
                                    else next.delete(m.id);
                                    return next;
                                  })
                                }
                              >
                                <option value="keep">そのまま残す</option>
                                <option value="retire">退職にする</option>
                              </Select>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          「退職にする」を選んでもメンバーは削除されません (台帳一覧でデフォルト非表示になり、席に紐付いたままの場合は警告表示)。
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">なし</p>
                    )}
                    {diff.noEmailMembers > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        ※ メールアドレス未設定のメンバー {diff.noEmailMembers} 人は照合できないため同期対象外です。
                      </p>
                    ) : null}
                  </section>
                </>
              ) : null}
            </div>

            {diff.noEmailRows > 0 || diff.dupRows > 0 ? (
              <p className="text-xs text-muted-foreground">
                {diff.noEmailRows > 0 ? `読み飛ばした行: ${diff.noEmailRows} 件` : ''}
                {diff.noEmailRows > 0 && diff.dupRows > 0 ? ' / ' : ''}
                {diff.dupRows > 0 ? `名簿内のメール重複 (先勝ち): ${diff.dupRows} 件` : ''}
              </p>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('map')}>
                戻る
              </Button>
              <Button
                onClick={handleApply}
                disabled={diff.added.length + diff.updates.length + retireCount === 0}
              >
                {hasEmailColumn
                  ? `適用 (新規${diff.added.length}・更新${diff.updates.length}・退職${retireCount})`
                  : `追加 (${diff.added.length} 件)`}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
