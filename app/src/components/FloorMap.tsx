import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Minus, Maximize } from 'lucide-react';
import {
  BLANK_CANVAS,
  seatDisplayName,
  type Location,
  type Member,
  type NameMode,
  type Seat,
  type SeatTemplate,
  type SeatType,
  type Zone,
} from '@/lib/model';
import { departmentColor, zoneColor, type DepartmentColor } from '@/lib/colors';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SeatStyle {
  background: string;
  borderColor: string;
  borderStyle: string;
  color: string;
}

// 座席種別ごとの空席時スタイル
const VACANT_STYLES: Record<SeatType, SeatStyle> = {
  fixed: { background: '#ffffff', borderColor: '#94a3b8', borderStyle: 'solid', color: '#94a3b8' },
  free: { background: '#f0f9ff', borderColor: '#38bdf8', borderStyle: 'dashed', color: '#0369a1' },
  meeting: { background: '#faf5ff', borderColor: '#a855f7', borderStyle: 'solid', color: '#7e22ce' },
  other: { background: '#f8fafc', borderColor: '#cbd5e1', borderStyle: 'dotted', color: '#94a3b8' },
};

// 直接入力の名前のみ (台帳未紐付け) の座席スタイル
const NAMED_STYLES: Record<SeatType, SeatStyle> = {
  fixed: { background: '#ffffff', borderColor: '#64748b', borderStyle: 'solid', color: '#1e293b' },
  free: { background: '#f0f9ff', borderColor: '#0284c7', borderStyle: 'dashed', color: '#0c4a6e' },
  meeting: { background: '#faf5ff', borderColor: '#9333ea', borderStyle: 'solid', color: '#581c87' },
  other: { background: '#f8fafc', borderColor: '#64748b', borderStyle: 'dotted', color: '#334155' },
};

interface SeatNodeProps {
  seat: Seat;
  member: Member | null | undefined;
  colorMap: Map<string, DepartmentColor>;
  seatW: number;
  seatH: number;
  W: number;
  H: number;
  selected: boolean;
  highlighted: boolean | undefined;
  dimmed: boolean;
  nameMode: NameMode;
}

function SeatNode({
  seat,
  member,
  colorMap,
  seatW,
  seatH,
  W,
  H,
  selected,
  highlighted,
  dimmed,
  nameMode,
}: SeatNodeProps) {
  const displayName = seatDisplayName(seat, member, nameMode);
  let style: SeatStyle;
  if (member) {
    const c = departmentColor(colorMap, member.department);
    style = {
      background: c.bg,
      borderColor: c.border,
      borderStyle: seat.type === 'free' ? 'dashed' : 'solid',
      color: c.text,
    };
  } else if (displayName) {
    style = NAMED_STYLES[seat.type] ?? NAMED_STYLES.fixed;
  } else {
    style = VACANT_STYLES[seat.type] ?? VACANT_STYLES.fixed;
  }
  // 席ごとのサイズ倍率 (w/h は席ユニット単位。旧データは undefined → 1)
  const cellW = Math.round(seatW * (seat.w ?? 1));
  const cellH = Math.round(seatH * (seat.h ?? 1));
  // 文字数に応じて自動縮小し、4〜5文字の姓名でも truncate しないようにする (実セルサイズ基準)
  const fontSize = Math.max(
    8,
    Math.min(cellW * 0.17, cellH * 0.34, ((cellW - 6) * 1.7) / Math.max(1, displayName.length))
  );
  const labelSize = Math.max(8, Math.round(Math.min(cellW * 0.12, cellH * 0.2)));

  return (
    <div
      data-seat-id={seat.id}
      className={cn(
        'absolute flex flex-col items-center justify-center rounded-md border-2 overflow-hidden cursor-pointer shadow-sm',
        selected && 'ring-4 ring-blue-500/70 z-20',
        highlighted && 'ring-4 ring-yellow-400 z-10',
        dimmed && 'opacity-25'
      )}
      style={{
        left: seat.x * W,
        top: seat.y * H,
        width: cellW,
        height: cellH,
        marginLeft: -cellW / 2,
        marginTop: -cellH / 2,
        // 中心 (x, y) を基準に回転するため、横長サイズでも自然に回る
        transform: `rotate(${seat.rotation}deg)`,
        background: style.background,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
      }}
    >
      {seat.label ? (
        <div
          className="leading-none opacity-70 pointer-events-none max-w-full truncate px-0.5"
          style={{ fontSize: labelSize, color: style.color ?? '#64748b' }}
        >
          {seat.label}
        </div>
      ) : null}
      <div
        className="font-bold leading-tight text-center pointer-events-none max-w-full truncate px-0.5"
        style={{ fontSize, color: style.color }}
      >
        {displayName || (seat.type === 'meeting' ? '会議席' : '空席')}
      </div>
      {member?.icon ? (
        <img
          src={member.icon}
          alt=""
          className="rounded-full pointer-events-none"
          style={{ width: cellH * 0.32, height: cellH * 0.32 }}
          draggable={false}
        />
      ) : null}
    </div>
  );
}

interface InlineNameInputProps {
  left: number;
  top: number;
  width: number;
  initial: string;
  placeholder?: string;
  onCommit: (value: string, opts?: { advance?: number }) => void;
  onCancel: () => void;
}

/**
 * 座席の上に重ねて表示するインライン名前入力。
 * Enter で確定 / Tab で確定して隣の席へ (Shift+Tab で逆方向) / Esc でキャンセル / フォーカスを外すと確定。
 */
function InlineNameInput({
  left,
  top,
  width,
  initial,
  placeholder = '名前を入力',
  onCommit,
  onCancel,
}: InlineNameInputProps) {
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = (opts?: { advance?: number }) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(value, opts);
  };

  return (
    <input
      ref={inputRef}
      className="absolute z-40 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-blue-500 bg-white px-2 py-1.5 text-sm font-bold text-slate-900 shadow-xl outline-none"
      style={{ left, top, width }}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          if (e.nativeEvent.isComposing) return; // IME 変換確定の Enter は無視
          commit();
        } else if (e.key === 'Tab') {
          if (e.nativeEvent.isComposing) return;
          e.preventDefault();
          // Tab: 確定して読書順で隣の席のインライン入力を開く
          commit({ advance: e.shiftKey ? -1 : 1 });
        } else if (e.key === 'Escape') {
          doneRef.current = true;
          onCancel();
        }
      }}
      onBlur={() => commit()}
    />
  );
}

interface RelPoint {
  x: number;
  y: number;
}

