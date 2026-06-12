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
import { Textarea } from '@/components/ui/textarea';
import { compressIconImage } from '@/lib/image';
import type { Member } from '@/lib/model';

interface MemberForm {
  name: string;
  nickname: string;
  department: string;
  icon: string | null;
  slackUserId: string;
  note: string;
}

type MemberFormTextField = Exclude<keyof MemberForm, 'icon'>;

interface MemberEditDialogProps {
  open: boolean;
  member: Member | null;
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
        department: member?.department ?? '',
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

  function handleSave() {
    if (!form!.name.trim() && !form!.nickname.trim()) {
      alert('本名またはあだ名を入力してください');
      return;
    }
    onSave({
      ...form!,
      name: form!.name.trim(),
      nickname: form!.nickname.trim(),
      department: form!.department.trim(),
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
              <Label>あだ名 (表示名)</Label>
              <Input value={form.nickname} onChange={set('nickname')} placeholder="やまちゃん" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>所属 (部署/チーム)</Label>
            <Input value={form.department} onChange={set('department')} placeholder="開発部" />
          </div>
          <div className="grid gap-1.5">
            <Label>アイコン画像 (任意)</Label>
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
          <Button onClick={handleSave}>{isNew ? '追加' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
