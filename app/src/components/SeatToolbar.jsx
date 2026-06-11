import {
  RotateCcw,
  RotateCw,
  Copy,
  Trash2,
  UserMinus,
  Link2,
  AlignStartVertical,
  AlignStartHorizontal,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SEAT_TYPES } from '@/lib/model';

const normRotation = (r) => ((r % 360) + 360) % 360;

// 席サイズのプリセット (席ユニット単位の倍率)。ハンドルのドラッグで自由値にもできる
const SIZE_PRESETS = [
  { w: 1, h: 1 },
  { w: 2, h: 1 },
  { w: 3, h: 1 },
];

// 1 → '1'、1.5 → '1.5' (余計な末尾ゼロを出さない)
const fmtSize = (v) => String(Math.round(v * 100) / 100);

/**
 * 編集モードで座席選択時に表示するツールバー。
 * 単一選択: 名前直接入力・席ラベル・種別・回転・複製・削除。
 * 複数選択: 整列・等間隔・回転・島ごと複製・まとめて削除。
 */
export default function SeatToolbar({
  seats,
  member,
  onUpdateSeat,
  onDuplicate,
  onDelete,
  onUnassign,
  onOpenLink,
  onAlign,
  onDistribute,
  onRotateAll,
  onDuplicateGroup,
  onDeleteAll,
}) {
  if (!seats?.length) return null;

  // 複数選択時: 一括操作ツールバー
  if (seats.length > 1) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50/80 px-3 py-2">
        <span className="text-xs font-semibold text-amber-900">{seats.length}席選択中:</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            title="選択席を左端の席の X 位置に揃える"
            onClick={() => onAlign('left')}
          >
            <AlignStartVertical /> 左揃え
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="選択席を上端の席の Y 位置に揃える"
            onClick={() => onAlign('top')}
          >
            <AlignStartHorizontal /> 上揃え
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="両端の席の間で横方向に等間隔に並べる"
            disabled={seats.length < 3}
            onClick={() => onDistribute('x')}
          >
            <AlignHorizontalDistributeCenter /> 横等間隔
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="両端の席の間で縦方向に等間隔に並べる"
            disabled={seats.length < 3}
            onClick={() => onDistribute('y')}
          >
            <AlignVerticalDistributeCenter /> 縦等間隔
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          title="選択席をまとめて 90° 回転 (R キーでも可)"
          onClick={() => onRotateAll(90)}
        >
          <RotateCw /> 90°回転
        </Button>
        <Button
          variant="outline"
          size="sm"
          title="選択した島を隣にまるごと複製 (名前は空に)。そのままドラッグで配置できます"
          onClick={onDuplicateGroup}
        >
          <Copy /> 島ごと複製
        </Button>
        <Button variant="destructive" size="sm" onClick={onDeleteAll}>
          <Trash2 /> まとめて削除
        </Button>
      </div>
    );
  }

  // 単一選択時: 従来 UI
  const seat = seats[0];
  const seatWVal = seat.w ?? 1;
  const seatHVal = seat.h ?? 1;
  const isPreset = SIZE_PRESETS.some((p) => p.w === seatWVal && p.h === seatHVal);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50/80 px-3 py-2">
      <span className="text-xs font-semibold text-amber-900">選択中の座席:</span>
      {member ? (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          台帳: <strong className="text-foreground">{member.nickname || member.name}</strong>
          <Button
            variant="outline"
            size="sm"
            title="台帳メンバーとの紐付けを外す (名前は直接入力に戻ります)"
            onClick={() => onUnassign(seat.id)}
          >
            <UserMinus /> 紐付け解除
          </Button>
        </span>
      ) : (
        <>
          <Input
            className="h-8 w-36"
            placeholder="名前 (直接入力)"
            value={seat.name ?? ''}
            onChange={(e) =>
              onUpdateSeat(seat.id, { name: e.target.value }, { coalesceKey: `name:${seat.id}` })
            }
          />
          <Button
            variant="outline"
            size="sm"
            title="台帳のメンバーと紐付け (任意)"
            onClick={() => onOpenLink(seat.id)}
          >
            <Link2 /> 台帳と紐付け
          </Button>
        </>
      )}
      <Input
        className="h-8 w-24"
        placeholder="席ラベル"
        value={seat.label}
        onChange={(e) =>
          onUpdateSeat(seat.id, { label: e.target.value }, { coalesceKey: `label:${seat.id}` })
        }
      />
      <Select
        className="h-8 w-36"
        value={seat.type}
        onChange={(e) => onUpdateSeat(seat.id, { type: e.target.value })}
      >
        {SEAT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="iconSm"
          title="左に90°回転 (Shift で 15°)"
          onClick={(e) =>
            onUpdateSeat(seat.id, {
              rotation: normRotation(seat.rotation - (e.shiftKey ? 15 : 90)),
            })
          }
        >
          <RotateCcw />
        </Button>
        <Button
          variant="outline"
          size="iconSm"
          title="右に90°回転 (Shift で 15°)"
          onClick={(e) =>
            onUpdateSeat(seat.id, {
              rotation: normRotation(seat.rotation + (e.shiftKey ? 15 : 90)),
            })
          }
        >
          <RotateCw />
        </Button>
      </div>
      <div
        className="flex items-center gap-1"
        title="席のサイズ (席1個分を1とした倍率)。席の右端・下端のハンドルをドラッグして自由に変えることもできます"
      >
        <span className="text-xs text-muted-foreground">サイズ</span>
        {SIZE_PRESETS.map((p) => (
          <Button
            key={`${p.w}x${p.h}`}
            variant={seatWVal === p.w && seatHVal === p.h ? 'secondary' : 'outline'}
            size="sm"
            className="px-2"
            onClick={() => onUpdateSeat(seat.id, { w: p.w, h: p.h })}
          >
            {p.w}×{p.h}
          </Button>
        ))}
        {!isPreset ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {fmtSize(seatWVal)}×{fmtSize(seatHVal)}
          </span>
        ) : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        title="隣に複製してすぐ名前を入力 (複製→名前→複製… で列が作れます)"
        onClick={() => onDuplicate(seat.id)}
      >
        <Copy /> 複製
      </Button>
      <Button variant="destructive" size="sm" onClick={() => onDelete(seat.id)}>
        <Trash2 /> 削除
      </Button>
    </div>
  );
}
