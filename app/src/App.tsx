import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Eye,
  Pencil,
  RefreshCw,
  Save,
  Database,
  Image as ImageIcon,
  ImageOff,
  Move,
  Plus,
  Minus,
  Search,
  MousePointerClick,
  ListOrdered,
  SquareDashed,
  LayoutGrid,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { getSessionId, loadSession, saveSession, saveWithRetry } from '@/lib/datastore';
import {
  normalizeData,
  createLocation,
  createMember,
  createSeat,
  createZone,
  uid,
  divisionLabel,
  memberColorKey,
  BLANK_CANVAS,
  SEAT_TEMPLATES,
  createDefaultSettings,
  type AppData,
  type Division,
  type Location,
  type Member,
  type NameMode,
  type Seat,
  type SeatTemplate,
  type Zone,
} from '@/lib/model';
import { buildDepartmentColorMap } from '@/lib/colors';
import { compressFloorImage, type CompressedFloorImage } from '@/lib/image';
import { isPdfFile, renderPdfFirstPage } from '@/lib/pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import FloorMap from '@/components/FloorMap';
import LocationTabs from '@/components/LocationTabs';
import SeatToolbar from '@/components/SeatToolbar';
import ZoneToolbar from '@/components/ZoneToolbar';
import MemberPanel, { type DragGhost } from '@/components/MemberPanel';
import MemberEditDialog from '@/components/MemberEditDialog';
import ProfileEditDialog from '@/components/ProfileEditDialog';
import SeatDetailPopover from '@/components/SeatDetailPopover';
import DataIODialog from '@/components/DataIODialog';
import LocationManagerDialog from '@/components/LocationManagerDialog';
import MemberLinkDialog from '@/components/MemberLinkDialog';
import NameFlowDialog, { type FlowEntry } from '@/components/NameFlowDialog';
import SettingsDialog from '@/components/SettingsDialog';
import RosterSyncDialog, { type RosterSyncResult } from '@/components/RosterSyncDialog';

const POLL_INTERVAL_MS = 30000;
const UNDO_LIMIT = 50;

type Mode = 'view' | 'edit';
type Tool = 'select' | 'place' | 'zone' | 'template';

interface MutateOpts {
  /** 直前の push と同じキーなら履歴を積まない (ドラッグ移動の集約用) */
  coalesceKey?: string | null;
  /** Undo 履歴を積まない (undoFlow などの内部復元用) */
  skipHistory?: boolean;
}

interface ConflictState {
  latestEtag: string;
  latestData: AppData;
}

// 流し込みの操作履歴 (「1つ戻す」用)
type FlowAssignRecord = {
  type: 'assign';
  seatId: string;
  prevName: string;
  prevMemberId: string | null;
  entry: FlowEntry;
  memberId: string | null;
};
type FlowRecord =
  | FlowAssignRecord
  | { type: 'place'; seatId: string; entry: FlowEntry; memberId: string | null }
  | { type: 'bulk'; items: FlowAssignRecord[] }
  | { type: 'skip'; entry: FlowEntry };

interface FlowState {
  queue: FlowEntry[];
  total: number;
  history: FlowRecord[];
  registerToLedger: boolean;
}

// コピペ用のアプリ内クリップボードの内容
interface SeatClipboard {
  seats: Seat[];
  cx: number;
  cy: number;
  srcW: number;
  srcH: number;
}

// ゾーン用クリップボード
interface ZoneClipboard {
  type: 'zone';
  zone: Zone;
}

interface PopoverState {
  seatId: string;
  x: number;
  y: number;
}

interface ToastState {
  msg: string;
  type: 'info' | 'error';
}

function SessionGuide() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md space-y-3 rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-bold">オフィス座席表ツール</h1>
        <p className="text-sm text-muted-foreground">
          セッションが選択されていません。このツールは座席データを zaproom の Session Datastore に保存します。
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>画面上部の zaproom のセッション選択 UI からセッションを作成または選択してください。</li>
          <li>
            通常運用では「組織内で共有 (internal) / 全員書き込み可 (internal)」のセッションを 1 つ作成し、その
            URL を社内に共有してください。
          </li>
          <li>席替え案の下書きには private セッションも利用できます。</li>
        </ol>
      </div>
    </div>
  );
}

