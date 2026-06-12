import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { normalizeData, type AppData } from '@/lib/model';

interface DataIODialogProps {
  open: boolean;
  onClose: () => void;
  data: AppData | null;
  sessionName: string;
  onImport: (data: AppData) => void;
}

/**
 * データ管理ダイアログ: JSON エクスポート/インポート (バックアップ・移行用) と運用ガイド。
 */
export default function DataIODialog({ open, onClose, data, sessionName, onImport }: DataIODialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `seats-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const normalized = normalizeData(raw);
      if (normalized.locations.length === 0 && normalized.members.length === 0) {
        if (!confirm('読み込んだデータは空のようです。現在のデータを置き換えますか？')) return;
      } else if (
        !confirm(
          `現在のデータを置き換えます (拠点 ${normalized.locations.length} / メンバー ${normalized.members.length} / 座席 ${normalized.seats.length})。よろしいですか？\n※「保存」を押すまでサーバーには反映されません。`
        )
      ) {
        return;
      }
      onImport(normalized);
      onClose();
    } catch {
      alert('JSON ファイルの読み込みに失敗しました。形式を確認してください。');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>データ管理</DialogTitle>
          <DialogDescription>
            {sessionName ? `セッション: ${sessionName}` : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">バックアップ (JSON エクスポート)</h3>
            <p className="text-xs text-muted-foreground">
              現在の座席データ全体を JSON ファイルとしてダウンロードします。定期的なバックアップや別セッションへの移行に使えます。
            </p>
            <div>
              <Button variant="outline" onClick={handleExport} disabled={!data}>
                <Download /> JSON をエクスポート
              </Button>
            </div>
          </section>
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">復元 (JSON インポート)</h3>
            <p className="text-xs text-muted-foreground">
              エクスポートした JSON ファイルを読み込み、現在のデータを置き換えます。読み込み後に「保存」を押すとサーバーへ反映されます。
            </p>
            <div>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload /> JSON をインポート
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
          </section>
          <section className="grid gap-1 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">運用ガイド</h3>
            <ul className="list-disc space-y-1 pl-4">
              <li>座席データはこのセッション (サーバー側) に保存され、URL を開いた全員に共有されます。</li>
              <li>編集モードでの変更は「保存」ボタンを押すまでサーバーへ反映されません。</li>
              <li>保存時に他の人の更新と競合した場合は、最新を読み込むか上書きするかを選べます。</li>
              <li>プロフィール編集 (あだ名・アイコン・Slack) は閲覧モードから各自が行えます。</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