interface RelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ポインタジェスチャの状態 (type で判別)
type Gesture =
  | {
      type: 'pinch';
      startDist: number;
      startScale: number;
      startTx: number;
      startTy: number;
      startMidX: number;
      startMidY: number;
    }
  | {
      type: 'pan';
      seatId: string | null;
      zoneId: string | null;
      startX: number;
      startY: number;
      origTx: number;
      origTy: number;
      moved: boolean;
    }
  | { type: 'toggle'; seatId: string }
  | {
      type: 'seat';
      seatId: string;
      items: { id: string; origX: number; origY: number }[];
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      moved: boolean;
    }
  | {
      type: 'seat-resize';
      seatId: string;
      edge: string; // 'e' | 's' | 'se'
      startX: number;
      startY: number;
      moved?: boolean;
      orig: { x: number; y: number; w: number; h: number; rotation: number };
    }
  | {
      type: 'seat-rotate';
      seatId: string;
      startX: number;
      startY: number;
      moved: boolean;
      cx: number;
      cy: number;
    }
  | {
      type: 'zone-resize';
      zoneId: string;
      corner: string;
      startX: number;
      startY: number;
      moved?: boolean;
      orig: { x: number; y: number; w: number; h: number };
    }
  | {
      type: 'zone-draw';
      startX: number;
      startY: number;
      origin: RelPoint;
      rect: RelRect | null;
      moved: boolean;
    }
  | {
      type: 'stamp';
      startX: number;
      startY: number;
      origin: RelPoint;
      points: RelPoint[] | null;
      moved: boolean;
    }
  | { type: 'template'; startX: number; startY: number; moved: boolean }
  | {
      type: 'zone-move';
      zoneId: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      w: number;
      h: number;
      moved: boolean;
    }
  | {
      type: 'marquee';
      additive: boolean;
      zoneId: string | null;
      startX: number;
      startY: number;
      rectLeft: number;
      rectTop: number;
      moved: boolean;
    };

type Tool = 'select' | 'place' | 'zone' | 'template';

interface FloorMapProps {
  location: Location;
  seats: Seat[];
  zones?: Zone[];
  memberById: Map<string, Member>;
  colorMap: Map<string, DepartmentColor>;
  mode: 'view' | 'edit';
  nameMode?: NameMode;
  tool?: Tool;
  template?: SeatTemplate | null;
  cursorPosRef?: React.MutableRefObject<RelPoint | null> | null;
  flowName?: string | null;
  selectedSeatIds?: Set<string>;
  selectedZoneId?: string | null;
  editingSeatId?: string | null;
  editingZoneId?: string | null;
  highlightIds?: Set<string>;
  searchActive?: boolean;
  onSelectSeat?: (id: string | null) => void;
  onSelectSeats?: (ids: string[]) => void;
  onToggleSeat?: (id: string) => void;
  onSeatClick?: (id: string) => void;
  onMoveSeat?: (id: string, x: number, y: number) => void;
  onMoveSeats?: (moves: { id: string; x: number; y: number }[]) => void;
  onResizeSeat?: (id: string, patch: { w: number; h: number; x: number; y: number }) => void;
  onRotateSeat?: (id: string, rotation: number) => void;
  onSeatTap?: (seatId: string | null, x?: number, y?: number) => void;
  onAddSeatAt?: (x: number, y: number) => void;
  onAddSeatsAt?: (points: RelPoint[]) => void;
  onPlaceTemplate?: (x: number, y: number) => void;
  onFlowClickSeat?: (seatId: string) => void;
  onFlowPlace?: (x: number, y: number) => void;
  onCommitName?: (seatId: string, value: string, opts?: { advance?: number }) => void;
  onCancelName?: () => void;
  onSelectZone?: (id: string | null) => void;
  onAddZone?: (rect: RelRect) => void;
  onMoveZone?: (id: string, x: number, y: number) => void;
  onResizeZone?: (id: string, rect: RelRect) => void;
  onCommitZoneLabel?: (id: string, value: string) => void;
  onCancelZoneLabel?: () => void;
  onDropFile?: (file: File) => void;
}

/**
 * 図面 + 座席のマップ表示。ズーム/パン対応 (ホイール・ピンチ・ドラッグ)。
 * mode='edit':
 *   - tool='select': 座席クリックで選択のみ (Delete で削除可能)、座席ダブルクリックでインライン名前編集、
 *                    ドラッグで移動、背景ダブルクリックで座席追加
 *                    背景ドラッグで矩形選択 (Shift で既存選択に追加)、Shift+クリックで選択トグル、選択席のドラッグで一括移動
 *                    パンは Space+ドラッグ / 中ボタンドラッグ / 2本指 / ピンチ
 *                    エリア (ゾーン) クリックで選択、選択中エリアのドラッグで移動・四隅ハンドルでリサイズ
 *   - tool='place'    : 空き場所クリックで座席を配置 (連続配置)、ドラッグで一列スタンプ配置
 *   - tool='zone'     : ドラッグで矩形を描いてエリア (ゾーン) を追加
 *   - tool='template' : クリック位置に机テンプレート (template prop) を一式配置。マウス追従プレビューあり
 *   - flowName あり: 流し込みモード。座席/空き場所クリックで次の名前を割り当て
 * mode='view' では座席タップで詳細ポップオーバーを開く (エリアは表示のみで操作不可)。背景ドラッグ=パン。
 * cursorPosRef: ホバー中のマウス位置 (相対座標) を書き込む ref (コピペの貼り付け基準用。キャンバス外は null)
 */
