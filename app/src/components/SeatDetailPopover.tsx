import { ExternalLink, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { departmentColor, type DepartmentColor } from '@/lib/colors';
import {
  memberAffiliationLabel,
  memberColorKey,
  seatTypeLabel,
  type Division,
  type Member,
  type Seat,
} from '@/lib/model';

const CARD_W = 280;
const CARD_H = 260;

interface SeatDetailPopoverProps {
  anchor: { x: number; y: number };
  seat: Seat | null;
  member: Member | null | undefined;
  divisions: Division[];
  colorMap: Map<string, DepartmentColor>;
  onClose: () => void;
  onEditProfile: (member: Member) => void;
}

/**
 * 閲覧モードで座席をクリックしたときの詳細ポップオーバー。
 * クリック位置の近くに固定表示する。
 */
export default function SeatDetailPopover({
  anchor,
  seat,
  member,
  divisions,
  colorMap,
  onClose,
  onEditProfile,
}: SeatDetailPopoverProps) {
  if (!seat) return null;

  const left = Math.max(8, Math.min(anchor.x + 12, window.innerWidth - CARD_W - 8));
  const top = Math.max(8, Math.min(anchor.y + 12, window.innerHeight - CARD_H - 8));
  const c = member ? departmentColor(colorMap, memberColorKey(member)) : null;
  const affiliation = member ? memberAffiliationLabel(divisions, member) : '';

  return (
    <div
      className="fixed z-40 rounded-lg border bg-card p-4 shadow-xl"
      style={{ left, top, width: CARD_W }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="absolute right-2.5 top-2.5 rounded-sm opacity-60 hover:opacity-100 cursor-pointer"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        {seat.label ? <span className="font-mono">{seat.label}</span> : null}
        <Badge variant="secondary">{seatTypeLabel(seat.type)}</Badge>
        {member?.status === 'retired' ? (
          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
            退職
          </Badge>
        ) : null}
      </div>

      {member ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            {member.icon ? (
              <img src={member.icon} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                style={{ background: c!.bg, color: c!.text }}
              >
                {(member.nickname || member.name || '?').slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-base font-bold">{member.nickname || member.name}</div>
              {member.nickname && member.name ? (
                <div className="truncate text-sm text-muted-foreground">{member.name}</div>
              ) : null}
            </div>
          </div>
          {affiliation ? (
            <div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{ background: c!.bg, color: c!.text, border: `1px solid ${c!.border}` }}
              >
                {affiliation}
              </span>
            </div>
          ) : null}
          {member.note ? (
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{member.note}</p>
          ) : null}
          <div className="flex gap-2 pt-1">
            {member.slackUserId ? (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`https://slack.com/app_redirect?channel=${encodeURIComponent(member.slackUserId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink /> Slack で DM
                </a>
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => onEditProfile(member)}>
              <Pencil /> プロフィールを編集
            </Button>
          </div>
        </div>
      ) : seat.name ? (
        // 直接入力の名前のみの席: 名前だけを表示 (プロフィール編集は台帳紐付け席のみ)
        <div className="space-y-1 py-1">
          <div className="text-base font-bold">{seat.name}</div>
          <p className="text-xs text-muted-foreground">
            台帳未登録の名前です。編集モードの「台帳と紐付け」でプロフィールを追加できます。
          </p>
        </div>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">空席です</p>
      )}
    </div>
  );
}
