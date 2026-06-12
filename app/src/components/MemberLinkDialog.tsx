import { useMemo, useState } from 'react';
import { UserPlus, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { departmentColor, type DepartmentColor } from '@/lib/colors';
import type { Member, Seat } from '@/lib/model';

interface MemberLinkDialogProps {
  open: boolean;
  seat: Seat | null;
  members: Member[];
  colorMap: Map<string, DepartmentColor>;
  onClose: () => void;
  onLink: (memberId: string) => void;
  onRegisterAndLink: (name: string) => void;
}

/**
 * 席の直接入力名と台帳メンバーを紐付けるダイアログ。
 * - 一覧からメンバーを選んで紐付け
 * - 席の名前で台帳に新規登録して紐付け
 */
export default function MemberLinkDialog({
  open,
  seat,
  members,
  colorMap,
  onClose,
  onLink,
  onRegisterAndLink,
}: MemberLinkDialogProps) {
  const [filter, setFilter] = useState('');

  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const sorted = [...members].sort(
      (a, b) =>
        (a.department || '').localeCompare(b.department || '', 'ja') ||
        (a.name || '').localeCompare(b.name || '', 'ja')
    );
    if (!q) return sorted;
    return sorted.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.nickname?.toLowerCase().includes(q) ||
        m.department?.toLowerCase().includes(q)
    );
  }, [members, filter]);

  if (!seat) return null;
  const seatName = (seat.name ?? '').trim();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>台帳のメンバーと紐付け</DialogTitle>
          <DialogDescription>
            紐付けると詳細ポップオーバー・部署色分け・アイコン表示が有効になります。紐付けは任意です。
          </DialogDescription>
        </DialogHeader>

        {seatName ? (
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => onRegisterAndLink(seatName)}
          >
            <UserPlus /> 「{seatName}」を台帳に新規登録して紐付け
          </Button>
        ) : null}

        <Input
          placeholder="名前・部署で絞り込み"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8"
        />

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {list.map((m) => {
            const c = departmentColor(colorMap, m.department);
            return (
              <button
                key={m.id}
                type="button"
                className="flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left hover:bg-accent cursor-pointer"
                onClick={() => onLink(m.id)}
              >
                {m.icon ? (
                  <img src={m.icon} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                ) : (
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: c.bg, color: c.text }}
                  >
                    {(m.nickname || m.name || '?').slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-tight">
                    {m.nickname || m.name}
                    {m.nickname && m.name ? (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">({m.name})</span>
                    ) : null}
                  </span>
                  {m.department ? (
                    <span className="block truncate text-xs text-muted-foreground">{m.department}</span>
                  ) : null}
                </span>
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
          {list.length === 0 ? (
            <p className="px-1 py-3 text-center text-xs text-muted-foreground">
              {members.length === 0
                ? '台帳にメンバーが登録されていません。'
                : '該当するメンバーがいません。'}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
