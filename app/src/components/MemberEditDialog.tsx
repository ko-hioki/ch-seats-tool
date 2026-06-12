import { useEffect, useRef, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { compressIconImage } from '@/lib/image';
import type { Division, Member, MemberStatus } from '@/lib/model';

interface MemberForm {
  name: string;
  nickname: string;
  division: string;
  department: string;
  email: string;
  status: MemberStatus;
  icon: string | null;
  slackUserId: string;
  note: string;
}

type MemberFormTextField = Exclude<keyof MemberForm, 'icon' | 'status'>;

interface MemberEditDialogProps {
  open: boolean;
  member: Member | null;
  divisions: Division[];
  onClose: () => void;
  onSave: (attrs: Partial<Member>) => void;
  onDelete: (id: string) => void;
}

/**
 * メンバーの追加・編集ダイアログ (編集モードの名簿管理用)
 * member が null の場合は新規追加。
 */
export default function MemberEditDialog({
  open,
  member,
  divisions,
  onClose,
  onSave,
  onDelete,
}: MemberEditDialogProps) {
  const [form, setForm] = useState<MemberForm | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = !member?.id;

  useEffect(() => {
    if (open) {
      setForm({
        name: member?.name ?? '',
        nickname: member?.nickname ?? '',
        division: member?.division ?? '',
        department: member?.department ?? '',
        email: member?.email ?? '',
        status: member?.status ?? 'active',
        icon: member?.icon ?? null,
        slackUserId: member?.slackUserId ?? '',
        note: member?.note ?? '',
      });
    }
  }, [open, member]);

  if (!form) return null;

  const set =
    (k: MemberFormTextField) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f!, [k]: e.target.value }));

  async function onIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressIconImage(file);
      setForm((f) => ({ ...f!, icon: dataUrl }));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form?.email.trim() ?? '');

  function handleSave() {
    if (!form!.name.trim() && !form!.nickname.trim()) {
      alert('本名またはあだ名を入力してください');
      return;
    }
    if (!isEmailValid) return;
    onSave({
      ...form!,
      name: form!.name.trim(),
      nickname: form!.nickname.trim(),
      department: form!.department.trim(),
      email: form!.email.trim(),
      slackUserId: form!.slackUserId.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'メンバーを追加' : 'メンバーを編集'}</DialogTitle>
          <DialogDescription>名簿の情報を入力してください。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>本名</Label>
              <Input value={form.name} onChange={set('name')} placeholder="山田 太郎" />
            </div>
            <div className="grid gap-1.5">
              <Label>あだ名</Label>
              <Input value={form.nickname} onChange={set('nickname')} placeholder="表示名(ニックネーム)" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>事業部</Label>
            <Select
              value={form.division}
              onChange={(e) => setForm((f) => ({ ...f!, division: e.target.value }))}
            >
              <option value="">(未設定)</option>
              {divisions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
              {form.division && !divisions.some((d) => d.code === form.division) ? (
                // リストから削除済みの事業部コードが設定されている場合もコードのまま保持する
                <option value={form.division}>{form.division} (リストに無いコード)</option>
              ) : null}
            </Select>
            {divisions.length === 0 ? (
              <p className="text-xs text-muted-foreground">「設定」から事業部リストを登録できます</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>部署</Label>
            <Input value={form.department} onChange={set('department')} placeholder="課・チームなど" />
          </div>
          <div className="grid gap-1.5">
            <Label>メールアドレス *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="yamada-taro@example.com"
            />
            {!isEmailValid ? (
              <p className="text-xs text-destructive">有効なメールアドレスを入力してください</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                「名簿から同期」はこのメールアドレスで本人を照合します。
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>在籍状態</Label>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="member-status"
                  checked={form.status === 'active'}
                  onChange={() => setForm((f) => ({ ...f!, status: 'active' }))}
                />
                在籍
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="member-status"
                  checked={form.status === 'retired'}
                  onChange={() => setForm((f) => ({ ...f!, status: 'retired' }))}
                />
                退職
              </label>
            </div>
            {form.status === 'retired' ? (
              <p className="text-xs text-muted-foreground">
                退職メンバーは台帳一覧でデフォルト非表示になり、席に紐付いたままの場合は警告表示されます。
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label>アイコン画像</Label>
            <div className="flex items-center gap-2">
              {form.icon ? (
                <img src={form.icon} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                  なし
                </span>
              )}
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload /> 画像を選択
              </Button>
              {form.icon ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f!, icon: null }))}
                >
                  <X /> 削除
                </Button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onIconFile}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Slack ユーザー ID (任意)</Label>
            <Input
              value={form.slackUserId ?? ''}
              onChange={set('slackUserId')}
              placeholder="U0123ABCDEF"
            />
            <p className="text-xs text-muted-foreground">
              Slack のプロフィール →「メンバー ID をコピー」で取得できます。DM リンクに使われます。
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>メモ (任意)</Label>
            <Textarea value={form.note} onChange={set('note')} rows={2} />
          </div>
        </div>
        <DialogFooter className="items-center">
          {!isNew ? (
            <Button
              variant="destructive"
              className="sm:mr-auto"
              onClick={() => {
                if (confirm('このメンバーを削除しますか？座席の割り当ても解除されます。')) {
                  onDelete(member!.id);
                }
              }}
            >
              <Trash2 /> 削除
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={!isEmailValid}>{isNew ? '追加' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
