import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ZONE_COLORS } from '@/lib/colors';
import { cn } from '@/lib/utils';

/**
 * 編集モードでエリア (ゾーン) 選択時に表示するツールバー。
 * ラベル編集・プリセットカラー選択・削除。
 */
export default function ZoneToolbar({ zone, onUpdateZone, onDelete }) {
  if (!zone) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50/80 px-3 py-2">
      <span className="text-xs font-semibold text-amber-900">選択中のエリア:</span>
      <Input
        className="h-8 w-44"
        placeholder="エリア名 (例: OPエリア)"
        value={zone.label ?? ''}
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
      <span className="hidden text-xs text-muted-foreground lg:inline">
        ドラッグで移動 / 四隅のハンドルでサイズ変更
      </span>
      <Button variant="destructive" size="sm" onClick={() => onDelete(zone.id)}>
        <Trash2 /> エリアを削除
      </Button>
    </div>
  );
}
