import type {
  Salad,
  QueueItem,
  FormatProgress,
  HistoryItem,
  TemplateItem,
  OrderRow,
  ParsedExcelRow,
} from "@/types/types";
import type { AuthUserProfile } from "@/lib/auth";

export interface Bookmark {
  id: string;
  label: string;
  url: string;
}

export interface UiSliceState {
  showCalculator: boolean;
  showTransitionBanner: boolean;
  showSplitView: boolean;
  iframeUrl: string;
  bookmarks: Bookmark[];
  highContrastMode: boolean;
  goldMode: boolean;
  soundEnabled: boolean;
  palletSpeeds: number[];
  ambientMode: boolean;
  editingQueueItemId: string | null;
  authUser: AuthUserProfile | null;
  isLoggedIn: boolean;
  currentUser: string | null;
  customDayLabelIndex: number | null;
  isScreenLocked: boolean;

  toggleCalculator: () => void;
  hideTransitionBanner: () => void;
  toggleSplitView: () => void;
  setIframeUrl: (url: string) => void;
  addBookmark: (label: string, url: string) => void;
  removeBookmark: (id: string) => void;
  toggleHighContrastMode: () => void;
  toggleGoldMode: () => void;
  toggleSoundEnabled: () => void;
  toggleAmbientMode: () => void;
  setEditingQueueItemId: (id: string | null) => void;
  setAuthUser: (user: AuthUserProfile | null) => void;
  logout: () => Promise<void>;
  setCustomDayLabelIndex: (index: number | null) => void;
  toggleScreenLock: () => void;
}

export interface LineStorageData {
  salads: Salad[];
  queue: QueueItem[];
  currentQueueIndex: number;
  currentProgress: FormatProgress | null;
  queueProgress: Record<string, FormatProgress>;
  isProducing: boolean;
  manualOrderDrafts?: OrderRow[];
}

export interface QueueSliceState {
  salads: Salad[];
  queue: QueueItem[];
  parsedExcelData: ParsedExcelRow[];
  setParsedExcelData: (data: ParsedExcelRow[]) => void;
  clearParsedExcelData: () => void;

  addSalad: (salad: Salad, targetLineCode?: string) => Promise<void>;
  addSaladsBulk: (saladsWithLine: { salad: Salad; lineCode: string }[]) => Promise<void>;
  removeSalad: (id: string) => void;
  updateSalad: (id: string, salad: Partial<Salad>) => void;
  buildQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  multiLineReorderQueue: (lineCode: string, fromIndex: number, toIndex: number) => void;
  multiLineRemoveFromQueue: (lineCode: string, index: number) => void;
  multiLineClearQueueAndSalads: (lineCode: string) => void;
  updateManualOrderDrafts: (lineCode: string, drafts: OrderRow[]) => void;
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => void;
}

export interface ProductionSliceState {
  currentQueueIndex: number;
  currentProgress: FormatProgress | null;
  queueProgress: Record<string, FormatProgress>;
  isProducing: boolean;
  formatStartTime: number | null;
  history: HistoryItem[];
  templates: TemplateItem[];

  startProduction: () => void;
  addPallet: () => void;
  removePallet: () => void;
  adjustBoxesDelta: (delta: number) => void;
  finishFormat: () => void;
  setPicoCompleted: (value: boolean) => void;
  setNoblejasCompleted: (value: boolean) => void;
  addNobjelasPallet: () => void;
  removeNobjelasPallet: () => void;
  setNobjelasPicoCompleted: (value: boolean) => void;
  advanceToNext: () => void;
  jumpToQueueItem: (index: number) => void;
  resetProduction: () => void;
  clearQueueAndSalads: () => void;
  clearHistory: () => void;
  wipeAllData: () => void;
  addTemplate: (item: Omit<TemplateItem, "id">) => void;
  removeTemplate: (id: string) => void;
  loadTemplate: (template: TemplateItem) => void;
  reproduceFromHistory: (item: Omit<HistoryItem, "id" | "date" | "duration">) => void;
  updateLineItemProgress: (lineCode: string, queueItemId: string, progress: FormatProgress) => void;
}

export interface SyncSliceState {
  activeLineCode: string;
  activeLineId: string | null;
  lineStorage: Record<string, LineStorageData>;
  noblejasConfig: Record<string, number>;

  setActiveLineCode: (code: string) => Promise<void>;
  loadActiveLineData: () => Promise<void>;
  loadAllLinesData: () => Promise<void>;
  clearAllDatabase: () => Promise<void>;
  hardResetDatabase: () => Promise<void>;
  setNoblejasConfig: (codigo10e: string, boxes: number) => Promise<void>;
  setNoblejasConfigBulk: (configs: Record<string, number>) => Promise<void>;
  removeNoblejasConfig: (codigo10e: string) => void;
}

export type FullProductionStoreState = UiSliceState &
  QueueSliceState &
  ProductionSliceState &
  SyncSliceState;
