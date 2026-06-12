import { useMemo, useState } from 'react';
import { Pencil, Plus, FileSpreadsheet, GripVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { departmentColor, type DepartmentColor } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { Location, Member, Seat } from '@/lib/model';

export interface DragGhost {
  member: Member;
  x: number;
  y: number;
}

interface MemberRowProps {
  member: Member;
  seatInfo: string | null | undefined;
  colorMap: Map<string, DepartmentColor>;
  onEdit: (member: Member) => void;
  onDragState: (ghost: DragGhost | null) => void;
  onDropMember: (memberId: string, seatId: string) => void;
}

function MemberRow({ member, seatInfo, colorMap, onEdit, onDragState, onDropMember }: MemberRowProps) {
  const c = departmentColor(colorMap, member.department);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('button')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) {
        dragging = true;
      }
      if (dragging) {
        ev.preventDefault();
        onDragState({ member, x: ev.clientX, y: ev.clientY });
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointercancel', cancel);
      if (dragging) {
        onDragState(null);
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const seatEl = el?.closest?.('[data-seat-id]') as HTMLElement | null;
        if (seatEl) onDropMember(member.id, seatEl.dataset.seatId!);
      }
    };
    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onDragState(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  }

  return (
    <div
      className="group flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      {member.icon ? (
        <img src={member.icon} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" draggable={false} />
      ) : (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: c.bg, color: c.text }}
        >
          {(member.nickname || member.name || '?').slice(0, 1)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight">
          {member.nickname || member.name}
          {member.nickname && member.name ? (
            <span className="ml-1 text-xs font-normal text-muted-foreground">({member.name})</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {member.department ? (
            <span className="flex items-center gap-1 truncate">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.border }} />
              {member.department}
            </span>
          ) : null}
          {seatInfo ? <span className="truncate">@ {seatInfo}</span> : null}
        </div>
      </div>
      <Button
        variant="ghost"
        size="iconSm"
        className="opacity-40 group-hover:opacity-100"
        onClick={() => onEdit(member)}
        title="メンバーを編集"
      >
        <Pencil />
      </Button>
    </div>
  );
}

interface MemberPanelProps {
  members: Member[];
  seats: Seat[];
  locations: Location[];
  colorMap: Map<string, DepartmentColor>;
  onDragState: (ghost: DragGhost | null) => void;
  onDropMember: (memberId: string, seatId: string) => void;
  onEditMember: (member: Member) => void;
  onAddMember: () => void;
  onOpenCsvImport: () => void;
  onClose: () => void;
}

/**
 * 編集モードのサイドパネル: メンバー台帳 (任意機能)。
 * 一覧 (割り当て済み/未割り当て)・追加・CSV 取り込み。
 * メンバー行を座席へドラッグ&ドロップで割り当て/入れ替えできる。
 * 席への名前直接入力だけでも座席表は完成するため、使わなくてもよい。
 */
export default function MemberPanel({
  members,
  seats,
  locations,
  colorMap,
  onDragState,
  onDropMember,
  onEditMember,
  onAddMember,
  onOpenCsvImport,
  onClose,
}: MemberPanelProps) {
  const [filter, setFilter] = useState('');

  const { assigned, unassigned, seatInfoByMemberId } = useMemo(() => {
    const locById = new Map(locations.map((l) => [l.id, l]));
    const seatByMember = new Map<string, Seat>();
    for (const s of seats) {
      if (s.memberId) seatByMember.set(s.memberId, s);
    }
    const q = filter.trim().toLowerCase();
    const match = (m: Member) =>
      !q ||
      m.name?.toLowerCase().includes(q) ||
      m.nickname?.toLowerCase().includes(q) ||
      m.department?.toLowerCase().includes(q);
    const sorted = [...members].sort((a, b) =>
      (a.department || '').localeCompare(b.department || '', 'ja') ||
      (a.name || '').localeCompare(b.name || '', 'ja')
    );
    const assigned: Member[] = [];
    const unassigned: Member[] = [];
    const seatInfoByMemberId = new Map<string, string>();
    for (const m of sorted) {
      if (!match(m)) continue;
      const seat = seatByMember.get(m.id);
      if (seat) {
        const loc = locById.get(seat.locationId);
        seatInfoByMemberId.set(m.id, `${loc?.name ?? '?'}${seat.label ? ` ${seat.label}` : ''}`);
        assigned.push(m);
      } else {
        unassigned.push(m);
      }
    }
    return { assigned, unassigned, seatInfoByMemberId };
  }, [members, seats, locations, filter]);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l bg-muted/40 sm:w-80">
      <div className="space-y-2 border-b p-2.5">
        <div className="flex items-center justify-between gap-1">
          <h2 className="text-sm font-bold">
            メンバー台帳 <span className="font-normal text-muted-foreground">(任意・{members.length}人)</span>
          </h2>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={onOpenCsvImport} title="名簿の貼り付け / CSV 取り込み">
              <FileSpreadsheet /> 一括登録
            </Button>
            <Button size="sm" onClick={onAddMember}>
              <Plus /> 追加
            </Button>
            <Button variant="ghost" size="iconSm" onClick={onClose} title="台帳パネルを閉じる">
              <X />
            </Button>
          </div>
        </div>
        <Input
          placeholder="名前・部署で絞り込み"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8"
        />
        <p className="text-xs text-muted-foreground">
          台帳は任意機能です (席への名前直接入力だけでも座席表は作れます)。メンバーを座席へドラッグで割り当て、着席中メンバーを別席へドラッグで移動/入れ替え。あだ名・アイコン・部署色分け・Slack リンクを使いたい場合に登録してください。
        </p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-2.5">
        <section>
          <h3 className={cn('mb-1.5 text-xs font-semibold text-muted-foreground')}>
            未割り当て ({unassigned.length})
          </h3>
          <div className="space-y-1">
            {unassigned.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                seatInfo={null}
                colorMap={colorMap}
                onEdit={onEditMember}
                onDragState={onDragState}
                onDropMember={onDropMember}
              />
            ))}
            {unassigned.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">なし</p>
            ) : null}
          </div>
        </section>
        <section>
          <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">
            割り当て済み ({assigned.length})
          </h3>
          <div className="space-y-1">
            {assigned.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                seatInfo={seatInfoByMemberId.get(m.id)}
                colorMap={colorMap}
                onEdit={onEditMember}
                onDragState={onDragState}
                onDropMember={onDropMember}
              />
            ))}
            {assigned.length === 0 ? (
              <p className="px-1 text-xs text-muted-foreground">なし</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