export default function App() {
  const sessionId = useMemo(() => getSessionId(), []);

  const [data, setData] = useState<AppData | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null); // {latestEtag, latestData}

  const [mode, setMode] = useState<Mode>('view');
  // 表示名モード: あだ名優先 / 本名優先 (閲覧者ごとの好みなのでセッションではなく端末に保存)
  const [nameMode, setNameMode] = useState<NameMode>(() => {
    try {
      return localStorage.getItem('seatNameMode') === 'real' ? 'real' : 'nickname';
    } catch {
      return 'nickname';
    }
  });
  const toggleNameMode = () => {
    setNameMode((m) => {
      const next = m === 'real' ? 'nickname' : 'real';
      try {
        localStorage.setItem('seatNameMode', next);
      } catch {
        /* private mode 等では永続化しない */
      }
      return next;
    });
  };
  const [locationId, setLocationId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // 検索サジェストドロップダウンの表示状態
  const [suggestOpen, setSuggestOpen] = useState(false);
  // 検索サジェストのキーボードハイライト index
  const [suggestIndex, setSuggestIndex] = useState(-1);
  // 検索サジェストで選択した席へのフォーカス命令 (nonce が変わるたびに FloorMap が再発火)
  const [focusSeat, setFocusSeat] = useState<{ seatId: string; locationId: string; nonce: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(() => new Set());
  const [tool, setTool] = useState<Tool>('select'); // 'select' | 'place' (クリック配置) | 'zone' (エリア描画) | 'template' (机テンプレート配置)
  const [template, setTemplate] = useState<SeatTemplate | null>(null); // tool='template' 中に配置する机テンプレート (SEAT_TEMPLATES の要素)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [nameEditSeatId, setNameEditSeatId] = useState<string | null>(null); // インライン名前入力中の座席
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null); // 選択中のエリア (ゾーン)
  const [zoneLabelEditId, setZoneLabelEditId] = useState<string | null>(null); // インラインラベル入力中のエリア
  const [flow, setFlow] = useState<FlowState | null>(null); // {queue: [{name, department?}], total, history, registerToLedger} 名前リスト流し込み
  const [flowDialogOpen, setFlowDialogOpen] = useState(false);
  const [linkSeatId, setLinkSeatId] = useState<string | null>(null); // 台帳紐付けダイアログ対象の座席
  const [memberPanelOpen, setMemberPanelOpen] = useState(false); // メンバー台帳は任意機能 (デフォルト閉)
  const [popover, setPopover] = useState<PopoverState | null>(null); // {seatId, x, y}
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const [memberDialog, setMemberDialog] = useState<{ member: Member | null } | null>(null); // {member: Member|null}
  const [rosterSyncOpen, setRosterSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dataIOOpen, setDataIOOpen] = useState(false);
  const [locManagerOpen, setLocManagerOpen] = useState(false);
  const [adjustingFloor, setAdjustingFloor] = useState(false);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null); // {member, x, y}
  const [toast, setToast] = useState<ToastState | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  // コピペ用のアプリ内クリップボード ({seats, cx, cy, srcW, srcH} または {type:'zone', zone})。OS クリップボードは使わない
  const clipboardRef = useRef<SeatClipboard | ZoneClipboard | null>(null);
  // 連続ペーストのオフセット段数 (コピーでリセット)
  const pasteCountRef = useRef(0);
  // FloorMap 上のマウス位置 (相対座標)。キャンバス外は null。貼り付けの基準位置に使う
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null);

  // ポーリング用に最新値を ref に保持
  const dirtyRef = useRef(dirty);
  const savingRef = useRef(saving);
  const etagRef = useRef(etag);
  const conflictRef = useRef(conflict);
  dirtyRef.current = dirty;
  savingRef.current = saving;
  etagRef.current = etag;
  conflictRef.current = conflict;

  // mutate / undo で最新の data を参照するための ref
  const dataRef = useRef(data);
  dataRef.current = data;

  // Undo/Redo 履歴 (data は不変更新なのでスナップショット参照の保持で軽量)
  const undoStackRef = useRef<(AppData | null)[]>([]);
  const redoStackRef = useRef<(AppData | null)[]>([]);
  const lastCoalesceKeyRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string, type: ToastState['type'] = 'info') => {
    clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ---- 座席の選択 (複数選択対応)。座席選択とエリア選択は排他 ----
  const selectSeat = useCallback((id: string | null) => {
    setSelectedSeatIds(id ? new Set([id]) : new Set());
    setSelectedZoneId(null);
    setZoneLabelEditId(null);
  }, []);
  const selectSeats = useCallback((ids: Iterable<string>) => {
    setSelectedSeatIds(new Set(ids));
    setSelectedZoneId(null);
    setZoneLabelEditId(null);
  }, []);
  const toggleSeat = useCallback((id: string) => {
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedZoneId(null);
    setZoneLabelEditId(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedSeatIds(new Set());
    setSelectedZoneId(null);
    setZoneLabelEditId(null);
  }, []);

  // ---- エリア (ゾーン) の選択。選択すると座席選択を解除 ----
  const selectZone = useCallback((id: string | null) => {
    setSelectedZoneId(id);
    if (id) {
      setSelectedSeatIds(new Set());
      setNameEditSeatId(null);
    } else {
      setZoneLabelEditId(null);
    }
  }, []);

  // 起動時の読み込み
  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await loadSession(sessionId);
        if (cancelled) return;
        setData(normalizeData(res.session));
        setEtag(res.etag);
        setSessionName(res.name ?? '');
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 未保存変更があるままタブを閉じる/リロードするときに確認ダイアログを出す
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // テンプレートメニューの外側クリックで閉じる
  useEffect(() => {
    if (!templateMenuOpen) return;
    const h = (e: PointerEvent) => {
      if (!templateMenuRef.current?.contains(e.target as Node)) setTemplateMenuOpen(false);
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [templateMenuOpen]);

  // 30 秒間隔のポーリング (未保存変更がある間はスキップ)
  useEffect(() => {
    if (!sessionId || loading || loadError) return;
    const t = setInterval(async () => {
      if (dirtyRef.current || savingRef.current || conflictRef.current) return;
      try {
        const res = await loadSession(sessionId);
        if (res.etag !== etagRef.current && !dirtyRef.current && !savingRef.current) {
          undoStackRef.current = [];
          redoStackRef.current = [];
          lastCoalesceKeyRef.current = null;
          setData(normalizeData(res.session));
          setEtag(res.etag);
        }
      } catch {
        // ポーリング失敗は無視 (次回に期待)
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [sessionId, loading, loadError]);

  // 派生データ
  const sortedLocations = useMemo(
    () => (data ? [...data.locations].sort((a, b) => a.order - b.order) : []),
    [data]
  );
  const currentLocation =
    sortedLocations.find((l) => l.id === locationId) ?? sortedLocations[0] ?? null;
  const currentLocationId = currentLocation?.id ?? null;

  const memberById = useMemo(
    () => new Map((data?.members ?? []).map((m) => [m.id, m])),
    [data]
  );
  // 事業部リスト (セッションデータの設定。設定ダイアログで編集可能)
  const divisions = data?.settings?.divisions ?? [];
  // 色分けキー: 事業部 (設定時) → 部署 (フォールバック)。
  // settings.divisions の color フィールドでパレットキーが指定された事業部は上書き色を使う。
  const colorMap = useMemo(() => {
    const overrides = new Map<string, string>();
    for (const div of data?.settings?.divisions ?? []) {
      if (div.color) overrides.set(div.code, div.color);
    }
    return buildDepartmentColorMap(
      (data?.members ?? []).map((m) => memberColorKey(m)),
      overrides.size > 0 ? overrides : undefined
    );
  }, [data]);
  const locationSeats = useMemo(
    () => (data?.seats ?? []).filter((s) => s.locationId === currentLocationId),
    [data, currentLocationId]
  );
  const selectedSeats = useMemo(
    () => locationSeats.filter((s) => selectedSeatIds.has(s.id)),
    [locationSeats, selectedSeatIds]
  );
  const locationZones = useMemo(
    () => (data?.zones ?? []).filter((z) => z.locationId === currentLocationId),
    [data, currentLocationId]
  );
  const selectedZone = locationZones.find((z) => z.id === selectedZoneId) ?? null;
  // 現在拠点の空席数 (名前なし・台帳紐付けなし)。流し込みの一括割り当て対象
  const vacantSeatCount = useMemo(
    () => locationSeats.filter((s) => (s.name ?? '') === '' && !s.memberId).length,
    [locationSeats]
  );
  const selectedSeat = selectedSeatIds.size === 1 ? selectedSeats[0] ?? null : null;

  const searchActive = search.trim() !== '';
  const highlightIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ids = new Set<string>();
    if (!q) return ids;
    for (const s of locationSeats) {
      const m = s.memberId ? memberById.get(s.memberId) : null;
      if (m) {
        if (
          (m.name ?? '').toLowerCase().includes(q) ||
          (m.nickname ?? '').toLowerCase().includes(q) ||
          // 事業部は名称・コードのどちらでもヒット
          divisionLabel(divisions, m.division).toLowerCase().includes(q) ||
          (m.division ?? '').toLowerCase().includes(q) ||
          (m.department ?? '').toLowerCase().includes(q)
        ) {
          ids.add(s.id);
        }
      } else {
        // 直接入力の名前・事業部直接設定も検索対象
        if ((s.name ?? '').toLowerCase().includes(q)) {
          ids.add(s.id);
        } else if (s.division) {
          const divName = divisionLabel(divisions, s.division).toLowerCase();
          if (divName.includes(q) || s.division.toLowerCase().includes(q)) {
            ids.add(s.id);
          }
        }
      }
    }
    return ids;
  }, [search, locationSeats, memberById, divisions]);

  // ---- 検索サジェスト候補 (全拠点の席を対象) ----
  // 候補 = 検索語にマッチする席。同名が複数席あれば席ごとに個別エントリとして列挙。
  interface SuggestCandidate {
    seatId: string;
    locationId: string;
    locationName: string;
    /** 表示メイン名 (台帳メンバーのあだ名/本名 or 直書き名) */
    displayName: string;
    /** サブ表示 (拠点名 + 席ラベル) */
    sub: string;
    /** 事業部色 (ドット表示用) */
    divisionColorKey: string;
  }

  const suggestCandidates = useMemo<SuggestCandidate[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data) return [];
    const locationById = new Map(data.locations.map((l) => [l.id, l]));
    const results: SuggestCandidate[] = [];
    for (const s of data.seats) {
      const loc = locationById.get(s.locationId);
      if (!loc) continue;
      const m = s.memberId ? memberById.get(s.memberId) : null;
      let match = false;
      let displayName = '';
      let divisionColorKey = '';
      if (m) {
        displayName = m.nickname || m.name || '';
        divisionColorKey = m.division || m.department || '';
        if (
          (m.name ?? '').toLowerCase().includes(q) ||
          (m.nickname ?? '').toLowerCase().includes(q) ||
          divisionLabel(divisions, m.division).toLowerCase().includes(q) ||
          (m.division ?? '').toLowerCase().includes(q) ||
          (m.department ?? '').toLowerCase().includes(q)
        ) {
          match = true;
        }
      } else {
        displayName = s.name ?? '';
        divisionColorKey = s.division || '';
        if (displayName.toLowerCase().includes(q)) {
          match = true;
        } else if (s.division) {
          const dname = divisionLabel(divisions, s.division).toLowerCase();
          if (dname.includes(q) || s.division.toLowerCase().includes(q)) match = true;
        }
      }
      // 席ラベルでもマッチ
      if (!match && s.label && s.label.toLowerCase().includes(q)) match = true;
      if (!match) continue;
      const subParts: string[] = [loc.name];
      if (s.label) subParts.push(s.label);
      results.push({
        seatId: s.id,
        locationId: s.locationId,
        locationName: loc.name,
        displayName: displayName || '(空席)',
        sub: subParts.join(' — '),
        divisionColorKey,
      });
      if (results.length >= 10) break;
    }
    return results;
  }, [search, data, memberById, divisions]);

  // サジェスト候補が変わったらキーボードハイライトをリセット
  useEffect(() => {
    setSuggestIndex(-1);
  }, [suggestCandidates]);

  // サジェスト外クリックで閉じる
  useEffect(() => {
    if (!suggestOpen) return;
    const h = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !searchInputRef.current?.contains(target) &&
        !suggestRef.current?.contains(target)
      ) {
        setSuggestOpen(false);
      }
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [suggestOpen]);

  // サジェスト候補を選択したときの処理
  const selectSuggestCandidate = useCallback(
    (candidate: SuggestCandidate) => {
      setSuggestOpen(false);
      // 別拠点なら切り替え (切り替え後に useEffect で focusSeat が発火する)
      if (candidate.locationId !== currentLocationId) {
        setLocationId(candidate.locationId);
        // 拠点切替後の次フレームでフォーカス命令を出す (setTimeout で 1 tick 遅らせる)
        setTimeout(() => {
          setFocusSeat({ seatId: candidate.seatId, locationId: candidate.locationId, nonce: Date.now() });
        }, 0);
      } else {
        setFocusSeat({ seatId: candidate.seatId, locationId: candidate.locationId, nonce: Date.now() });
      }
    },
    [currentLocationId]
  );

  // ---- データ変更 (ローカル。保存ボタンでサーバーへ) ----
  // opts.coalesceKey: 直前の push と同じキーなら履歴を積まない (ドラッグ移動の集約用)
  // opts.skipHistory: Undo 履歴を積まない (undoFlow などの内部復元用)
  const mutate = useCallback((fn: (d: AppData) => AppData, opts: MutateOpts = {}) => {
    if (!opts.skipHistory) {
      const key = opts.coalesceKey ?? null;
      if (!(key !== null && key === lastCoalesceKeyRef.current)) {
        undoStackRef.current.push(dataRef.current);
        if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
      }
      lastCoalesceKeyRef.current = key;
      redoStackRef.current = [];
    } else {
      // 履歴を積まない内部復元 (undoFlow など) の後に、前後のドラッグ操作が
      // 同一 coalesceKey で 1 つの Undo ステップに合体しないようキーをリセット
      lastCoalesceKeyRef.current = null;
    }
    setData((d) => {
      const next = fn(d!);
      dataRef.current = next;
      return next;
    });
    setDirty(true);
  }, []);

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    lastCoalesceKeyRef.current = null;
  }, []);

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push(dataRef.current);
    lastCoalesceKeyRef.current = null;
    dataRef.current = prev;
    setData(prev);
    setDirty(true);
    setNameEditSeatId(null);
  }, []);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(dataRef.current);
    lastCoalesceKeyRef.current = null;
    dataRef.current = next;
    setData(next);
    setDirty(true);
    setNameEditSeatId(null);
  }, []);

  const addLocation = (name: string) =>
    mutate((d) => {
      const order = d.locations.length
        ? Math.max(...d.locations.map((l) => l.order)) + 1
        : 0;
      const loc = createLocation(name, order);
      setLocationId(loc.id);
      return { ...d, locations: [...d.locations, loc] };
    });

  const renameLocation = (id: string, name: string) =>
    mutate((d) => ({
      ...d,
      locations: d.locations.map((l) => (l.id === id ? { ...l, name } : l)),
    }));

  const deleteLocation = (id: string) =>
    mutate((d) => ({
      ...d,
      locations: d.locations.filter((l) => l.id !== id),
      seats: d.seats.filter((s) => s.locationId !== id),
      zones: (d.zones ?? []).filter((z) => z.locationId !== id),
    }));

  const moveLocation = (id: string, dir: number) =>
    mutate((d) => {
      const sorted = [...d.locations].sort((a, b) => a.order - b.order);
      const i = sorted.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return d;
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      return {
        ...d,
        locations: sorted.map((l, idx) => ({ ...l, order: idx })),
      };
    });

  // 図面の設定/差し替え。
  // img=null: 図面なしの無地キャンバスに戻す (座席は保持)
  // img あり: floorImage/floorImageWidth/floorImageHeight を更新し、floorTransform を {x:0,y:0,scale:1} に設定
  //           席ゼロ or デフォルトキャンバスの場合のみ canvasWidth/Height も更新
  const setFloorImage = (locId: string, img: CompressedFloorImage | null) => {
    const d0 = dataRef.current;
    const loc = d0?.locations.find((l) => l.id === locId);
    if (!img) {
      mutate((d) => ({
        ...d,
        locations: d.locations.map((l) =>
          l.id === locId
            ? {
                ...l,
                floorImage: null,
                floorImageWidth: null,
                floorImageHeight: null,
                floorTransform: null,
              }
            : l
        ),
      }));
      showToast('図面を削除しました。「保存」で確定してください。');
      return false;
    }
    const hasSeats = (d0?.seats ?? []).some((s) => s.locationId === locId);
    const isDefaultCanvas =
      !loc ||
      (loc.canvasWidth === BLANK_CANVAS.width && loc.canvasHeight === BLANK_CANVAS.height);
    mutate((d) => ({
      ...d,
      locations: d.locations.map((l) => {
        if (l.id !== locId) return l;
        const newCanvasWidth =
          (!hasSeats || isDefaultCanvas) ? img.width : l.canvasWidth;
        const newCanvasHeight =
          (!hasSeats || isDefaultCanvas) ? img.height : l.canvasHeight;
        return {
          ...l,
          canvasWidth: newCanvasWidth,
          canvasHeight: newCanvasHeight,
          floorImage: img.dataUrl,
          floorImageWidth: img.width,
          floorImageHeight: img.height,
          floorTransform: { x: 0, y: 0, scale: 1 },
        };
      }),
    }));
    const kb = Math.round((img.dataUrl.length * 0.75) / 1024);
    showToast(
      `図面を設定しました (${img.width}x${img.height}, 約${kb}KB)。「保存」で確定してください。`
    );
    return false;
  };

  // 図面のトランスフォームを更新 (adjustingFloor モードのドラッグ/スケール調整)
  const updateFloorTransform = (transform: { x: number; y: number; scale: number }) => {
    if (!currentLocationId) return;
    mutate(
      (d) => ({
        ...d,
        locations: d.locations.map((l) =>
          l.id === currentLocationId ? { ...l, floorTransform: transform } : l
        ),
      }),
      { coalesceKey: 'floorTransform:' + currentLocationId }
    );
  };

  // キャンバスサイズを更新 (LocationManagerDialog から)
  const updateCanvasSize = (locId: string, width: number, height: number) => {
    mutate((d) => ({
      ...d,
      locations: d.locations.map((l) =>
        l.id === locId ? { ...l, canvasWidth: width, canvasHeight: height } : l
      ),
    }));
  };

  // 現在拠点の席1個分のサイズ (画像ピクセル換算。FloorMap の seatW と同じ基準)
  const seatUnit = (loc: Location | null | undefined) => {
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    return Math.min(150, Math.max(56, W / 16)) * (loc?.seatScale ?? 1);
  };

  // 座席を配置し、その場でインライン名前入力を開く (連続クリック配置の中核)
  const addSeatAt = (
    x: number,
    y: number,
    { name = '', edit = true }: { name?: string; edit?: boolean } = {}
  ) => {
    if (!currentLocationId) return null;
    const seat = createSeat(currentLocationId, x, y, { name });
    mutate((d) => ({ ...d, seats: [...d.seats, seat] }));
    selectSeat(seat.id);
    setNameEditSeatId(edit ? seat.id : null);
    return seat;
  };

  // 一列スタンプ配置: 相対座標の配列をまとめて追加 (Undo 1回で取り消せる)
  const addSeatsAt = (points: { x: number; y: number }[]) => {
    if (!currentLocationId || !points?.length) return;
    const newSeats = points.map((p) => createSeat(currentLocationId, p.x, p.y));
    mutate((d) => ({ ...d, seats: [...d.seats, ...newSeats] }));
    // 末尾の席を選択 (名前は後で流し込み or クリック → Tab 連続入力)
    selectSeat(newSeats[newSeats.length - 1].id);
    setNameEditSeatId(null);
  };

  // 既存座席のダブルクリック (または単一選択中の Enter): 選択 + インライン名前編集を開く
  // (シングルクリックは選択のみ。FloorMap 側で onSelectSeat が呼ばれる)
  const handleSeatClick = (seatId: string) => {
    selectSeat(seatId);
    setNameEditSeatId(seatId);
  };

  // Tab ジャンプ用: 読書順 (同じ行で次の x → 次の行の左端) で隣の席を解決する
  const findNextSeat = (seat: Seat, dir: number): Seat | null => {
    const loc = currentLocation;
    const H = loc?.canvasHeight ?? BLANK_CANVAS.height;
    const rowTol = (seatUnit(loc) * 0.62) / H; // 席1個分の高さを同一行の許容差とする
    const others = (dataRef.current?.seats ?? []).filter(
      (s) => s.locationId === seat.locationId && s.id !== seat.id
    );
    const sameRow = others.filter((s) => Math.abs(s.y - seat.y) < rowTol);
    if (dir > 0) {
      const next = sameRow.filter((s) => s.x > seat.x).sort((a, b) => a.x - b.x);
      if (next.length) return next[0];
      const below = others.filter((s) => s.y >= seat.y + rowTol);
      if (!below.length) return null;
      const nextY = Math.min(...below.map((s) => s.y));
      const row = below
        .filter((s) => Math.abs(s.y - nextY) < rowTol)
        .sort((a, b) => a.x - b.x);
      return row[0] ?? null;
    }
    const prev = sameRow.filter((s) => s.x < seat.x).sort((a, b) => b.x - a.x);
    if (prev.length) return prev[0];
    const above = others.filter((s) => s.y <= seat.y - rowTol);
    if (!above.length) return null;
    const prevY = Math.max(...above.map((s) => s.y));
    const row = above
      .filter((s) => Math.abs(s.y - prevY) < rowTol)
      .sort((a, b) => b.x - a.x);
    return row[0] ?? null;
  };

  // インライン名前入力の確定。
  // 台帳メンバー紐付け済みの席で表示名と異なる名前を入力した場合は
  // 「直接入力で上書き」とみなし、紐付けを解除して name に保存する。
  // opts.advance (±1) があれば確定後に読書順で隣の席のインライン入力を開く (Tab 連続入力)。
  const commitSeatName = (seatId: string, value: string, opts: { advance?: number } = {}) => {
    const trimmed = value.trim();
    setNameEditSeatId(null);
    const seat = dataRef.current?.seats.find((s) => s.id === seatId);
    if (!seat) return;
    const member = seat.memberId ? memberById.get(seat.memberId) : null;
    if (member) {
      const display = member.nickname || member.name || '';
      if (trimmed !== display) updateSeat(seatId, { name: trimmed, memberId: null });
    } else if (trimmed !== (seat.name ?? '')) {
      updateSeat(seatId, { name: trimmed });
    }
    if (opts.advance) {
      const next = findNextSeat(seat, opts.advance);
      if (next) {
        selectSeat(next.id);
        setNameEditSeatId(next.id);
      }
    }
  };

  const cancelNameEdit = () => setNameEditSeatId(null);

  // インラインコンボボックスから台帳メンバーを選択したときのハンドラ。
  // 既存の dropMemberOnSeat (移動・スワップ込み) と同じ挙動にする。
  // seat.name は '' に (台帳表示が優先されるため)。
  const handleSelectMemberForSeat = (seatId: string, member: Member) => {
    setNameEditSeatId(null);
    selectSeat(seatId);
    dropMemberOnSeat(member.id, seatId);
    // seat.name もクリアしておく (紐付け後は台帳名が表示されるため)
    mutate((d) => ({
      ...d,
      seats: d.seats.map((s) => (s.id === seatId ? { ...s, name: '' } : s)),
    }));
  };

  // ---- 名前リスト流し込みモード ----
  // queue のエントリは {name, department?}。registerToLedger が真なら
  // 部署付きエントリを台帳に登録して紐付け割り当て (部署色分けが即有効)。
  const startFlow = (entries: FlowEntry[], registerToLedger = false) => {
    setFlow({ queue: entries, total: entries.length, history: [], registerToLedger });
    setFlowDialogOpen(false);
    setTool('select');
    setNameEditSeatId(null);
    clearSelection();
  };

  const endFlow = (msg = '流し込みを終了しました') => {
    setFlow(null);
    showToast(msg);
  };

  // 先頭エントリを消費する。record を渡すと「1つ戻す」用の履歴に積む
  const popFlowName = (record: FlowRecord | null = null) => {
    const entry = flow!.queue[0];
    const rest = flow!.queue.slice(1);
    const history = record ? [...flow!.history, record] : flow!.history;
    if (rest.length === 0) {
      setFlow(null);
      showToast('リストの名前をすべて割り当てました');
    } else {
      setFlow({ ...flow!, queue: rest, history });
    }
    return entry;
  };

  // 流し込みエントリの割り当て内容を解決 (1クリック割り当て/一括割り当てで共通)。
  // 台帳登録ありかつ部署付きなら member を新規生成して紐付け、それ以外は name 直書き。
  const resolveFlowEntry = (entry: FlowEntry): { member: Member | null; patch: Partial<Seat> } => {
    if (entry.department && flow?.registerToLedger) {
      const member = createMember({ name: entry.name, department: entry.department });
      return { member, patch: { memberId: member.id, name: '' } };
    }
    return { member: null, patch: { name: entry.name, memberId: null } };
  };

  // 流し込み: 既存座席クリック → 次のエントリで上書き
  const flowAssignSeat = (seatId: string) => {
    if (!flow || flow.queue.length === 0) return;
    const seat = dataRef.current?.seats.find((s) => s.id === seatId);
    if (!seat) return;
    const entry = flow.queue[0];
    const { member, patch } = resolveFlowEntry(entry);
    const record: FlowRecord = {
      type: 'assign',
      seatId,
      prevName: seat.name ?? '',
      prevMemberId: seat.memberId ?? null,
      entry,
      memberId: member?.id ?? null,
    };
    mutate((d) => ({
      ...d,
      members: member ? [...d.members, member] : d.members,
      seats: d.seats.map((s) => (s.id === seatId ? { ...s, ...patch } : s)),
    }));
    popFlowName(record);
  };

  // 流し込み: 空き場所クリック → 次のエントリで新規座席を配置
  const flowPlaceAt = (x: number, y: number) => {
    if (!flow || flow.queue.length === 0 || !currentLocationId) return;
    const entry = flow.queue[0];
    const { member, patch } = resolveFlowEntry(entry);
    const seat = createSeat(currentLocationId, x, y, patch);
    mutate((d) => ({
      ...d,
      members: member ? [...d.members, member] : d.members,
      seats: [...d.seats, seat],
    }));
    popFlowName({ type: 'place', seatId: seat.id, entry, memberId: member?.id ?? null });
  };

  // 流し込み: 空席 (名前なし・台帳紐付けなし) へ読書順 (左上→右下) にまとめて割り当て。
  // 1回の mutate + history 1エントリ ({type:'bulk'}) なので「1つ戻す」で一括で戻せる。
  const flowFillVacantSeats = () => {
    if (!flow || flow.queue.length === 0 || !currentLocation) return;
    const H = currentLocation.canvasHeight ?? BLANK_CANVAS.height;
    const rowTol = seatUnit(currentLocation) / H; // 席1個分の高さを同一行の許容差とする
    const vacant = locationSeats.filter((s) => (s.name ?? '') === '' && !s.memberId);
    if (vacant.length === 0) return;
    // y 昇順に走査してトレランス内を同一行にグループ化 → (行, x) の読書順
    const rows: { y0: number; seats: Seat[] }[] = [];
    for (const s of [...vacant].sort((a, b) => a.y - b.y)) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(s.y - row.y0) < rowTol) row.seats.push(s);
      else rows.push({ y0: s.y, seats: [s] });
    }
    const ordered = rows.flatMap((r) => r.seats.sort((a, b) => a.x - b.x));
    const count = Math.min(flow.queue.length, ordered.length);
    const newMembers: Member[] = [];
    const patchById = new Map<string, Partial<Seat>>();
    const items: FlowAssignRecord[] = [];
    for (let i = 0; i < count; i++) {
      const entry = flow.queue[i];
      const seat = ordered[i];
      const { member, patch } = resolveFlowEntry(entry);
      if (member) newMembers.push(member);
      patchById.set(seat.id, patch);
      items.push({
        type: 'assign',
        seatId: seat.id,
        prevName: seat.name ?? '',
        prevMemberId: seat.memberId ?? null,
        entry,
        memberId: member?.id ?? null,
      });
    }
    mutate((d) => ({
      ...d,
      members: newMembers.length ? [...d.members, ...newMembers] : d.members,
      seats: d.seats.map((s) => {
        const p = patchById.get(s.id);
        return p ? { ...s, ...p } : s;
      }),
    }));
    const rest = flow.queue.slice(count);
    if (rest.length === 0) {
      setFlow(null);
      showToast(`${count} 席に割り当てました。リストの名前をすべて割り当てました`);
    } else {
      setFlow({
        ...flow,
        queue: rest,
        history: [...flow.history, { type: 'bulk', items }],
      });
      showToast(`${count} 席に割り当てました (残り ${rest.length} 件)`);
    }
  };

  // 流し込みの1手戻し: 直前の操作を取り消し、エントリをキュー先頭に戻す
  // (一括割り当て {type:'bulk'} は全件まとめて戻す)
  const undoFlow = () => {
    if (!flow || flow.history.length === 0) return;
    const record = flow.history[flow.history.length - 1];
    const restored = record.type === 'bulk' ? record.items.map((i) => i.entry) : [record.entry];
    setFlow({
      ...flow,
      queue: [...restored, ...flow.queue],
      history: flow.history.slice(0, -1),
    });
    if (record.type === 'bulk') {
      const prevById = new Map(record.items.map((i) => [i.seatId, i]));
      const removedMemberIds = new Set(
        record.items.map((i) => i.memberId).filter(Boolean)
      );
      mutate(
        (d) => ({
          ...d,
          seats: d.seats.map((s) => {
            const i = prevById.get(s.id);
            return i ? { ...s, name: i.prevName, memberId: i.prevMemberId } : s;
          }),
          members: removedMemberIds.size
            ? d.members.filter((m) => !removedMemberIds.has(m.id))
            : d.members,
        }),
        { skipHistory: true }
      );
    } else if (record.type === 'place') {
      mutate(
        (d) => ({
          ...d,
          seats: d.seats.filter((s) => s.id !== record.seatId),
          members: record.memberId
            ? d.members.filter((m) => m.id !== record.memberId)
            : d.members,
        }),
        { skipHistory: true }
      );
    } else if (record.type === 'assign') {
      mutate(
        (d) => ({
          ...d,
          seats: d.seats.map((s) =>
            s.id === record.seatId
              ? { ...s, name: record.prevName, memberId: record.prevMemberId }
              : s
          ),
          members: record.memberId
            ? d.members.filter((m) => m.id !== record.memberId)
            : d.members,
        }),
        { skipHistory: true }
      );
    }
    // type 'skip' はデータ変更なし (キューに戻すだけ)
  };

  const updateSeat = (id: string, patch: Partial<Seat>, opts?: MutateOpts) =>
    mutate(
      (d) => ({
        ...d,
        seats: d.seats.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }),
      opts
    );

  // ドラッグ移動は coalesceKey で Undo 履歴を 1 ステップに集約
  const moveSeat = (id: string, x: number, y: number) =>
    updateSeat(id, { x, y }, { coalesceKey: 'move:' + id });

  // リサイズハンドルのドラッグ (w/h と中心座標を同時更新)。Undo 1 ステップに集約
  const resizeSeat = (id: string, patch: Partial<Seat>) =>
    updateSeat(id, patch, { coalesceKey: 'resize:' + id });

  // 回転ハンドルのドラッグ。Undo 1 ステップに集約
  const rotateSeatTo = (id: string, rotation: number) =>
    updateSeat(id, { rotation }, { coalesceKey: 'rotate:' + id });

  // 複数席の一括移動 (1回の mutate + coalesceKey で Undo 1回に集約)
  const moveSeats = (moves: { id: string; x: number; y: number }[]) => {
    if (!moves?.length) return;
    const byId = new Map(moves.map((m) => [m.id, m]));
    mutate(
      (d) => ({
        ...d,
        seats: d.seats.map((s) => {
          const m = byId.get(s.id);
          return m ? { ...s, x: m.x, y: m.y } : s;
        }),
      }),
      { coalesceKey: 'move-multi:' + moves.map((m) => m.id).sort().join(',') }
    );
  };

  // 複製: 席の向きを考慮して隣 (回転90°系なら下) に配置し、すぐ名前入力を開く
  const duplicateSeat = (id: string) => {
    const d0 = dataRef.current;
    const src = d0?.seats.find((s) => s.id === id);
    if (!src) return;
    const loc = d0!.locations.find((l) => l.id === src.locationId);
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    const H = loc?.canvasHeight ?? BLANK_CANVAS.height;
    const vertical = (((src.rotation ?? 0) % 180) + 180) % 180 === 90;
    // 席ごとのサイズ (w/h) を考慮して、隣接位置が重ならないようにオフセット
    const off =
      seatUnit(loc) * (vertical ? 0.62 * (src.h ?? 1) : (src.w ?? 1)) * 1.1;
    const copy = {
      ...src,
      id: uid(),
      x: vertical ? src.x : Math.min(1, src.x + off / W),
      y: vertical ? Math.min(1, src.y + off / H) : src.y,
      name: '',
      memberId: null,
    };
    mutate((d) => ({ ...d, seats: [...d.seats, copy] }));
    selectSeat(copy.id);
    setNameEditSeatId(copy.id);
  };

  // 島ごと複製: 選択席群を bounding box 幅 + 席1個分だけ右にずらしてコピー。
  // 名前はクリアし、複製側を選択状態にしてそのままドラッグで配置できるようにする。
  const duplicateSeats = (ids: Set<string> | string[]) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    const d0 = dataRef.current;
    const targets = d0?.seats.filter((s) => set.has(s.id)) ?? [];
    if (!targets.length) return;
    const loc = d0!.locations.find((l) => l.id === targets[0].locationId);
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    const minX = Math.min(...targets.map((s) => s.x));
    const maxX = Math.max(...targets.map((s) => s.x));
    // 横長席 (w > 1) があっても重ならないよう、最大の席幅でオフセット
    const maxW = Math.max(...targets.map((s) => s.w ?? 1));
    const offset = maxX - minX + (seatUnit(loc) * maxW) / W;
    const copies = targets.map((s) => ({
      ...s,
      id: uid(),
      x: Math.min(1, s.x + offset),
      name: '',
      memberId: null,
    }));
    mutate((d) => ({ ...d, seats: [...d.seats, ...copies] }));
    selectSeats(copies.map((c) => c.id));
    setNameEditSeatId(null);
  };

  // 一括削除 (1回の mutate = Undo 1回)
  const deleteSeats = (ids: Set<string> | string[]) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    if (set.size === 0) return;
    mutate((d) => ({ ...d, seats: d.seats.filter((s) => !set.has(s.id)) }));
    clearSelection();
    setNameEditSeatId(null);
  };

  const deleteSeat = (id: string) => deleteSeats([id]);

  // ---- コピー & ペースト (Cmd/Ctrl+C / V。アプリ内クリップボード) ----
  // 選択席のスナップショットと bounding box 中心・コピー元の図面サイズを保持する
  const copySeats = (ids: Set<string> | string[]) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    const d0 = dataRef.current;
    const targets = d0?.seats.filter((s) => set.has(s.id)) ?? [];
    if (!targets.length) return;
    const loc = d0!.locations.find((l) => l.id === targets[0].locationId);
    clipboardRef.current = {
      seats: targets.map((s) => ({ ...s })),
      cx: (Math.min(...targets.map((s) => s.x)) + Math.max(...targets.map((s) => s.x))) / 2,
      cy: (Math.min(...targets.map((s) => s.y)) + Math.max(...targets.map((s) => s.y))) / 2,
      srcW: loc?.canvasWidth ?? BLANK_CANVAS.width,
      srcH: loc?.canvasHeight ?? BLANK_CANVAS.height,
    };
    pasteCountRef.current = 0;
    showToast(`${targets.length} 席をコピーしました (Cmd/Ctrl+V で貼り付け)`);
  };

  // 貼り付け: カーソルがキャンバス上にあればそこを中心に、なければ元位置から席1個分オフセット。
  // 相対配置はコピー元の図面ピクセル換算で保持 (別拠点に貼っても島の形が崩れない)。
  // 名前・台帳紐付けは引き継がない (レイアウト複製が目的)。1 mutate = Undo 1回。
  const pasteSeats = () => {
    const clip = clipboardRef.current;
    if (!clip || !('seats' in clip) || !clip.seats?.length || !currentLocationId) return;
    const loc = dataRef.current!.locations.find((l) => l.id === currentLocationId);
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    const H = loc?.canvasHeight ?? BLANK_CANVAS.height;
    const unit = seatUnit(loc);
    const n = pasteCountRef.current;
    const stepX = (unit * 1.1) / W;
    const stepY = (unit * 0.62 * 1.1) / H;
    const cur = cursorPosRef.current;
    let cx: number;
    let cy: number;
    if (cur && cur.x >= 0 && cur.x <= 1 && cur.y >= 0 && cur.y <= 1) {
      // カーソル位置基準。同じ場所への連続ペーストは席1個分ずつ右下へずらす
      cx = cur.x + n * stepX;
      cy = cur.y + n * stepY;
    } else {
      cx = clip.cx + (n + 1) * stepX;
      cy = clip.cy + (n + 1) * stepY;
    }
    const copies = clip.seats.map((s) => ({
      ...s,
      id: uid(),
      locationId: currentLocationId,
      x: Math.min(1, Math.max(0, cx + ((s.x - clip.cx) * clip.srcW) / W)),
      y: Math.min(1, Math.max(0, cy + ((s.y - clip.cy) * clip.srcH) / H)),
      name: '',
      memberId: null,
    }));
    mutate((d) => ({ ...d, seats: [...d.seats, ...copies] }));
    selectSeats(copies.map((c) => c.id));
    setNameEditSeatId(null);
    pasteCountRef.current = n + 1;
    showToast(`${copies.length} 席を貼り付けました`);
  };

  // ---- ゾーンのコピー & ペースト ----
  const copyZone = (id: string) => {
    const z = dataRef.current?.zones?.find((z) => z.id === id);
    if (!z) return;
    clipboardRef.current = { type: 'zone', zone: { ...z } };
    pasteCountRef.current = 0;
    showToast('エリアをコピーしました (Cmd/Ctrl+V で貼り付け)');
  };

  const pasteZone = () => {
    const clip = clipboardRef.current;
    if (!clip || !('zone' in clip) || !currentLocationId) return;
    const loc = dataRef.current!.locations.find((l) => l.id === currentLocationId);
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    const H = loc?.canvasHeight ?? BLANK_CANVAS.height;
    const unit_x = 40 / W;
    const unit_y = 40 / H;
    const n = pasteCountRef.current;
    const src = clip.zone;
    const cur = cursorPosRef.current;
    let cx: number;
    let cy: number;
    if (cur && cur.x >= 0 && cur.x <= 1 && cur.y >= 0 && cur.y <= 1) {
      cx = cur.x - src.w / 2 + n * unit_x;
      cy = cur.y - src.h / 2 + n * unit_y;
    } else {
      cx = src.x + (n + 1) * unit_x;
      cy = src.y + (n + 1) * unit_y;
    }
    const newZone: Zone = {
      ...src,
      id: uid(),
      locationId: currentLocationId,
      x: Math.min(1 - src.w, Math.max(0, cx)),
      y: Math.min(1 - src.h, Math.max(0, cy)),
    };
    mutate((d) => ({ ...d, zones: [...(d.zones ?? []), newZone] }));
    selectZone(newZone.id);
    pasteCountRef.current = n + 1;
    showToast('エリアを貼り付けました');
  };

  // ---- 机テンプレート ----
  // クリック位置を中心にテンプレートの席一式を配置 (1 mutate = Undo 1回)。
  // dx は席ユニット幅、dy は席ユニット高さ (幅×0.62) 単位 (SEAT_TEMPLATES 参照)
  const addTemplateAt = (x: number, y: number) => {
    if (!template || !currentLocationId) return;
    const loc = dataRef.current!.locations.find((l) => l.id === currentLocationId);
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    const H = loc?.canvasHeight ?? BLANK_CANVAS.height;
    const unit = seatUnit(loc);
    const unitH = unit * 0.62;
    const newSeats = template.seats.map((t) =>
      createSeat(
        currentLocationId,
        Math.min(1, Math.max(0, x + ((t.dx ?? 0) * unit) / W)),
        Math.min(1, Math.max(0, y + ((t.dy ?? 0) * unitH) / H)),
        {
          w: t.w ?? 1,
          h: t.h ?? 1,
          rotation: t.rotation ?? 0,
          type: t.type ?? 'fixed',
        }
      )
    );
    mutate((d) => ({ ...d, seats: [...d.seats, ...newSeats] }));
  };

  // ---- エリア (ゾーン) ----
  // エリアツールのドラッグ確定: エリアを追加し、その場でインラインラベル入力を開く
  const addZoneAt = (rect: { x: number; y: number; w: number; h: number }) => {
    if (!currentLocationId) return;
    const zone = createZone(currentLocationId, rect);
    mutate((d) => ({ ...d, zones: [...(d.zones ?? []), zone] }));
    setTool('select');
    selectZone(zone.id);
    setZoneLabelEditId(zone.id);
  };

  const updateZone = (id: string, patch: Partial<Zone>, opts?: MutateOpts) =>
    mutate(
      (d) => ({
        ...d,
        zones: (d.zones ?? []).map((z) => (z.id === id ? { ...z, ...patch } : z)),
      }),
      opts
    );

  // ドラッグ移動・リサイズは coalesceKey で Undo 履歴を 1 ステップに集約
  const moveZone = (id: string, x: number, y: number) =>
    updateZone(id, { x, y }, { coalesceKey: 'zone-move:' + id });
  const resizeZone = (id: string, rect: Partial<Zone>) =>
    updateZone(id, rect, { coalesceKey: 'zone-resize:' + id });

  const deleteZone = (id: string) => {
    mutate((d) => ({ ...d, zones: (d.zones ?? []).filter((z) => z.id !== id) }));
    setSelectedZoneId(null);
    setZoneLabelEditId(null);
  };

  // インラインラベル入力の確定
  const commitZoneLabel = (id: string, value: string) => {
    setZoneLabelEditId(null);
    const zone = dataRef.current?.zones?.find((z) => z.id === id);
    if (!zone) return;
    const trimmed = value.trim();
    if (trimmed !== (zone.label ?? '')) updateZone(id, { label: trimmed });
  };

  // 整列: 左揃え (min x) / 上揃え (min y)
  const alignSeats = (ids: Set<string> | string[], type: 'left' | 'top') => {
    const set = ids instanceof Set ? ids : new Set(ids);
    const targets = dataRef.current?.seats.filter((s) => set.has(s.id)) ?? [];
    if (targets.length < 2) return;
    if (type === 'left') {
      const minX = Math.min(...targets.map((s) => s.x));
      mutate((d) => ({
        ...d,
        seats: d.seats.map((s) => (set.has(s.id) ? { ...s, x: minX } : s)),
      }));
    } else {
      const minY = Math.min(...targets.map((s) => s.y));
      mutate((d) => ({
        ...d,
        seats: d.seats.map((s) => (set.has(s.id) ? { ...s, y: minY } : s)),
      }));
    }
  };

  // 席の軸方向の見た目サイズ (px)。回転を考慮した bbox 幅/高さ
  const seatExtentPx = (s: Seat, unit: number, axis: 'x' | 'y') => {
    const pw = unit * (s.w ?? 1);
    const ph = unit * 0.62 * (s.h ?? 1);
    const rad = (((s.rotation ?? 0) % 360) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    return axis === 'x' ? pw * cos + ph * sin : pw * sin + ph * cos;
  };

  // 等間隔 (axis: 'x' | 'y')。
  // 全席の中心を均等割りすると 2 次元の島選択で列/行が崩れて席が重なるため、
  // 同じ列(x)/行(y)の席はクラスタとしてまとめて動かし、
  // クラスタ間の「余白」(席サイズ・回転込みの端から端) が均等になるよう配分する
  const distributeSeats = (ids: Set<string> | string[], axis: 'x' | 'y') => {
    const set = ids instanceof Set ? ids : new Set(ids);
    const targets = dataRef.current?.seats.filter((s) => set.has(s.id)) ?? [];
    if (targets.length < 3) return;
    const loc = currentLocation;
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    const H = loc?.canvasHeight ?? BLANK_CANVAS.height;
    const unit = seatUnit(loc);
    const D = axis === 'x' ? W : H;

    // 中心座標が近い席を同一クラスタ (列/行) にまとめる
    interface Cluster {
      seats: Seat[];
      lastCenter: number;
      left: number;
      right: number;
      center: number;
      size: number;
    }
    const tol = (axis === 'x' ? unit : unit * 0.62) * 0.5;
    const sorted = [...targets].sort((a, b) => a[axis] - b[axis]);
    const clusters: Cluster[] = [];
    for (const s of sorted) {
      const c = s[axis] * D;
      const last = clusters[clusters.length - 1];
      if (last && c - last.lastCenter <= tol) {
        last.seats.push(s);
        last.lastCenter = c;
      } else {
        clusters.push({ seats: [s], lastCenter: c } as Cluster);
      }
    }
    if (clusters.length < 2) return;

    for (const cl of clusters) {
      const edges = cl.seats.map((s) => {
        const half = seatExtentPx(s, unit, axis) / 2;
        const c = s[axis] * D;
        return [c - half, c + half];
      });
      cl.left = Math.min(...edges.map((e) => e[0]));
      cl.right = Math.max(...edges.map((e) => e[1]));
      cl.center = (cl.left + cl.right) / 2;
      cl.size = cl.right - cl.left;
    }

    const span = clusters[clusters.length - 1].right - clusters[0].left;
    const sumSize = clusters.reduce((n, c) => n + c.size, 0);
    // 端は固定して間の余白を均等化。席が収まらない (余白が負になる) 場合は
    // 最小余白を確保して先頭から並べ直す (くっつき防止)
    const minGap = unit * 0.08;
    const gap = Math.max((span - sumSize) / (clusters.length - 1), minGap);

    const delta = new Map<string, number>();
    let cursor = clusters[0].left;
    for (const cl of clusters) {
      const d = cursor + cl.size / 2 - cl.center;
      for (const s of cl.seats) delta.set(s.id, d);
      cursor += cl.size + gap;
    }
    mutate((d) => ({
      ...d,
      seats: d.seats.map((s) =>
        delta.has(s.id)
          ? { ...s, [axis]: Math.min(1, Math.max(0, (s[axis] * D + delta.get(s.id)!) / D)) }
          : s
      ),
    }));
  };

  // 机間の余白調整: 選択全体の中心から各席中心までの距離を拡縮する
  // (連打を 1 Undo ステップに集約するため coalesceKey を使用)
  const adjustSeatGaps = (ids: Set<string> | string[], factor: number) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    const targets = dataRef.current?.seats.filter((s) => set.has(s.id)) ?? [];
    if (targets.length < 2) return;
    const loc = currentLocation;
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    const H = loc?.canvasHeight ?? BLANK_CANVAS.height;
    const xs = targets.map((s) => s.x * W);
    const ys = targets.map((s) => s.y * H);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    mutate(
      (d) => ({
        ...d,
        seats: d.seats.map((s) =>
          set.has(s.id)
            ? {
                ...s,
                x: Math.min(1, Math.max(0, (cx + (s.x * W - cx) * factor) / W)),
                y: Math.min(1, Math.max(0, (cy + (s.y * H - cy) * factor) / H)),
              }
            : s
        ),
      }),
      { coalesceKey: 'gap:' + [...set].sort().join(',') }
    );
  };

  // 一括回転 (R キー / ツールバーの 90°回転)。
  // 2席以上の選択は個別回転ではなく、選択全体を1つの塊として bbox 中心の周りで回す
  const rotateSeats = (ids: Set<string> | string[], deg: number) => {
    const set = ids instanceof Set ? ids : new Set(ids);
    if (set.size === 0) return;
    const loc = currentLocation;
    const W = loc?.canvasWidth ?? BLANK_CANVAS.width;
    const H = loc?.canvasHeight ?? BLANK_CANVAS.height;
    mutate((d) => {
      const targets = d.seats.filter((s) => set.has(s.id));
      let posMap: Map<string, { x: number; y: number }> | null = null;
      if (targets.length >= 2) {
        // 相対座標のまま回すと図面の縦横比で歪むため、ピクセル空間で回転する
        const xs = targets.map((s) => s.x * W);
        const ys = targets.map((s) => s.y * H);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        posMap = new Map(
          targets.map((s) => {
            const dx = s.x * W - cx;
            const dy = s.y * H - cy;
            return [
              s.id,
              {
                x: Math.min(1, Math.max(0, (cx + dx * cos - dy * sin) / W)),
                y: Math.min(1, Math.max(0, (cy + dx * sin + dy * cos) / H)),
              },
            ];
          })
        );
      }
      return {
        ...d,
        seats: d.seats.map((s) =>
          set.has(s.id)
            ? {
                ...s,
                ...(posMap ? posMap.get(s.id) : null),
                rotation: ((((s.rotation ?? 0) + deg) % 360) + 360) % 360,
              }
            : s
        ),
      };
    });
  };

  // 席サイズの手動調整 (拠点ごとの倍率。0.4〜2.0、step 0.1)
  const changeSeatScale = (delta: number) => {
    if (!currentLocationId) return;
    mutate(
      (d) => ({
        ...d,
        locations: d.locations.map((l) =>
          l.id === currentLocationId
            ? {
                ...l,
                seatScale: Math.min(
                  2,
                  Math.max(0.4, Math.round(((l.seatScale ?? 1) + delta) * 10) / 10)
                ),
              }
            : l
        ),
      }),
      { coalesceKey: 'seatScale:' + currentLocationId }
    );
  };

  // キーボードショートカット:
  //   Cmd/Ctrl+Z: Undo (流し込み中は流し込みの1手戻し) / Shift+Cmd/Ctrl+Z: Redo
  //   Cmd/Ctrl+C / V: 選択席のコピー & ペースト (アプリ内クリップボード)
  //   Delete/Backspace: 選択席をまとめて削除 (Undo があるので confirm 不要) / 選択エリアを削除 (席とエリアの選択は排他)
  //   Enter: 単一選択中の席のインライン名前編集を開く (input 等フォーカス中は除外)
  //   R: 選択席を 90° 回転
  //   Esc: 流し込み/クリック配置/エリア描画/テンプレート配置モードを終了 (インライン入力中の Esc は入力側で処理)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (inField) return;
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else if (flow) {
          undoFlow();
        } else {
          undo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !e.shiftKey && !e.altKey) {
        if (inField || nameEditSeatId != null) return;
        if (mode === 'edit' && selectedSeatIds.size > 0) {
          e.preventDefault();
          copySeats(selectedSeatIds);
        } else if (mode === 'edit' && selectedZoneId) {
          e.preventDefault();
          copyZone(selectedZoneId);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v' && !e.shiftKey && !e.altKey) {
        if (inField || nameEditSeatId != null) return;
        if (mode === 'edit' && clipboardRef.current) {
          e.preventDefault();
          if ('zone' in clipboardRef.current) {
            pasteZone();
          } else {
            pasteSeats();
          }
        }
        return;
      }
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        // 単一選択中の席の名前編集を開く (IME 変換確定や入力欄フォーカス中は除外)
        if (inField || e.isComposing || nameEditSeatId != null) return;
        if (mode === 'edit' && !flow && tool === 'select' && selectedSeatIds.size === 1) {
          e.preventDefault();
          setNameEditSeatId([...selectedSeatIds][0]);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (inField) return;
        if (mode === 'edit' && selectedSeatIds.size > 0) {
          e.preventDefault();
          deleteSeats(selectedSeatIds);
        } else if (mode === 'edit' && selectedZoneId) {
          e.preventDefault();
          deleteZone(selectedZoneId);
        }
        return;
      }
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (inField || nameEditSeatId != null) return;
        if (mode === 'edit' && selectedSeatIds.size > 0) {
          e.preventDefault();
          rotateSeats(selectedSeatIds, 90);
        }
        return;
      }
      if (e.key !== 'Escape') return;
      if (flow) {
        setFlow(null);
        showToast('流し込みを終了しました');
      } else if (adjustingFloor) {
        setAdjustingFloor(false);
      } else if (tool === 'place' || tool === 'zone' || tool === 'template') {
        setTool('select');
        setTemplate(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // undoFlow / deleteSeats / rotateSeats / deleteZone / copySeats / pasteSeats は
    // flow / mode / selectedSeatIds / currentLocationId 等の変化で再購読される
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, tool, mode, adjustingFloor, selectedSeatIds, selectedZoneId, nameEditSeatId, currentLocationId, showToast, undo, redo]);

  // 台帳メンバーとの紐付け解除。直接入力名が無ければ表示名を引き継ぐ (席のラベルが消えないように)
  const unassignSeat = (seatId: string) =>
    mutate((d) => ({
      ...d,
      seats: d.seats.map((s) => {
        if (s.id !== seatId) return s;
        const m = d.members.find((mm) => mm.id === s.memberId);
        const fallback = m ? m.nickname || m.name || '' : '';
        return { ...s, memberId: null, name: s.name || fallback };
      }),
    }));

  // 台帳メンバーと席の紐付け (紐付けダイアログから)。スワップ処理は dropMemberOnSeat に委譲
  const linkMemberToSeat = (seatId: string, memberId: string) => {
    dropMemberOnSeat(memberId, seatId);
    setLinkSeatId(null);
  };

  // 席の直接入力名を台帳へ新規登録して紐付け
  const registerAndLinkMember = (seatId: string, name: string) => {
    const member = createMember({ name });
    mutate((d) => ({
      ...d,
      members: [...d.members, member],
      seats: d.seats.map((s) => (s.id === seatId ? { ...s, memberId: member.id } : s)),
    }));
    setLinkSeatId(null);
    showToast(`「${name}」を台帳に登録して紐付けました`);
  };

  // メンバーを座席へドロップ: 割り当て / 移動 / 入れ替え (スワップ)
  const dropMemberOnSeat = (memberId: string, seatId: string) =>
    mutate((d) => {
      const target = d.seats.find((s) => s.id === seatId);
      if (!target) return d;
      if (target.memberId === memberId) return d; // 自席へのドロップは無視
      const sourceSeat = d.seats.find((s) => s.memberId === memberId);
      const targetOccupant = target.memberId;
      return {
        ...d,
        seats: d.seats.map((s) => {
          if (s.id === seatId) return { ...s, memberId };
          if (sourceSeat && s.id === sourceSeat.id) {
            // 移動元の席: 入れ替え相手がいればその人を、いなければ空席に
            return { ...s, memberId: targetOccupant ?? null };
          }
          return s;
        }),
      };
    });

  const importMembers = (list: Partial<Member>[]) => {
    mutate((d) => ({
      ...d,
      members: [...d.members, ...list.map((attrs) => createMember(attrs))],
    }));
    showToast(`${list.length} 件のメンバーを取り込みました。「保存」で確定してください。`);
  };

  // 事業部リストの設定保存 (セッションデータ側に持つ。組織変更で zip 再アップ不要)
  const saveDivisions = (next: Division[]) => {
    mutate((d) => ({ ...d, settings: { ...d.settings, divisions: next } }));
    setSettingsOpen(false);
    showToast('事業部リストを更新しました。「保存」で確定してください。');
  };

  // 名簿同期の適用 (新規追加・名簿由来フィールドの更新・退職化を 1 mutate = Undo 1 回で)
  const applyRosterSync = (result: RosterSyncResult) => {
    const { added, updates, retireIds } = result;
    setRosterSyncOpen(false);
    if (!added.length && !updates.length && !retireIds.length) {
      showToast('名簿との差分はありませんでした。');
      return;
    }
    const patchById = new Map(updates.map((u) => [u.id, u.patch]));
    const retire = new Set(retireIds);
    mutate((d) => ({
      ...d,
      members: [
        ...d.members.map((m) => {
          const patched = patchById.has(m.id) ? { ...m, ...patchById.get(m.id) } : m;
          return retire.has(m.id) ? { ...patched, status: 'retired' as const } : patched;
        }),
        ...added.map((attrs) => createMember(attrs)),
      ],
    }));
    showToast(
      `名簿同期: 新規 ${added.length} 名 / 更新 ${updates.length} 名 / 退職 ${retireIds.length} 名を反映しました。「保存」で確定してください。`
    );
  };

  const handleMemberSave = (attrs: Partial<Member>) => {
    const editing = memberDialog?.member;
    if (editing) {
      mutate((d) => ({
        ...d,
        members: d.members.map((m) => (m.id === editing.id ? { ...m, ...attrs } : m)),
      }));
    } else {
      mutate((d) => ({ ...d, members: [...d.members, createMember(attrs)] }));
    }
    setMemberDialog(null);
  };

  const handleMemberDelete = (id: string) => {
    mutate((d) => ({
      ...d,
      members: d.members.filter((m) => m.id !== id),
      seats: d.seats.map((s) => (s.memberId === id ? { ...s, memberId: null } : s)),
    }));
    setMemberDialog(null);
  };

  const replaceAll = (normalized: AppData) => {
    clearHistory();
    setData(normalized);
    setDirty(true);
    clearSelection();
    setPopover(null);
    showToast('データを読み込みました。「保存」でサーバーへ反映されます。');
  };

  // ---- サーバー連携 ----
  async function handleSave() {
    if (!sessionId || !data) return;
    setSaving(true);
    try {
      const payload = { ...data, updatedAt: new Date().toISOString() };
      const result = await saveSession(sessionId, payload, etag);
      if (result.conflict) {
        const latest = await loadSession(sessionId);
        setConflict({
          latestEtag: latest.etag,
          latestData: normalizeData(latest.session),
        });
      } else {
        setData(payload);
        setEtag(result.etag);
        setDirty(false);
        showToast('保存しました');
      }
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleConflictOverwrite() {
    if (!conflict) return;
    setSaving(true);
    try {
      const payload = { ...data!, updatedAt: new Date().toISOString() };
      const result = await saveSession(sessionId!, payload, conflict.latestEtag);
      if (result.conflict) {
        const latest = await loadSession(sessionId!);
        setConflict({
          latestEtag: latest.etag,
          latestData: normalizeData(latest.session),
        });
        showToast('再び競合しました。もう一度お試しください。', 'error');
      } else {
        setData(payload);
        setEtag(result.etag);
        setDirty(false);
        setConflict(null);
        showToast('上書き保存しました');
      }
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleConflictAcceptLatest() {
    if (!conflict) return;
    clearHistory();
    setData(conflict.latestData);
    setEtag(conflict.latestEtag);
    setDirty(false);
    setConflict(null);
    clearSelection();
    showToast('サーバーの最新データを読み込みました');
  }

  async function handleRefresh() {
    if (!sessionId) return;
    if (dirty && !confirm('未保存の変更があります。破棄して最新データを読み込みますか？')) {
      return;
    }
    try {
      const res = await loadSession(sessionId);
      clearHistory();
      setData(normalizeData(res.session));
      setEtag(res.etag);
      setDirty(false);
      clearSelection();
      setPopover(null);
      showToast('最新データを読み込みました');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  }

  // プロフィール編集 (閲覧モード): saveWithRetry でサーバーの最新へマージ保存
  async function handleProfileSave(memberId: string, fields: Partial<Member>) {
    const { etag: newEtag, data: newData } = await saveWithRetry(sessionId!, (session) => {
      const cur = normalizeData(session);
      return {
        ...cur,
        members: cur.members.map((m) => (m.id === memberId ? { ...m, ...fields } : m)),
        updatedAt: new Date().toISOString(),
      };
    });
    if (dirtyRef.current) {
      // ローカルに未保存の編集がある場合はローカル側にも同じ変更を反映しておく
      setData((d) => ({
        ...d!,
        members: d!.members.map((m) => (m.id === memberId ? { ...m, ...fields } : m)),
      }));
    } else {
      setData(normalizeData(newData));
      setEtag(newEtag);
    }
    showToast('プロフィールを保存しました');
  }

  // 図面ファイル (画像/PDF) の取り込み本体。ファイル選択とキャンバスへの D&D の両方から呼ばれる
  async function processImageFile(file: File) {
    if (!file || !currentLocationId) return;
    try {
      let source: Blob = file;
      if (isPdfFile(file)) {
        // PDF はクライアント側で 1 ページ目を画像化してから圧縮に流す
        showToast('PDF を画像化しています…');
        const { blob } = await renderPdfFirstPage(file);
        source = blob;
      }
      const img = await compressFloorImage(source);
      const hadSeats = (dataRef.current?.seats ?? []).some(
        (s) => s.locationId === currentLocationId
      );
      setFloorImage(currentLocationId, img);
      if (!hadSeats) {
        // 席ゼロの拠点に図面を設定したら、そのまま連続クリック配置を開始する
        setTool('place');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  // ---- レンダリング ----
  if (!sessionId) return <SessionGuide />;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        読み込み中…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md space-y-3 rounded-lg border bg-card p-6 text-center shadow-sm">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button onClick={() => location.reload()}>再読み込み</Button>
        </div>
      </div>
    );
  }

  const popoverSeat = popover ? locationSeats.find((s) => s.id === popover.seatId) : null;
  const popoverMember = popoverSeat?.memberId ? memberById.get(popoverSeat.memberId) : null;
  const profileMember = profileMemberId ? memberById.get(profileMemberId) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b bg-card">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <h1 className="text-base font-bold">オフィス座席表</h1>
          {sessionName ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">{sessionName}</span>
          ) : null}
          {dirty ? (
            <button
              type="button"
              className="cursor-pointer"
              title="クリックで保存して全員に共有"
              disabled={saving}
              onClick={handleSave}
            >
              <Badge variant="warning" className="hover:bg-amber-200">
                未保存の変更
              </Badge>
            </button>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setSearch('');
                    setSuggestOpen(false);
                    searchInputRef.current?.focus();
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <Input
                ref={searchInputRef}
                className="h-8 w-44 pl-7 sm:w-56"
                placeholder="名前・事業部・部署で検索"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSuggestOpen(true);
                }}
                onFocus={() => {
                  if (search.trim()) setSuggestOpen(true);
                }}
                onKeyDown={(e) => {
                  if (!suggestOpen || suggestCandidates.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSuggestIndex((i) => Math.min(i + 1, suggestCandidates.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSuggestIndex((i) => Math.max(i - 1, -1));
                  } else if (e.key === 'Enter') {
                    if (e.nativeEvent.isComposing) return;
                    if (suggestIndex >= 0 && suggestCandidates[suggestIndex]) {
                      e.preventDefault();
                      selectSuggestCandidate(suggestCandidates[suggestIndex]);
                    } else {
                      setSuggestOpen(false);
                    }
                  } else if (e.key === 'Escape') {
                    setSuggestOpen(false);
                  }
                }}
              />
              {/* 検索サジェストドロップダウン */}
              {suggestOpen && suggestCandidates.length > 0 ? (
                <div
                  ref={suggestRef}
                  className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-slate-200 bg-white py-1 shadow-xl"
                  onPointerDown={(e) => e.preventDefault()}
                >
                  {suggestCandidates.map((c, i) => {
                    const dotColor = c.divisionColorKey
                      ? (() => {
                          const dc = colorMap.get(c.divisionColorKey);
                          return dc ? dc.border : '#94a3b8';
                        })()
                      : '#94a3b8';
                    return (
                      <div
                        key={`${c.seatId}`}
                        className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                          i === suggestIndex ? 'bg-blue-50 text-blue-900' : 'text-slate-800 hover:bg-slate-50'
                        }`}
                        onMouseEnter={() => setSuggestIndex(i)}
                        onMouseLeave={() => setSuggestIndex(-1)}
                        onClick={() => selectSuggestCandidate(c)}
                      >
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: dotColor }}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{c.displayName}</span>
                        <span className="shrink-0 text-xs text-slate-400">{c.sub}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {mode === 'view' ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleNameMode}
                  title="座席の名前表示を「あだ名」と「本名」で切り替え (台帳に登録された席のみ)"
                >
                  表示: {nameMode === 'real' ? '本名' : 'あだ名'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleRefresh} title="最新データを取得">
                  <RefreshCw /> 更新
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setMode('edit');
                    setPopover(null);
                    // 席ゼロの拠点ならそのまま連続クリック配置を開始 (Esc で終了)
                    if (locationSeats.length === 0) setTool('place');
                  }}
                >
                  <Pencil /> 編集
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="iconSm"
                  onClick={() => setSettingsOpen(true)}
                  title="設定 (事業部リストの編集)"
                >
                  <Settings />
                </Button>
                <Button
                  variant="outline"
                  size="iconSm"
                  onClick={() => setDataIOOpen(true)}
                  title="データ管理 (JSON エクスポート/インポート)"
                >
                  <Database />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMode('view');
                    clearSelection();
                    setNameEditSeatId(null);
                    setTool('select');
                    setTemplate(null);
                    setTemplateMenuOpen(false);
                    setFlow(null);
                    setLinkSeatId(null);
                    if (dirty) {
                      showToast('未保存の変更があります。右上の保存で全員に共有されます');
                    }
                  }}
                >
                  <Eye /> 閲覧へ戻る
                </Button>
              </>
            )}
            {mode === 'edit' || dirty ? (
              <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                <Save /> {saving ? '保存中…' : '保存'}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-1.5">
          <LocationTabs
            locations={sortedLocations}
            currentId={currentLocationId}
            onSelect={(id) => {
              setLocationId(id);
              clearSelection();
              setPopover(null);
            }}
            onManage={() => setLocManagerOpen(true)}
            canManage={mode === 'edit'}
          />
          {mode === 'edit' && currentLocation ? (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button
                variant={tool === 'place' ? 'default' : 'outline'}
                size="sm"
                title="クリックした場所に席を置き、その場で名前を入力できます (連続配置)"
                onClick={() => {
                  setFlow(null);
                  setNameEditSeatId(null);
                  setTool((t) => (t === 'place' ? 'select' : 'place'));
                }}
              >
                <MousePointerClick /> {tool === 'place' ? '配置モード中 (Esc で終了)' : 'クリックで席を配置'}
              </Button>
              <Button
                variant={tool === 'zone' ? 'default' : 'outline'}
                size="sm"
                title="図面上をドラッグして色付きのエリア (OPエリア等の区画) を描けます"
                onClick={() => {
                  setFlow(null);
                  setNameEditSeatId(null);
                  setZoneLabelEditId(null);
                  setTool((t) => (t === 'zone' ? 'select' : 'zone'));
                }}
              >
                <SquareDashed /> {tool === 'zone' ? 'エリア描画中 (Esc で終了)' : 'エリアを追加'}
              </Button>
              <div className="relative" ref={templateMenuRef}>
                <Button
                  variant={tool === 'template' ? 'default' : 'outline'}
                  size="sm"
                  title="机テンプレート (1人席〜6人島・会議テーブル) を選んでクリック配置"
                  onClick={() => {
                    if (tool === 'template') {
                      setTool('select');
                      setTemplate(null);
                      setTemplateMenuOpen(false);
                    } else {
                      setTemplateMenuOpen((v) => !v);
                    }
                  }}
                >
                  <LayoutGrid />{' '}
                  {tool === 'template' && template
                    ? `${template.label} 配置中 (Esc で終了)`
                    : 'テンプレート'}
                </Button>
                {templateMenuOpen ? (
                  <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border bg-card p-1 shadow-lg">
                    {SEAT_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setFlow(null);
                          setNameEditSeatId(null);
                          setZoneLabelEditId(null);
                          setTemplate(t);
                          setTool('template');
                          setTemplateMenuOpen(false);
                        }}
                      >
                        <span>{t.label}</span>
                        <span className="text-xs text-muted-foreground">{t.seats.length}席</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button
                variant="secondary"
                size="sm"
                title="名前リストを貼り付けて席を順にクリックで割り当て"
                onClick={() => setFlowDialogOpen(true)}
              >
                <ListOrdered /> 名簿を貼り付けて一括入力
              </Button>
              <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                <ImageIcon /> {currentLocation.floorImage ? '図面を差し替え' : '図面を設定 (画像/PDF)'}
              </Button>
              {currentLocation.floorImage ? (
                <>
                  <Button
                    variant={adjustingFloor ? 'default' : 'outline'}
                    size="sm"
                    title="図面の位置・スケールを調整します (Esc で終了)"
                    onClick={() => setAdjustingFloor((v) => !v)}
                  >
                    <Move /> {adjustingFloor ? '図面調整中 (Esc で終了)' : '図面を調整'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm('図面画像を削除して無地キャンバスに戻しますか？(座席は残ります)')) {
                        setFloorImage(currentLocationId!, null);
                        setAdjustingFloor(false);
                      }
                    }}
                  >
                    <ImageOff /> 図面を削除
                  </Button>
                </>
              ) : null}
              <div
                className="flex h-8 items-center gap-0.5 rounded-md border bg-background px-1.5"
                title="全席の表示サイズを調整 (この拠点のみ)"
              >
                <span className="px-0.5 text-xs text-muted-foreground">席サイズ</span>
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-6 w-6"
                  title="席を小さく"
                  disabled={(currentLocation.seatScale ?? 1) <= 0.4}
                  onClick={() => changeSeatScale(-0.1)}
                >
                  <Minus />
                </Button>
                <span className="w-9 text-center text-xs tabular-nums text-foreground">
                  {Math.round((currentLocation.seatScale ?? 1) * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="iconSm"
                  className="h-6 w-6"
                  title="席を大きく"
                  disabled={(currentLocation.seatScale ?? 1) >= 2}
                  onClick={() => changeSeatScale(0.1)}
                >
                  <Plus />
                </Button>
              </div>
              <Button
                variant={memberPanelOpen ? 'secondary' : 'outline'}
                size="sm"
                title="メンバー台帳 (任意機能): あだ名・アイコン・部署色分けを使いたい場合に"
                onClick={() => setMemberPanelOpen((v) => !v)}
              >
                <Users /> メンバー台帳 (任意)
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) processImageFile(file);
                }}
              />
            </div>
          ) : null}
        </div>
      </header>

      {mode === 'edit' && selectedSeats.length > 0 ? (
        <SeatToolbar
          seats={selectedSeats}
          member={selectedSeat?.memberId ? memberById.get(selectedSeat.memberId) : null}
          divisions={divisions}
          onUpdateSeat={updateSeat}
          onUpdateSeats={(ids, patch) =>
            mutate((d) => ({
              ...d,
              seats: d.seats.map((s) => (ids.includes(s.id) ? { ...s, ...patch } : s)),
            }))
          }
          onDuplicate={duplicateSeat}
          onDelete={deleteSeat}
          onUnassign={unassignSeat}
          onOpenLink={(seatId) => setLinkSeatId(seatId)}
          onAlign={(type) => alignSeats(selectedSeatIds, type)}
          onDistribute={(axis) => distributeSeats(selectedSeatIds, axis)}
          onGapAdjust={(factor) => adjustSeatGaps(selectedSeatIds, factor)}
          onRotateAll={(deg) => rotateSeats(selectedSeatIds, deg)}
          onDuplicateGroup={() => duplicateSeats(selectedSeatIds)}
          onDeleteAll={() => deleteSeats(selectedSeatIds)}
        />
      ) : null}

      {mode === 'edit' && selectedSeats.length === 0 && selectedZone ? (
        <ZoneToolbar zone={selectedZone} onUpdateZone={updateZone} onDelete={deleteZone} />
      ) : null}

      <main className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          {/* 名前リスト流し込み中のステータスバー */}
          {mode === 'edit' && flow ? (
            <div className="absolute left-1/2 top-3 z-30 flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-lg border border-blue-300 bg-blue-50/95 px-4 py-2 shadow-lg">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-blue-900">
                  次に割り当て: 「{flow.queue[0].name}」
                  <span className="ml-2 text-xs font-normal text-blue-700">
                    残り {flow.queue.length} / 全 {flow.total} 件
                  </span>
                </div>
                {flow.queue.length > 1 ? (
                  <div className="truncate text-xs text-blue-700/80">
                    続き: {flow.queue.slice(1, 6).map((e) => e.name).join('、')}
                    {flow.queue.length > 6 ? ' …' : ''}
                  </div>
                ) : null}
              </div>
              <Button
                size="sm"
                className="shrink-0"
                title="名前が空の席へ読書順 (左上→右下) にまとめて割り当てます"
                disabled={vacantSeatCount === 0}
                onClick={flowFillVacantSeats}
              >
                空席へ一括割り当て (残り{flow.queue.length}件 / 空席{vacantSeatCount}席)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                title="直前の割り当てを取り消してリストに戻す (Cmd/Ctrl+Z)"
                disabled={flow.history.length === 0}
                onClick={undoFlow}
              >
                1つ戻す
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                title="この名前を飛ばす"
                onClick={() => popFlowName({ type: 'skip', entry: flow.queue[0] })}
              >
                スキップ
              </Button>
              <Button
                variant="ghost"
                size="iconSm"
                className="shrink-0"
                title="流し込みを終了 (Esc)"
                onClick={() => endFlow()}
              >
                <X />
              </Button>
            </div>
          ) : null}
          {/* 席ゼロのオンボーディングカード (配置モード中は邪魔しないよう非表示) */}
          {mode === 'edit' &&
          currentLocation &&
          locationSeats.length === 0 &&
          !flow &&
          tool !== 'place' ? (
            <div className="pointer-events-auto absolute left-1/2 top-12 z-30 w-[min(26rem,90%)] -translate-x-1/2 space-y-2.5 rounded-lg border bg-card/95 p-4 shadow-lg backdrop-blur-sm">
              <p className="text-sm font-bold">座席表をつくりましょう</p>
              <Button
                variant="outline"
                className="h-auto w-full justify-start py-2 text-left"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon />
                <span className="min-w-0">
                  <span className="block">① 図面 (PDF/画像) をアップロード</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    ここにドロップでも OK
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto w-full justify-start py-2 text-left"
                onClick={() => setTool('place')}
              >
                <MousePointerClick />
                <span className="min-w-0">
                  <span className="block">② クリックで席を置き始める</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    図面なしでも可
                  </span>
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setFlowDialogOpen(true)}
              >
                <ListOrdered /> 名簿を貼り付けて一括入力
              </Button>
            </div>
          ) : null}
          {currentLocation ? (
            <FloorMap
              location={currentLocation}
              seats={locationSeats}
              zones={locationZones}
              memberById={memberById}
              colorMap={colorMap}
              mode={mode}
              nameMode={nameMode}
              tool={tool}
              template={tool === 'template' ? template : null}
              cursorPosRef={cursorPosRef}
              flowName={flow?.queue[0]?.name ?? null}
              selectedSeatIds={selectedSeatIds}
              selectedZoneId={mode === 'edit' ? selectedZoneId : null}
              editingSeatId={mode === 'edit' ? nameEditSeatId : null}
              editingZoneId={mode === 'edit' ? zoneLabelEditId : null}
              highlightIds={highlightIds}
              searchActive={searchActive}
              focusSeatId={focusSeat?.locationId === currentLocationId ? focusSeat.seatId : null}
              focusNonce={focusSeat?.locationId === currentLocationId ? focusSeat.nonce : 0}
              onSelectSeat={selectSeat}
              onSelectSeats={selectSeats}
              onToggleSeat={toggleSeat}
              onSeatClick={handleSeatClick}
              onMoveSeat={moveSeat}
              onMoveSeats={moveSeats}
              onResizeSeat={resizeSeat}
              onRotateSeat={rotateSeatTo}
              onSeatTap={(seatId, x, y) => {
                setPopover(seatId ? { seatId, x: x!, y: y! } : null);
              }}
              onAddSeatAt={addSeatAt}
              onAddSeatsAt={addSeatsAt}
              onPlaceTemplate={addTemplateAt}
              onFlowClickSeat={flowAssignSeat}
              onFlowPlace={flowPlaceAt}
              onCommitName={commitSeatName}
              onCancelName={cancelNameEdit}
              onSelectMemberForSeat={handleSelectMemberForSeat}
              inlineMembers={data?.members ?? []}
              onSelectZone={selectZone}
              onAddZone={addZoneAt}
              onMoveZone={moveZone}
              onResizeZone={resizeZone}
              onCommitZoneLabel={commitZoneLabel}
              onCancelZoneLabel={() => setZoneLabelEditId(null)}
              onDropFile={mode === 'edit' ? processImageFile : undefined}
              adjustingFloor={adjustingFloor}
              onUpdateFloorTransform={updateFloorTransform}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-sm space-y-3 text-center">
                <p className="text-sm text-muted-foreground">拠点がまだ登録されていません。</p>
                {mode === 'edit' ? (
                  <Button onClick={() => addLocation('フロア 1')}>
                    <Plus /> 拠点を追加
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setMode('edit');
                      setPopover(null);
                      addLocation('フロア 1');
                    }}
                  >
                    <Pencil /> 編集をはじめる
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  「フロア 1」が作成されます。名前は拠点管理からいつでも変更できます。
                </p>
              </div>
            </div>
          )}
        </div>
        {mode === 'edit' && data && memberPanelOpen ? (
          <MemberPanel
            members={data.members}
            seats={data.seats}
            locations={sortedLocations}
            divisions={divisions}
            colorMap={colorMap}
            onDragState={setDragGhost}
            onDropMember={dropMemberOnSeat}
            onEditMember={(m) => setMemberDialog({ member: m })}
            onAddMember={() => setMemberDialog({ member: null })}
            onOpenRosterSync={() => setRosterSyncOpen(true)}
            onClose={() => setMemberPanelOpen(false)}
          />
        ) : null}
        {mode === 'edit' && data && !memberPanelOpen ? (
          <button
            type="button"
            className="flex w-7 shrink-0 cursor-pointer items-center justify-center border-l bg-muted/40 hover:bg-muted"
            title="メンバー台帳を開く (任意機能)"
            onClick={() => setMemberPanelOpen(true)}
          >
            <span
              className="text-xs font-medium text-muted-foreground"
              style={{ writingMode: 'vertical-rl' }}
            >
              メンバー台帳 (任意)
            </span>
          </button>
        ) : null}
      </main>

      {/* 閲覧モード: 座席詳細ポップオーバー */}
      {mode === 'view' && popoverSeat ? (
        <SeatDetailPopover
          anchor={{ x: popover!.x, y: popover!.y }}
          seat={popoverSeat}
          member={popoverMember}
          divisions={divisions}
          colorMap={colorMap}
          onClose={() => setPopover(null)}
          onEditProfile={(m) => {
            setProfileMemberId(m.id);
            setPopover(null);
          }}
        />
      ) : null}

      {/* ドラッグ中のゴースト */}
      {dragGhost ? (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-2.5 py-1 text-sm font-medium shadow-lg"
          style={{ left: dragGhost.x, top: dragGhost.y - 8 }}
        >
          {dragGhost.member.nickname || dragGhost.member.name}
        </div>
      ) : null}

      {/* トースト */}
      {toast ? (
        <div
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-sm text-white shadow-lg ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-slate-800'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      {/* ダイアログ群 */}
      <MemberEditDialog
        open={!!memberDialog}
        member={memberDialog?.member ?? null}
        divisions={divisions}
        onClose={() => setMemberDialog(null)}
        onSave={handleMemberSave}
        onDelete={handleMemberDelete}
      />
      <ProfileEditDialog
        open={!!profileMember}
        member={profileMember}
        divisions={divisions}
        onClose={() => setProfileMemberId(null)}
        onSave={handleProfileSave}
      />
      <DataIODialog
        open={dataIOOpen}
        onClose={() => setDataIOOpen(false)}
        data={data}
        sessionName={sessionName}
        onImport={replaceAll}
      />
      <LocationManagerDialog
        open={locManagerOpen}
        onClose={() => setLocManagerOpen(false)}
        locations={sortedLocations}
        seats={data?.seats ?? []}
        onAdd={addLocation}
        onRename={renameLocation}
        onDelete={deleteLocation}
        onMove={moveLocation}
        onUpdateCanvas={updateCanvasSize}
      />
      <NameFlowDialog
        open={flowDialogOpen}
        onClose={() => setFlowDialogOpen(false)}
        onStart={startFlow}
      />
      <MemberLinkDialog
        open={!!linkSeatId}
        seat={data?.seats.find((s) => s.id === linkSeatId) ?? null}
        members={data?.members ?? []}
        divisions={divisions}
        colorMap={colorMap}
        onClose={() => setLinkSeatId(null)}
        onLink={(memberId) => linkMemberToSeat(linkSeatId!, memberId)}
        onRegisterAndLink={(name) => registerAndLinkMember(linkSeatId!, name)}
      />
      <SettingsDialog
        open={settingsOpen}
        divisions={divisions}
        members={data?.members ?? []}
        onClose={() => setSettingsOpen(false)}
        onSave={saveDivisions}
      />
      <RosterSyncDialog
        open={rosterSyncOpen}
        members={data?.members ?? []}
        divisions={divisions}
        existingNames={(data?.members ?? []).map((m) => m.name)}
        onClose={() => setRosterSyncOpen(false)}
        onApply={applyRosterSync}
      />

      {/* 保存競合ダイアログ */}
      <Dialog open={!!conflict}>
        <DialogContent
          className="[&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>保存の競合</DialogTitle>
            <DialogDescription>
              他のユーザーが先にデータを更新したため、そのまま保存できませんでした。どちらかを選択してください。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleConflictAcceptLatest} disabled={saving}>
              最新を読み込む (自分の変更を破棄)
            </Button>
            <Button onClick={handleConflictOverwrite} disabled={saving}>
              {saving ? '保存中…' : '自分の変更で上書き保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
