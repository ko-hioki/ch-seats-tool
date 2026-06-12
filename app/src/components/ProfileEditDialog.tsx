import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
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

interface ProfileForm {
  nickname: string;
  icon: string | null;
  slackUserId: string;
  note: string;
}

interface ProfileEditDialogProps {
  open: boolean;
  member: Member | null | undefined;
  onClose: () => void;
  onSave: (memberId: string, fields: Partial<Member>) => Promise<void>;
}

/**
 * 閲覧モードからの「プロフィールを編集」ダイアログ。
 * 本人があだ名・アイコン・Slack 情報・メモをその場で更新して即保存する
 * (saveWithRetry によりサーバーの最新データへマージ保存)。
 */
export default function ProfileEditDialog({ open, member, onClose, onSave }: ProfileEditDialogProps) {
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && member) {
      setForm({
        nickname: member.nickname ?? '',
        icon: member.icon ?? null,
        slackUserId: member.slackUserId ?? '',
        note: member.note ?? '',
      });
      setSaving(false);
    }
  }, [open, member]);

  if (!form || !member) return null;

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

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(member!.id, {
        nickname: form!.nickname.trim(),
        icon: form!.icon,
        slackUserId: form!.slackUserId.trim() || null,
        note: form!.note,
      });
      onClose();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>プロフィールを編集</DialogTitle>
          <DialogDescription>
            {member.name} さんのプロフィール。保存するとすぐに全員へ共有されます。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>あだ名 (座席表に表示される名前)</Label>
            <Input
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f!, nickname: e.target.value }))}
              placeholder={member.name}
            />
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
                <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f!, icon: null }))}>
                  <X /> 削除
                </Button>
              ) : null}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onIconFile} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Slack ユーザー ID</Label>
            <Input
              value={form.slackUserId}
              onChange={(e) => setForm((f) => ({ ...f!, slackUserId: e.target.value }))}
              placeholder="U0123ABCDEF"
            />
            <p className="text-xs text-muted-foreground">
              Slack のプロフィール →「メンバー ID をコピー」で取得。設定すると DM リンクが表示されます。
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>メモ</Label>
            <Textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f!, note: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
