import { useState } from 'react';
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
}) {
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
              <div key={loc.id} className="flex items-center gap-1.5 rounded-md border p-2">
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
