import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Eye, Pencil, ImageIcon, Square, Users, Save } from 'lucide-react';
import type { ReactNode } from 'react';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Section {
  icon: ReactNode;
  title: string;
  items: { label: string; desc: string }[];
}

const SECTIONS: Section[] = [
  {
    icon: <Eye className="h-4 w-4" />,
    title: '見る（閲覧モード）',
    items: [
      { label: '検索して席へ移動', desc: '上部の検索欄に名前・事業部・部署を入力 → 候補を選ぶとその席まで画面が移動します' },
      { label: '名前の表示切り替え', desc: '「表示: あだ名／本名」ボタンで切り替え（台帳に登録した席のみ）' },
      { label: '席の詳細', desc: '席をクリックすると、本名・事業部・アイコン・Slack へのリンクが見られます' },
    ],
  },
  {
    icon: <Pencil className="h-4 w-4" />,
    title: '席を置く（編集モード）',
    items: [
      { label: '編集に入る', desc: '右上の「編集」ボタン。もう一度押すと閲覧に戻ります' },
      { label: '席を置く', desc: '「クリックで配置」を選び、図面をクリック → その場で名前を入力 → Enter で次々置けます' },
      { label: '名前 / 台帳から選ぶ', desc: '席をダブルクリック（または選択して Enter）。文字を打てば直接入力、候補から選べば台帳メンバーを紐付け' },
    ],
  },
  {
    icon: <Square className="h-4 w-4" />,
    title: '早く・きれいに作る',
    items: [
      { label: 'まとめて配置', desc: 'ドラッグで一列に連続配置。「テンプレート」から2人掛け・4人島なども置けます' },
      { label: '範囲選択', desc: '背景をドラッグで囲って複数選択 → まとめて移動・整列・等間隔・間隔（±）調整・回転' },
      { label: 'コピー＆ペースト', desc: '選択して Cmd/Ctrl+C → V。サイズや向きごと複製できます' },
      { label: 'サイズ・向き', desc: '席を1つ選ぶと出るハンドルで大きさ変更・回転。R キーで90°回転' },
      { label: '取り消し', desc: 'Cmd/Ctrl+Z で元に戻す、Shift+Cmd/Ctrl+Z でやり直し。Delete で選択席を削除' },
    ],
  },
  {
    icon: <ImageIcon className="h-4 w-4" />,
    title: '図面とエリア',
    items: [
      { label: '図面を置く', desc: '「図面を設定」から画像／PDF をアップロード（ドラッグ＆ドロップも可）' },
      { label: '図面を調整', desc: '「図面を調整」モードで、図面をドラッグ移動・右下ハンドルで拡大縮小。図面を消しても席の配置は崩れません' },
      { label: '背景サイズ', desc: '拠点管理から背景（キャンバス）の大きさを変更できます' },
      { label: 'エリア', desc: '「エリアを追加」で区画を囲み、名前（改行可）と色を設定。文字サイズも変えられます' },
    ],
  },
  {
    icon: <Users className="h-4 w-4" />,
    title: 'メンバー名簿・色',
    items: [
      { label: '名簿から取り込み／同期', desc: 'メンバー台帳パネルから、名簿を貼り付けて一括登録。メールアドレスをキーに差分同期（退職の確認つき）もできます' },
      { label: '事業部と色', desc: '設定（歯車）から事業部リストと、その表示色を編集できます' },
    ],
  },
  {
    icon: <Save className="h-4 w-4" />,
    title: '保存と共有',
    items: [
      { label: '保存', desc: '編集したら「保存」ボタン。保存するとセッションを開いている全員に反映されます' },
      { label: '共有', desc: 'このページの URL を共有するだけ。閲覧する人は開くだけで最新が見えます' },
    ],
  },
];

export default function HelpDialog({ open, onClose }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>使い方ガイド</DialogTitle>
          <DialogDescription>
            座席表の見方と、レイアウトの作り方のかんたんな案内です。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className="text-muted-foreground">{section.icon}</span>
                {section.title}
              </h3>
              <ul className="space-y-1.5 pl-1">
                {section.items.map((item) => (
                  <li key={item.label} className="text-sm leading-relaxed">
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="text-muted-foreground"> — {item.desc}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
