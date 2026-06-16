import { useState, useEffect } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Location, Seat } from '@/lib/model';

interface LocationManagerDialogProps {
  open: boolean;
  onClose: () => void;
  locations: Location[];
  seats: Seat[];
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: number) => void;
  onUpdateCanvas?: (locId: string, width: number, height: number) => void;
}

function CanvasSizeInput({
  width,
  height,
  onChange,
}: {
  width: number;
  height: number;
  onChange: (w: number, h: number) => void;
}) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));

  useEffect(() => { setW(String(width)); }, [width]);
  useEffect(() => { setH(String(height)); }, [height]);

  const commit = () => {
    const nw = parseInt(w, 10);
    const nh = parseInt(h, 10);
    if (nw > 0 && nh > 0 && (nw !== width || nh !== height)) {
      onChange(nw, nh);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        className="h-6 w-16 rounded border px-1 text-xs"
        value={w}
        onChange={(e) => setW(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        type="number"
        min={100}
        max={10000}
        title="キャンバスの幅 (px)"
      />
      <span>×</span>
      <input
        className="h-6 w-16 rounded border px-1 text-xs"
        value={h}
        onChange={(e) => setH(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        type="number"
        min={100}
        max={10000}
        title="キャンバスの高さ (px)"
      />
      <span className="shrink-0">px</span>
    </div>
  );
}

/**
 * 拠点 (フロア) の追加・名称変更・削除・並べ替えダイアログ。
 */
export default function LocationManagerDialog({
  open,
  onClose,
  locations,
  seats,
  onAdd,
  onRename,
  onDelete,
  onMove,
  onUpdateCanvas,
}: LocationManagerDialogProps) {
  const [newName, setNewName] = useState('');

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    onAdd(name);
    setNewName('');
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>拠点の管理</DialogTitle>
          <DialogDescription>拠点 (フロア) の追加・名称変更・並べ替え・削除を行います。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {locations.map((loc, i) => {
            const seatCount = seats.filter((s) => s.locationId === loc.id).length;
            return (
              <div key={loc.id} className="flex flex-col gap-1.5 rounded-md border p-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={loc.name}
                    onChange={(e) => onRename(loc.id, e.target.value)}
                    className="h-8 flex-1"
                  />
                  <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">
                    {seatCount} 席
                  </span>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    disabled={i === 0}
                    onClick={() => onMove(loc.id, -1)}
                    title="上へ"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    disabled={i === locations.length - 1}
                    onClick={() => onMove(loc.id, 1)}
                    title="下へ"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    className="text-destructive"
                    onClick={() => {
                      if (
                        confirm(
                          `拠点「${loc.name}」を削除しますか？\nこの拠点の座席 ${seatCount} 席も削除されます (メンバー自体は残ります)。`
                        )
                      ) {
                        onDelete(loc.id);
                      }
                    }}
                    title="削除"
                  >
                    <Trash2 />
                  </Button>
                </div>
                {onUpdateCanvas ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">キャンバス:</span>
                    <CanvasSizeInput
                      width={loc.canvasWidth}
                      height={loc.canvasHeight}
                      onChange={(w, h) => onUpdateCanvas(loc.id, w, h)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">拠点がまだありません。追加してください。</p>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <Input
              placeholder="新しい拠点名 (例: 東京 5F)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="h-9 flex-1"
            />
            <Button onClick={handleAdd} disabled={!newName.trim()}>
              <Plus /> 追加
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