export default function FloorMap({
  location,
  seats,
  zones = [],
  memberById,
  colorMap,
  mode,
  nameMode = 'nickname',
  tool = 'select',
  template = null,
  cursorPosRef = null,
  flowName = null,
  selectedSeatIds,
  selectedZoneId = null,
  editingSeatId,
  editingZoneId = null,
  highlightIds,
  searchActive,
  onSelectSeat,
  onSelectSeats,
  onToggleSeat,
  onSeatClick,
  onMoveSeat,
  onMoveSeats,
  onResizeSeat,
  onRotateSeat,
  onSeatTap,
  onAddSeatAt,
  onAddSeatsAt,
  onPlaceTemplate,
  onFlowClickSeat,
  onFlowPlace,
  onCommitName,
  onCancelName,
  onSelectZone,
  onAddZone,
  onMoveZone,
  onResizeZone,
  onCommitZoneLabel,
  onCancelZoneLabel,
  onDropFile,
}: FloorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 0.4, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  // ユーザーが手動でズーム/パンしたか (false の間はリサイズ時に自動フィット)
  const interactedRef = useRef(false);
  // 図面ファイルのドラッグオーバー表示 (dragenter/dragleave はネストで連続発火するためカウンタで管理)
  const [draggingFile, setDraggingFile] = useState(false);
  const dragCountRef = useRef(0);
  // 矩形選択 (コンテナ相対の画面座標)
  const [marquee, setMarquee] = useState<RelRect | null>(null); // {x, y, w, h}
  // 一列スタンプ配置のプレビュー (相対座標の配列)
  const [stamp, setStamp] = useState<{ points: RelPoint[] } | null>(null);
  // エリア (ゾーン) 描画中のプレビュー矩形 (相対座標)
  const [zoneDraft, setZoneDraft] = useState<RelRect | null>(null);
  // スナップ吸着ガイド線 (相対座標)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null } | null>(null);
  // テンプレート配置プレビューのカーソル位置 (相対座標)
  const [tplCursor, setTplCursor] = useState<RelPoint | null>(null);
  // Space 押下中フラグ (編集モードでは背景ドラッグが矩形選択になるため、Space+ドラッグでパン)
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  // 直前の席クリック (画面座標 + 時刻)。席を選択するとツールバー出現でレイアウトがずれ、
  // ダブルクリックの 2 回目が背景に落ちることがあるため、その救済判定に使う
  const lastSeatClickRef = useRef<{ seatId: string; x: number; y: number; time: number } | null>(
    null
  );

  useEffect(() => {
    if (tool !== 'template') setTplCursor(null);
  }, [tool]);

  // Space キーの押下状態を監視 (編集モードのみ。入力欄/ボタンへの Space は除外)
  useEffect(() => {
    if (mode !== 'edit') return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault(); // ページスクロール等の既定動作を抑止
      if (!e.repeat) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      spaceRef.current = false;
      setSpaceHeld(false);
    };
  }, [mode]);

  const hasImage = !!location.floorImage;
  const W = hasImage ? location.imageWidth || BLANK_CANVAS.width : BLANK_CANVAS.width;
  const H = hasImage ? location.imageHeight || BLANK_CANVAS.height : BLANK_CANVAS.height;

  const seatW = Math.min(
    300,
    Math.max(24, Math.round(Math.min(150, Math.max(56, W / 16)) * (location.seatScale ?? 1)))
  );
  const seatH = Math.round(seatW * 0.62);

  const seatById = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth || 1;
    const ch = el.clientHeight || 1;
    const scale = Math.min(cw / W, ch / H) * 0.95;
    setView({ scale, tx: (cw - W * scale) / 2, ty: (ch - H * scale) / 2 });
  }, [W, H]);

  // 拠点切替・画像変更時にフィット (自動フィット追随も再開)
  useEffect(() => {
    interactedRef.current = false;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.id, W, H]);

  // 手動操作するまではコンテナサイズ変化 (パネル開閉・ウィンドウリサイズ等) に自動フィットで追随
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!interactedRef.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setView((v) => {
      const scale = Math.min(4, Math.max(0.05, v.scale * factor));
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const ratio = scale / v.scale;
      return {
        scale,
        tx: px - (px - v.tx) * ratio,
        ty: py - (py - v.ty) * ratio,
      };
    });
  }, []);

  // ホイール: 2本指スクロール=パン / Ctrl+スクロール・トラックパッドのピンチ=ズーム
  // (macOS のピンチは ctrlKey=true の wheel イベントとして届く)
  // passive: false で preventDefault する必要がある
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      interactedRef.current = true;
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      } else {
        setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const clientToRel = useCallback(
    (clientX: number, clientY: number): RelPoint => {
      const el = containerRef.current;
      const rect = el!.getBoundingClientRect();
      const v = viewRef.current;
      return {
        x: (clientX - rect.left - v.tx) / v.scale / W,
        y: (clientY - rect.top - v.ty) / v.scale / H,
      };
    },
    [W, H]
  );

  /**
   * スマートスナップ: 他の席の X/Y (画面距離 8px 以内) に吸着する。
   * 無地キャンバスでは 50px グリッドへのスナップも併用。
   * 戻り値の guideX/guideY は吸着が発生した相対座標 (ガイド線描画用)。
   */
  const snapPosition = useCallback(
    (nx: number, ny: number, excludeIds: Set<string> | null) => {
      const v = viewRef.current;
      const thX = 8 / (v.scale * W);
      const thY = 8 / (v.scale * H);
      let bestX: number | null = null;
      let bestY: number | null = null;
      let dX = Infinity;
      let dY = Infinity;
      for (const s of seats) {
        if (excludeIds?.has(s.id)) continue;
        const ddx = Math.abs(s.x - nx);
        if (ddx <= thX && ddx < dX) {
          dX = ddx;
          bestX = s.x;
        }
        const ddy = Math.abs(s.y - ny);
        if (ddy <= thY && ddy < dY) {
          dY = ddy;
          bestY = s.y;
        }
      }
      if (!hasImage) {
        // 無地キャンバスは 50px グリッドにもスナップ
        const gx = (Math.round((nx * W) / 50) * 50) / W;
        const gy = (Math.round((ny * H) / 50) * 50) / H;
        if (Math.abs(gx - nx) <= thX && Math.abs(gx - nx) < dX) {
          dX = Math.abs(gx - nx);
          bestX = gx;
        }
        if (Math.abs(gy - ny) <= thY && Math.abs(gy - ny) < dY) {
          dY = Math.abs(gy - ny);
          bestY = gy;
        }
      }
      return { x: bestX ?? nx, y: bestY ?? ny, guideX: bestX, guideY: bestY };
    },
    [seats, W, H, hasImage]
  );

  function pinchInfo() {
    const pts = [...pointersRef.current.values()];
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return {
      dist: Math.hypot(dx, dy) || 1,
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current;
    try {
      el?.setPointerCapture?.(e.pointerId);
    } catch {
      // 一部環境で pointerId が無効な場合があるが、キャプチャ無しでも動作する
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      interactedRef.current = true;
      setMarquee(null);
      setStamp(null);
      setZoneDraft(null);
      const { dist, midX, midY } = pinchInfo();
      const v = viewRef.current;
      gestureRef.current = {
        type: 'pinch',
        startDist: dist,
        startScale: v.scale,
        startTx: v.tx,
        startTy: v.ty,
        startMidX: midX,
        startMidY: midY,
      };
      return;
    }

    // 中ボタンドラッグ / Space+ドラッグはどこを掴んでもパン (席やハンドルの上からでも)
    if (e.button === 1 || spaceRef.current) {
      e.preventDefault(); // 中ボタンのオートスクロール等を抑止
      const v = viewRef.current;
      gestureRef.current = {
        type: 'pan',
        seatId: null,
        zoneId: null,
        startX: e.clientX,
        startY: e.clientY,
        origTx: v.tx,
        origTy: v.ty,
        moved: false,
      };
      return;
    }

    const target = e.target as HTMLElement;

    // 座席のリサイズ/回転ハンドル (単一選択時のみ描画される) を最優先で判定
    if (mode === 'edit' && flowName == null) {
      const seatHandleEl = target.closest?.('[data-seat-handle]') as HTMLElement | null;
      if (seatHandleEl) {
        const s = seatById.get(seatHandleEl.dataset.seatHandleId!);
        if (s) {
          gestureRef.current = {
            type: 'seat-resize',
            seatId: s.id,
            edge: seatHandleEl.dataset.seatHandle!, // 'e' | 's' | 'se'
            startX: e.clientX,
            startY: e.clientY,
            orig: { x: s.x, y: s.y, w: s.w ?? 1, h: s.h ?? 1, rotation: s.rotation ?? 0 },
          };
          return;
        }
      }
      const rotateEl = target.closest?.('[data-seat-rotate]') as HTMLElement | null;
      if (rotateEl) {
        const s = seatById.get(rotateEl.dataset.seatRotate!);
        if (s) {
          // 回転中も席の中心は動かないので、開始時点の中心 (画面座標) を保持
          const rect = el!.getBoundingClientRect();
          const v = viewRef.current;
          gestureRef.current = {
            type: 'seat-rotate',
            seatId: s.id,
            startX: e.clientX,
            startY: e.clientY,
            moved: false,
            cx: rect.left + v.tx + s.x * W * v.scale,
            cy: rect.top + v.ty + s.y * H * v.scale,
          };
          return;
        }
      }
    }

    // エリアのリサイズハンドル (選択中エリアのみ描画される) を最優先で判定
    const handleEl = target.closest?.('[data-zone-handle]') as HTMLElement | null;
    if (handleEl && mode === 'edit' && flowName == null) {
      const z = zoneById.get(handleEl.dataset.zoneId!);
      if (z) {
        gestureRef.current = {
          type: 'zone-resize',
          zoneId: z.id,
          corner: handleEl.dataset.zoneHandle!,
          startX: e.clientX,
          startY: e.clientY,
          orig: { x: z.x, y: z.y, w: z.w, h: z.h },
        };
        return;
      }
    }

    const seatEl = target.closest?.('[data-seat-id]') as HTMLElement | null;
    const seatId = seatEl?.dataset.seatId ?? null;
    // エリアは座席より背面なので、座席が乗っていない部分のクリックでのみヒットする
    const zoneEl = target.closest?.('[data-zone-id]') as HTMLElement | null;
    const zoneId = zoneEl?.dataset.zoneId ?? null;

    if (seatId && mode === 'edit') {
      if (e.shiftKey && flowName == null) {
        // Shift+席クリック: 選択トグル (ドラッグは開始しない)
        gestureRef.current = { type: 'toggle', seatId };
        return;
      }
      const seat = seatById.get(seatId)!;
      // 選択中の席を掴んだ場合は選択席全体を一括移動の対象にする
      const inSelection = selectedSeatIds?.has(seatId) && selectedSeatIds.size > 1;
      const items = inSelection
        ? seats
            .filter((s) => selectedSeatIds!.has(s.id))
            .map((s) => ({ id: s.id, origX: s.x, origY: s.y }))
        : [{ id: seatId, origX: seat.x, origY: seat.y }];
      gestureRef.current = {
        type: 'seat',
        seatId,
        items,
        startX: e.clientX,
        startY: e.clientY,
        origX: seat.x,
        origY: seat.y,
        moved: false,
      };
    } else if (mode === 'edit' && flowName == null && tool === 'zone') {
      // エリアツール: ドラッグで矩形を描いてエリアを追加
      const start = clientToRel(e.clientX, e.clientY);
      gestureRef.current = {
        type: 'zone-draw',
        startX: e.clientX,
        startY: e.clientY,
        origin: {
          x: Math.min(1, Math.max(0, start.x)),
          y: Math.min(1, Math.max(0, start.y)),
        },
        rect: null,
        moved: false,
      };
    } else if (mode === 'edit' && flowName == null && tool === 'place') {
      // 配置モード: クリックで1席 / ドラッグで一列スタンプ
      const start = clientToRel(e.clientX, e.clientY);
      const snapped = snapPosition(start.x, start.y, null);
      gestureRef.current = {
        type: 'stamp',
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: snapped.x, y: snapped.y },
        points: null,
        moved: false,
      };
    } else if (mode === 'edit' && flowName == null && tool === 'template') {
      // テンプレート配置モード: クリック (ポインタアップ位置) にテンプレート一式を配置
      gestureRef.current = {
        type: 'template',
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
    } else if (
      mode === 'edit' &&
      flowName == null &&
      tool === 'select' &&
      zoneId &&
      zoneId === selectedZoneId
    ) {
      // 選択中のエリアを掴んだ場合のみドラッグ移動 (未選択エリア上はパン + クリックで選択)
      const z = zoneById.get(zoneId)!;
      gestureRef.current = {
        type: 'zone-move',
        zoneId,
        startX: e.clientX,
        startY: e.clientY,
        origX: z.x,
        origY: z.y,
        w: z.w,
        h: z.h,
        moved: false,
      };
    } else if (mode === 'edit' && flowName == null && tool === 'select') {
      // 背景の左ドラッグ = 矩形選択 (Shift 押下中は既存選択への追加)。クリック (移動なし) は
      // エリア選択 / 選択解除として扱う。パンは Space+ドラッグ / 中ボタン / 2本指 / ピンチ
      const rect = el!.getBoundingClientRect();
      gestureRef.current = {
        type: 'marquee',
        additive: e.shiftKey,
        zoneId,
        startX: e.clientX,
        startY: e.clientY,
        rectLeft: rect.left,
        rectTop: rect.top,
        moved: false,
      };
    } else {
      const v = viewRef.current;
      gestureRef.current = {
        type: 'pan',
        seatId,
        zoneId: null,
        startX: e.clientX,
        startY: e.clientY,
        origTx: v.tx,
        origTy: v.ty,
        moved: false,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // ホバー中のカーソル位置 (相対座標) を記録 (コピペの貼り付け基準・テンプレートプレビュー用)
    if (cursorPosRef || (mode === 'edit' && tool === 'template')) {
      const rel = clientToRel(e.clientX, e.clientY);
      if (cursorPosRef) cursorPosRef.current = rel;
      if (mode === 'edit' && tool === 'template') setTplCursor(rel);
    }
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;

    if (g.type === 'pinch' && pointersRef.current.size >= 2) {
      const el = containerRef.current;
      const rect = el!.getBoundingClientRect();
      const { dist, midX, midY } = pinchInfo();
      const scale = Math.min(4, Math.max(0.05, g.startScale * (dist / g.startDist)));
      const ratio = scale / g.startScale;
      const px = g.startMidX - rect.left;
      const py = g.startMidY - rect.top;
      setView({
        scale,
        tx: px - (px - g.startTx) * ratio + (midX - g.startMidX),
        ty: py - (py - g.startTy) * ratio + (midY - g.startMidY),
      });
      return;
    }
    // pinch でポインタが 2 本未満の場合、以降の分岐はどれにも該当せず no-op (元実装と同じ)
    if (g.type === 'pinch') return;

    if (g.type === 'toggle') return;

    if (g.type === 'seat-rotate') {
      // クリックだけ (ドラッグなし) で回転値が書き換わらないよう、4px 動くまでは何もしない
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) <= 4) return;
      g.moved = true;
      // ハンドルは席の上方向に付くので、中心→ポインタの角度 +90° が席の回転角
      let deg = (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180) / Math.PI + 90;
      // 15° スナップ (Shift 押下中はフリー回転)
      if (!e.shiftKey) deg = Math.round(deg / 15) * 15;
      onRotateSeat?.(g.seatId, ((deg % 360) + 360) % 360);
      return;
    }

    if (g.type === 'seat-resize') {
      // クリックだけ (ドラッグなし) で mutate しないよう、4px 動くまでは何もしない
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) <= 4) return;
      g.moved = true;
      const v = viewRef.current;
      // ポインタ移動量を席のローカル座標系 (回転を打ち消した軸) に射影する
      const dxc = (e.clientX - g.startX) / v.scale;
      const dyc = (e.clientY - g.startY) / v.scale;
      const th = (g.orig.rotation * Math.PI) / 180;
      const lx = dxc * Math.cos(th) + dyc * Math.sin(th);
      const ly = -dxc * Math.sin(th) + dyc * Math.cos(th);
      // 0.25 刻みスナップ + 0.5〜6.0 クランプ
      const snapSize = (val: number) => Math.min(6, Math.max(0.5, Math.round(val * 4) / 4));
      let w = g.orig.w;
      let h = g.orig.h;
      if (g.edge.includes('e')) w = snapSize(g.orig.w + lx / seatW);
      if (g.edge.includes('s')) h = snapSize(g.orig.h + ly / seatH);
      // 反対側の辺を固定するため、中心をサイズ変化の半分だけローカル軸方向に移動
      const sx = ((w - g.orig.w) * seatW) / 2;
      const sy = ((h - g.orig.h) * seatH) / 2;
      const gx = sx * Math.cos(th) - sy * Math.sin(th);
      const gy = sx * Math.sin(th) + sy * Math.cos(th);
      onResizeSeat?.(g.seatId, {
        w,
        h,
        x: Math.min(1, Math.max(0, g.orig.x + gx / W)),
        y: Math.min(1, Math.max(0, g.orig.y + gy / H)),
      });
      return;
    }

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) > 4) g.moved = true;

    if (g.type === 'seat' && g.moved) {
      const v = viewRef.current;
      let nx = Math.min(1, Math.max(0, g.origX + dx / v.scale / W));
      let ny = Math.min(1, Math.max(0, g.origY + dy / v.scale / H));
      // スマートスナップ (Alt 押下中は無効)。複数選択時は基準席のみ吸着し、他は同じ差分で追従
      if (!e.altKey) {
        const excl = new Set(g.items.map((it) => it.id));
        const snapped = snapPosition(nx, ny, excl);
        nx = snapped.x;
        ny = snapped.y;
        setGuides(
          snapped.guideX != null || snapped.guideY != null
            ? { x: snapped.guideX, y: snapped.guideY }
            : null
        );
      } else {
        setGuides(null);
      }
      if (g.items.length > 1) {
        const sdx = nx - g.origX;
        const sdy = ny - g.origY;
        onMoveSeats?.(
          g.items.map((it) => ({
            id: it.id,
            x: Math.min(1, Math.max(0, it.origX + sdx)),
            y: Math.min(1, Math.max(0, it.origY + sdy)),
          }))
        );
      } else {
        onMoveSeat?.(g.seatId, nx, ny);
      }
    } else if (g.type === 'marquee' && g.moved) {
      setMarquee({
        x: Math.min(g.startX, e.clientX) - g.rectLeft,
        y: Math.min(g.startY, e.clientY) - g.rectTop,
        w: Math.abs(e.clientX - g.startX),
        h: Math.abs(e.clientY - g.startY),
      });
    } else if (g.type === 'stamp' && g.moved) {
      // 開始点から現在点への直線上に seatW*1.15 間隔で席プレビューを並べる
      const cur = clientToRel(e.clientX, e.clientY);
      const sx = g.origin.x * W;
      const sy = g.origin.y * H;
      let ddx = cur.x * W - sx;
      let ddy = cur.y * H - sy;
      const angle = (Math.atan2(Math.abs(ddy), Math.abs(ddx)) * 180) / Math.PI;
      // 水平/垂直 ±10° 以内は軸スナップして真っ直ぐな列に
      if (angle <= 10) ddy = 0;
      else if (angle >= 80) ddx = 0;
      const len = Math.hypot(ddx, ddy);
      const spacing = seatW * 1.15;
      const count = Math.max(1, Math.floor(len / spacing) + 1);
      const ux = len ? ddx / len : 0;
      const uy = len ? ddy / len : 0;
      const points: RelPoint[] = [];
      for (let i = 0; i < count; i++) {
        const px = (sx + ux * spacing * i) / W;
        const py = (sy + uy * spacing * i) / H;
        if (px < 0 || px > 1 || py < 0 || py > 1) break;
        points.push({ x: px, y: py });
      }
      g.points = points;
      setStamp({ points });
    } else if (g.type === 'zone-draw' && g.moved) {
      const cur = clientToRel(e.clientX, e.clientY);
      const cx = Math.min(1, Math.max(0, cur.x));
      const cy = Math.min(1, Math.max(0, cur.y));
      const rect = {
        x: Math.min(g.origin.x, cx),
        y: Math.min(g.origin.y, cy),
        w: Math.abs(cx - g.origin.x),
        h: Math.abs(cy - g.origin.y),
      };
      g.rect = rect;
      setZoneDraft(rect);
    } else if (g.type === 'zone-move' && g.moved) {
      const v = viewRef.current;
      const nx = Math.min(Math.max(0, g.origX + dx / v.scale / W), Math.max(0, 1 - g.w));
      const ny = Math.min(Math.max(0, g.origY + dy / v.scale / H), Math.max(0, 1 - g.h));
      onMoveZone?.(g.zoneId, nx, ny);
    } else if (g.type === 'zone-resize') {
      const v = viewRef.current;
      const rdx = dx / v.scale / W;
      const rdy = dy / v.scale / H;
      const minW = 24 / W;
      const minH = 24 / H;
      let { x, y } = g.orig;
      const { w, h } = g.orig;
      let x2 = x + w;
      let y2 = y + h;
      if (g.corner.includes('e')) x2 = Math.min(1, Math.max(x + minW, x2 + rdx));
      if (g.corner.includes('w')) x = Math.max(0, Math.min(x2 - minW, x + rdx));
      if (g.corner.includes('s')) y2 = Math.min(1, Math.max(y + minH, y2 + rdy));
      if (g.corner.includes('n')) y = Math.max(0, Math.min(y2 - minH, y + rdy));
      onResizeZone?.(g.zoneId, { x, y, w: x2 - x, h: y2 - y });
    } else if (g.type === 'pan' && g.moved) {
      setView((v) => ({ ...v, tx: g.origTx + dx, ty: g.origTy + dy }));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;
    if (!g) return;
    if (g.type === 'pinch') {
      if (pointersRef.current.size < 2) gestureRef.current = null;
      return;
    }
    gestureRef.current = null;
    setGuides(null);

    if (g.type === 'toggle') {
      onToggleSeat?.(g.seatId);
      return;
    }

    if (g.type === 'marquee') {
      setMarquee(null);
      if (!g.moved) {
        // 背景クリック (移動なし): エリア選択 or 選択解除
        if (g.zoneId) {
          onSelectZone?.(g.zoneId);
          onCancelName?.();
        } else {
          onSelectSeat?.(null);
          onCancelName?.();
          onCancelZoneLabel?.();
        }
        return;
      }
      const a = clientToRel(Math.min(g.startX, e.clientX), Math.min(g.startY, e.clientY));
      const b = clientToRel(Math.max(g.startX, e.clientX), Math.max(g.startY, e.clientY));
      const ids = seats
        .filter((s) => s.x >= a.x && s.x <= b.x && s.y >= a.y && s.y <= b.y)
        .map((s) => s.id);
      // Shift+ドラッグは既存選択への追加 (従来挙動の維持)
      onSelectSeats?.(g.additive ? [...new Set([...(selectedSeatIds ?? []), ...ids])] : ids);
      return;
    }

    if (g.type === 'template') {
      // クリック位置 (アップ時) にテンプレート一式を配置。アンカーは他席へスマートスナップ
      const { x, y } = clientToRel(e.clientX, e.clientY);
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        const snapped = snapPosition(x, y, null);
        onPlaceTemplate?.(snapped.x, snapped.y);
      }
      return;
    }

    if (g.type === 'zone-draw') {
      setZoneDraft(null);
      // 画面上で見て十分な大きさ (図面換算 16px 以上) の矩形のみ追加
      if (g.moved && g.rect && g.rect.w * W >= 16 && g.rect.h * H >= 16) {
        onAddZone?.(g.rect);
      }
      return;
    }

    if (
      g.type === 'zone-move' ||
      g.type === 'zone-resize' ||
      g.type === 'seat-resize' ||
      g.type === 'seat-rotate'
    ) {
      return;
    }

    if (g.type === 'stamp') {
      setStamp(null);
      if (!g.moved) {
        const { x, y } = g.origin;
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onAddSeatAt?.(x, y);
      } else if (g.points?.length) {
        onAddSeatsAt?.(g.points);
      }
      return;
    }

    if (g.type === 'seat') {
      if (!g.moved) {
        if (flowName != null) {
          onFlowClickSeat?.(g.seatId);
        } else {
          // クリックは選択のみ (名前編集はダブルクリック or Enter)。直後の Delete で削除できる
          lastSeatClickRef.current = {
            seatId: g.seatId,
            x: e.clientX,
            y: e.clientY,
            time: performance.now(),
          };
          onSelectSeat?.(g.seatId);
        }
      } else if (g.items.length === 1) {
        // 単独移動完了後も選択状態にする (複数選択の一括移動は選択を維持)
        onSelectSeat?.(g.seatId);
      }
    } else if (g.type === 'pan' && g.moved) {
      interactedRef.current = true;
    } else if (g.type === 'pan' && !g.moved) {
      if (mode === 'view') {
        if (g.seatId) {
          onSeatTap?.(g.seatId, e.clientX, e.clientY);
        } else {
          onSeatTap?.(null);
        }
        return;
      }
      // 編集モード: 空き場所のクリック
      const { x, y } = clientToRel(e.clientX, e.clientY);
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (flowName != null && inside) {
        onFlowPlace?.(x, y);
      } else if (tool === 'place' && inside) {
        const snapped = snapPosition(x, y, null);
        onAddSeatAt?.(snapped.x, snapped.y);
      } else if (g.zoneId) {
        // 座席が乗っていない部分のエリアをクリック → エリアを選択
        onSelectZone?.(g.zoneId);
        onCancelName?.();
      } else {
        onSelectSeat?.(null);
        onCancelName?.();
        onCancelZoneLabel?.();
      }
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    // place/template モードはクリックごとに配置済みなので、ダブルクリックで余計な単席を追加しない
    if (mode !== 'edit' || flowName != null || tool === 'place' || tool === 'template') return;
    const target = e.target as HTMLElement;
    let seatId = (target.closest?.('[data-seat-id]') as HTMLElement | null)?.dataset.seatId ?? null;
    if (!seatId) {
      // 1 回目の席クリックで選択ツールバーが出現してレイアウトがずれ、2 回目のクリックが
      // 背景に落ちた場合の救済: 直前の席クリックとほぼ同位置・短時間ならその席への
      // ダブルクリックとみなす
      const last = lastSeatClickRef.current;
      if (
        last &&
        performance.now() - last.time < 700 &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < 10
      ) {
        seatId = last.seatId;
      }
    }
    if (seatId) {
      // 席のダブルクリック: インライン名前編集を開く (背景ダブルクリック=席追加とは区別)
      if (tool === 'select') onSeatClick?.(seatId);
      return;
    }
    const { x, y } = clientToRel(e.clientX, e.clientY);
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const snapped = snapPosition(x, y, null);
    onAddSeatAt?.(snapped.x, snapped.y);
  }

  // インライン名前入力の対象座席 (画面座標で重ねる)
  const editingSeat = editingSeatId ? seatById.get(editingSeatId) : null;
  const editingMember = editingSeat?.memberId ? memberById.get(editingSeat.memberId) : null;

  const hint =
    mode !== 'edit'
      ? null
      : flowName != null
        ? '席または空き場所をクリックすると次の名前が入ります / Esc で終了'
        : tool === 'place'
          ? 'クリックで席を配置 (名前入力は Enter 確定・Tab で隣の席へ) / ドラッグで一列に並べて配置 / Esc で配置モード終了'
          : tool === 'zone'
            ? '図面上をドラッグして矩形を描くとエリアを追加できます / Esc でエリアツール終了'
            : tool === 'template'
              ? `クリックで「${template?.label ?? 'テンプレート'}」を一式配置 (連続配置できます) / Esc で終了`
              : '席をクリックで選択 (Delete で削除) / ダブルクリックか Enter で名前編集 (Tab で隣の席へ) / ドラッグで移動 / 背景ドラッグで範囲選択 (Shift で追加) / Space+ドラッグ・中ボタンでパン / Cmd/Ctrl+C→V でコピペ / 背景ダブルクリックで席追加';

  // 編集モード時のみ図面ファイル (PDF/画像) のドロップを受け付ける。
  // pointer イベントとは独立した DOM イベントなのでジェスチャ処理への影響はない。
  const fileDropEnabled = mode === 'edit' && !!onDropFile;
  const dndHandlers: Pick<
    React.HTMLAttributes<HTMLDivElement>,
    'onDragEnter' | 'onDragOver' | 'onDragLeave' | 'onDrop'
  > = fileDropEnabled
    ? {
        onDragEnter: (e) => {
          if (!e.dataTransfer?.types?.includes('Files')) return;
          e.preventDefault();
          dragCountRef.current += 1;
          setDraggingFile(true);
        },
        onDragOver: (e) => {
          if (!e.dataTransfer?.types?.includes('Files')) return;
          e.preventDefault();
        },
        onDragLeave: () => {
          dragCountRef.current = Math.max(0, dragCountRef.current - 1);
          if (dragCountRef.current === 0) setDraggingFile(false);
        },
        onDrop: (e) => {
          e.preventDefault();
          dragCountRef.current = 0;
          setDraggingFile(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) onDropFile?.(file);
        },
      }
    : {};

  const guideThickness = Math.max(1 / view.scale, 0.5);
  const lastStampPoint = stamp?.points?.length ? stamp.points[stamp.points.length - 1] : null;

  // エリア (ゾーン) の描画パラメータ
  const zoneLabelFont = Math.max(13, Math.round(seatW * 0.28));
  const zoneHandleSize = Math.min(48, Math.max(10, 12 / view.scale)); // 画面上でほぼ一定サイズ
  const editingZone = editingZoneId ? zoneById.get(editingZoneId) : null;

  // 座席のリサイズ/回転ハンドル (単一選択時のみ)。画面上でほぼ一定サイズ
  const seatHandleSize = Math.min(40, Math.max(8, 11 / view.scale));
  const rotateHandleGap = Math.min(80, Math.max(16, 24 / view.scale));
  const handleSeat =
    mode === 'edit' && tool === 'select' && flowName == null && selectedSeatIds?.size === 1
      ? (seatById.get([...selectedSeatIds][0]) ?? null)
      : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex-1 min-h-0 overflow-hidden bg-slate-200 touch-none select-none',
        mode === 'edit' &&
          (tool === 'place' || tool === 'zone' || tool === 'template' || flowName != null) &&
          'cursor-crosshair',
        spaceHeld && 'cursor-grab'
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        if (cursorPosRef) cursorPosRef.current = null;
        setTplCursor(null);
      }}
      onDoubleClick={onDoubleClick}
      {...dndHandlers}
    >
      <div
        className="absolute shadow-lg"
        style={{
          width: W,
          height: H,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {hasImage ? (
          <img
            src={location.floorImage!}
            alt={location.name}
            width={W}
            height={H}
            className="absolute inset-0 h-full w-full pointer-events-none"
            draggable={false}
          />
        ) : (
          <div
            className="absolute inset-0 bg-white pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)',
              backgroundSize: '50px 50px',
            }}
          />
        )}

        {/* エリア (ゾーン): 座席より背面に半透明で描画 (z順: 図面 → ゾーン → 座席) */}
        {zones.map((z) => {
          const c = zoneColor(z.color);
          const selected = mode === 'edit' && selectedZoneId === z.id;
          return (
            <div
              key={z.id}
              data-zone-id={z.id}
              className={cn(
                'absolute rounded-md border-2',
                mode === 'edit' && tool === 'select' && flowName == null
                  ? selected
                    ? 'cursor-move'
                    : 'cursor-pointer'
                  : 'pointer-events-none',
                selected && 'ring-2 ring-blue-500/80'
              )}
              style={{
                left: z.x * W,
                top: z.y * H,
                width: z.w * W,
                height: z.h * H,
                background: c.fill,
                borderColor: c.border,
              }}
            >
              {z.label ? (
                <div
                  className="pointer-events-none absolute left-1.5 top-1 max-w-full truncate pr-1.5 font-bold leading-tight"
                  style={{ fontSize: zoneLabelFont, color: c.text }}
                >
                  {z.label}
                </div>
              ) : null}
              {selected
                ? ['nw', 'ne', 'sw', 'se'].map((corner) => (
                    <div
                      key={corner}
                      data-zone-handle={corner}
                      data-zone-id={z.id}
                      className="absolute z-10 rounded-sm border border-white bg-blue-600 shadow"
                      style={{
                        width: zoneHandleSize,
                        height: zoneHandleSize,
                        left: corner.includes('w') ? -zoneHandleSize / 2 : undefined,
                        right: corner.includes('e') ? -zoneHandleSize / 2 : undefined,
                        top: corner.includes('n') ? -zoneHandleSize / 2 : undefined,
                        bottom: corner.includes('s') ? -zoneHandleSize / 2 : undefined,
                        cursor:
                          corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                      }}
                    />
                  ))
                : null}
            </div>
          );
        })}

        {/* エリア描画中のプレビュー矩形 */}
        {zoneDraft ? (
          <div
            className="pointer-events-none absolute z-30 rounded-md border-2 border-dashed border-blue-500 bg-blue-400/15"
            style={{
              left: zoneDraft.x * W,
              top: zoneDraft.y * H,
              width: zoneDraft.w * W,
              height: zoneDraft.h * H,
            }}
          />
        ) : null}

        {seats.map((seat) => {
          const member = seat.memberId ? memberById.get(seat.memberId) : null;
          const highlighted = highlightIds?.has(seat.id);
          return (
            <SeatNode
              key={seat.id}
              seat={seat}
              member={member}
              colorMap={colorMap}
              seatW={seatW}
              seatH={seatH}
              W={W}
              H={H}
              selected={mode === 'edit' && !!selectedSeatIds?.has(seat.id)}
              highlighted={highlighted}
              dimmed={!!searchActive && !highlighted}
              nameMode={nameMode}
            />
          );
        })}

        {/* 座席のリサイズ/回転ハンドル (単一選択時)。席本体は overflow-hidden のため
            同じ位置・回転のオーバーレイとして席の外側に描画する */}
        {handleSeat
          ? (() => {
              const cw = Math.round(seatW * (handleSeat.w ?? 1));
              const ch = Math.round(seatH * (handleSeat.h ?? 1));
              const hs = seatHandleSize;
              const handleBase =
                'absolute rounded-sm border border-white bg-blue-600 shadow';
              return (
                <div
                  className="pointer-events-none absolute z-30"
                  style={{
                    left: handleSeat.x * W,
                    top: handleSeat.y * H,
                    width: cw,
                    height: ch,
                    marginLeft: -cw / 2,
                    marginTop: -ch / 2,
                    transform: `rotate(${handleSeat.rotation}deg)`,
                  }}
                >
                  {/* 回転ハンドル (上部): ドラッグで回転。15° スナップ / Shift でフリー */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 bg-blue-500"
                    style={{ top: -rotateHandleGap, width: Math.max(1, 2 / view.scale), height: rotateHandleGap }}
                  />
                  <div
                    data-seat-rotate={handleSeat.id}
                    className="pointer-events-auto absolute left-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
                    style={{
                      top: -rotateHandleGap,
                      width: hs * 1.2,
                      height: hs * 1.2,
                      transform: 'translate(-50%, -100%)',
                      cursor: 'grab',
                      touchAction: 'none',
                    }}
                    title="ドラッグで回転 (15° スナップ / Shift でフリー回転)"
                  />
                  {/* リサイズハンドル: 右端 (幅)・下端 (高さ)・右下角 (両方) */}
                  <div
                    data-seat-handle="e"
                    data-seat-handle-id={handleSeat.id}
                    className={cn(handleBase, 'pointer-events-auto top-1/2')}
                    style={{
                      right: -hs / 2,
                      marginTop: -hs / 2,
                      width: hs,
                      height: hs,
                      cursor: 'ew-resize',
                      touchAction: 'none',
                    }}
                    title="ドラッグで幅を変更 (0.25 刻み)"
                  />
                  <div
                    data-seat-handle="s"
                    data-seat-handle-id={handleSeat.id}
                    className={cn(handleBase, 'pointer-events-auto left-1/2')}
                    style={{
                      bottom: -hs / 2,
                      marginLeft: -hs / 2,
                      width: hs,
                      height: hs,
                      cursor: 'ns-resize',
                      touchAction: 'none',
                    }}
                    title="ドラッグで高さを変更 (0.25 刻み)"
                  />
                  <div
                    data-seat-handle="se"
                    data-seat-handle-id={handleSeat.id}
                    className={cn(handleBase, 'pointer-events-auto')}
                    style={{
                      right: -hs / 2,
                      bottom: -hs / 2,
                      width: hs,
                      height: hs,
                      cursor: 'nwse-resize',
                      touchAction: 'none',
                    }}
                    title="ドラッグでサイズを変更 (0.25 刻み)"
                  />
                </div>
              );
            })()
          : null}

        {/* テンプレート配置のプレビュー (マウス追従の半透明表示) */}
        {mode === 'edit' &&
        tool === 'template' &&
        template &&
        tplCursor &&
        tplCursor.x >= 0 &&
        tplCursor.x <= 1 &&
        tplCursor.y >= 0 &&
        tplCursor.y <= 1
          ? template.seats.map((t, i) => {
              const tw = seatW * (t.w ?? 1);
              const th = seatH * (t.h ?? 1);
              const cx = tplCursor.x * W + (t.dx ?? 0) * seatW;
              const cy = tplCursor.y * H + (t.dy ?? 0) * seatH;
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute z-30 rounded-md border-2 border-blue-400 bg-blue-300/40"
                  style={{
                    left: cx - tw / 2,
                    top: cy - th / 2,
                    width: tw,
                    height: th,
                    transform: `rotate(${t.rotation ?? 0}deg)`,
                  }}
                />
              );
            })
          : null}

        {/* 一列スタンプ配置のプレビュー */}
        {stamp?.points?.map((p, i) => (
          <div
            key={i}
            className="pointer-events-none absolute rounded-md border-2 border-blue-400 bg-blue-300/40"
            style={{
              left: p.x * W - seatW / 2,
              top: p.y * H - seatH / 2,
              width: seatW,
              height: seatH,
            }}
          />
        ))}

        {/* スナップ吸着ガイド線 */}
        {guides?.x != null ? (
          <div
            className="pointer-events-none absolute z-30 bg-blue-500"
            style={{ left: guides.x * W, top: 0, width: guideThickness, height: H }}
          />
        ) : null}
        {guides?.y != null ? (
          <div
            className="pointer-events-none absolute z-30 bg-blue-500"
            style={{ left: 0, top: guides.y * H, width: W, height: guideThickness }}
          />
        ) : null}
      </div>

      {/* 矩形選択オーバーレイ (画面座標) */}
      {marquee ? (
        <div
          className="pointer-events-none absolute z-30 border border-blue-500 bg-blue-500/10"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      ) : null}

      {/* スタンプ配置の席数バッジ (画面座標) */}
      {lastStampPoint ? (
        <div
          className="pointer-events-none absolute z-40 rounded-full bg-blue-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg"
          style={{
            left: view.tx + lastStampPoint.x * W * view.scale + 14,
            top: view.ty + lastStampPoint.y * H * view.scale - 30,
          }}
        >
          {stamp!.points.length}席
        </div>
      ) : null}

      {/* インライン名前入力 (画面座標に重ねるためスケールの影響を受けない) */}
      {mode === 'edit' && editingSeat ? (
        <InlineNameInput
          key={editingSeat.id}
          left={view.tx + editingSeat.x * W * view.scale}
          top={view.ty + editingSeat.y * H * view.scale}
          width={Math.max(140, seatW * view.scale * 1.3)}
          initial={editingMember ? editingMember.nickname || editingMember.name : editingSeat.name ?? ''}
          onCommit={(value, opts) => onCommitName?.(editingSeat.id, value, opts)}
          onCancel={() => onCancelName?.()}
        />
      ) : null}

      {/* エリアラベルのインライン入力 (画面座標に重ねる) */}
      {mode === 'edit' && editingZone ? (
        <InlineNameInput
          key={'zone-' + editingZone.id}
          left={view.tx + (editingZone.x + editingZone.w / 2) * W * view.scale}
          top={view.ty + editingZone.y * H * view.scale + 22}
          width={200}
          initial={editingZone.label ?? ''}
          placeholder="エリア名を入力"
          onCommit={(value) => onCommitZoneLabel?.(editingZone.id, value)}
          onCancel={() => onCancelZoneLabel?.()}
        />
      ) : null}

      {/* 図面ファイルのドラッグ中オーバーレイ */}
      {fileDropEnabled && draggingFile ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-4 border-dashed border-blue-400 bg-blue-50/60">
          <div className="rounded-md bg-white/90 px-4 py-2 text-sm font-medium text-blue-700 shadow-lg">
            ここに図面 (PDF/画像) をドロップ
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 z-30">
        <Button variant="outline" size="icon" onClick={() => {
          interactedRef.current = true;
          const el = containerRef.current;
          const r = el!.getBoundingClientRect();
          zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25);
        }} title="拡大">
          <Plus />
        </Button>
        <Button variant="outline" size="icon" onClick={() => {
          interactedRef.current = true;
          const el = containerRef.current;
          const r = el!.getBoundingClientRect();
          zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8);
        }} title="縮小">
          <Minus />
        </Button>
        <Button variant="outline" size="icon" onClick={() => {
          interactedRef.current = false;
          fit();
        }} title="全体表示">
          <Maximize />
        </Button>
      </div>

      {hint ? (
        <div className="absolute bottom-3 left-3 z-30 rounded-md bg-black/60 px-3 py-1.5 text-xs text-white pointer-events-none">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
