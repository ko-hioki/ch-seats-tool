import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ZONE_COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { ZONE_FONT_SCALE_MIN, ZONE_FONT_SCALE_MAX, type Zone } from '@/lib/model';

interface ZoneToolbarProps {
  zone: Zone | null;
  onUpdateZone: (id: string, patch: Partial<Zone>, opts?: { coalesceKey?: string }) => void;
  onDelete: (id: string) => void;
}

/**
 * 編集モードでエリア (ゾーン) 選択時に表示するツールバー。
 * ラベル編集・プリセットカラー選択・文字サイズ変更・削除。
 */
export default function ZoneToolbar({ zone, onUpdateZone, onDelete }: ZoneToolbarProps) {
  if (!zone) return null;
  const fontScale = zone.fontScale ?? 1;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50/80 px-3 py-2">
      <span className="text-xs font-semibold text-amber-900">選択中のエリア:</span>
      <Textarea
        className="h-16 w-44 resize-none text-sm leading-snug"
        placeholder="エリア名 (例: OPエリア)"
        value={zone.label ?? ''}
        rows={2}
        onChange={(e) =>
          onUpdateZone(zone.id, { label: e.target.value }, { coalesceKey: `zone-label:${zone.id}` })
        }
      />
      <div className="flex items-center gap-1" title="エリアの色 (プリセット)">
        {ZONE_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            title={c.label}
            aria-label={c.label}
            className={cn(
              'h-6 w-6 cursor-pointer rounded-md border-2 transition-transform hover:scale-110',
              zone.color === c.key && 'ring-2 ring-blue-500 ring-offset-1'
            )}
            style={{ background: c.fill, borderColor: c.border }}
            onClick={() => onUpdateZone(zone.id, { color: c.key })}
          />
        ))}
      </div>
      <div className="flex items-center gap-1" title="ラベルの文字サイズ (0.25 刻み)">
        <span className="text-xs text-muted-foreground">文字</span>
        <Button
          variant="outline"
          size="iconSm"
          disabled={fontScale <= ZONE_FONT_SCALE_MIN}
          onClick={() =>
            onUpdateZone(
              zone.id,
              { fontScale: Math.max(ZONE_FONT_SCALE_MIN, Math.round((fontScale - 0.25) * 100) / 100) },
              { coalesceKey: `zone-fontScale:${zone.id}` }
            )
          }
        >
          −
        </Button>
        <span className="w-8 text-center text-xs tabular-nums">{fontScale.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}</span>
        <Button
          variant="outline"
          size="iconSm"
          disabled={fontScale >= ZONE_FONT_SCALE_MAX}
          onClick={() =>
            onUpdateZone(
              zone.id,
              { fontScale: Math.min(ZONE_FONT_SCALE_MAX, Math.round((fontScale + 0.25) * 100) / 100) },
              { coalesceKey: `zone-fontScale:${zone.id}` }
            )
          }
        >
          ＋
        </Button>
      </div>
      <span className="hidden text-xs text-muted-foreground lg:inline">
        ドラッグで移動 / 四隅のハンドルでサイズ変更
      </span>
      <Button variant="destructive" size="sm" onClick={() => onDelete(zone.id)}>
        <Trash2 /> エリアを削除
      </Button>
    </div>
  );
}
