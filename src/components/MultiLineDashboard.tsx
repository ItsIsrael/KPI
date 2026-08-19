"use client";

import { useEffect, useState } from "react";
import type { LineOverview, FormatProgress, Salad, QueueItem, HistoryItem } from "@/types/types";
import { calculateFormat, DEFAULT_BOX_TYPES, generateId, DEFAULT_SALADS } from "@/types/types";
import { getFactoryOverview, syncProgress, syncLineState, syncQueueItems, saveHistoryLog, subscribeToGlobalChanges } from "@/lib/supabase-service";

function formatDisplayName(codigo10e?: string, name?: string) {
  if (!name) return "";
  if (!codigo10e) return name;
  
  const upperName = name.toUpperCase();
  const upperCode = codigo10e.toUpperCase();
  
  if (upperName.includes(`[${upperCode}]`)) {
    return name;
  }
  
  return `[${upperCode}] ${name}`;
}

import { testSupabaseConnection, type SupabaseTestResult } from "@/lib/supabase-test";
import { useProductionStore } from "@/store/production-store";
import { cn } from "@/lib/utils";
import { 
  Building2, 
  Package, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Plus, 
  ArrowRight, 
  ChevronRight,
  CheckCircle2,
  Trophy,
  Zap,
  Clock,
  Sparkles,
  Bell,
  Trash2,
  X,
  Camera,
  ListChecks,
  Database,
  FileSpreadsheet,
  Settings,
  SkipForward,
  Minus
} from "lucide-react";
import { ManualOrderScanner } from "@/components/ManualOrderScanner";
import { ExcelUploader } from "@/components/ExcelUploader";
import { NoblejasUploader } from "@/components/NoblejasUploader";

interface MultiLineDashboardProps {
  onSelectLine: (lineCode: string) => void;
  goldMode: boolean;
}

type ViewMode = "ALL" | "PAIR_01" | "PAIR_23" | "CUSTOM";



let currentDashboardRequestId = 0;

export function MultiLineDashboard({ onSelectLine, goldMode }: MultiLineDashboardProps) {
  const [overview, setOverview] = useState<LineOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("dashboardViewMode") as ViewMode) || "ALL";
    }
    return "ALL";
  });
  const [customSelectedLines, setCustomSelectedLines] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboardCustomLines");
      if (saved) return JSON.parse(saved);
    }
    return ["K00", "K01"];
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dashboardViewMode", viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dashboardCustomLines", JSON.stringify(customSelectedLines));
    }
  }, [customSelectedLines]);
  const [connectionTest, setConnectionTest] = useState<SupabaseTestResult | null>(null);
  const [isClearDBConfirmOpen, setIsClearDBConfirmOpen] = useState(false);
  const [openSettingsLineCode, setOpenSettingsLineCode] = useState<string | null>(null);
  const [clearLineTarget, setClearLineTarget] = useState<string | null>(null);
  // AI anomaly alerts: { [lineCode]: { message, level, firedAt } }
  const [aiAlerts, setAiAlerts] = useState<Record<string, { message: string; level: "warning" | "critical"; firedAt: number }>>({});
  // Live production estimate: interpolated boxes since last pallet
  const [liveEstimates, setLiveEstimates] = useState<Record<string, number>>({});
  const [collapsedQueues, setCollapsedQueues] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboardCollapsedQueues");
      if (saved) return JSON.parse(saved);
    }
    return {};
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dashboardCollapsedQueues", JSON.stringify(collapsedQueues));
    }
  }, [collapsedQueues]);

  const [isTestingConn, setIsTestingConn] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  // Modal para Cargar Ensalada Rápida directamente desde el Dashboard
  const [quickAddLineCode, setQuickAddLineCode] = useState<string | null>(null);
  const [modalSaladName, setModalSaladName] = useState<string>("César");
  const [modalBoxType, setModalBoxType] = useState<string>("Cartón 4");
  const [modalBoxes, setModalBoxes] = useState<string>("");
  const [modalNoblejas, setModalNoblejas] = useState<string>("0");
  const [modalLote, setModalLote] = useState<string>("");
  const [isNoblejasConfigOpen, setIsNoblejasConfigOpen] = useState(false);
  const [newCode10e, setNewCode10e] = useState("");
  const [newBoxes10e, setNewBoxes10e] = useState("");
  const [isManualScannerOpen, setManualScannerOpen] = useState(false);
  const [isExcelUploaderOpen, setExcelUploaderOpen] = useState(false);
  const [isNoblejasUploaderOpen, setNoblejasUploaderOpen] = useState(false);

  const fetchOverview = async () => {
    const requestId = ++currentDashboardRequestId;
    try {
      const data = await getFactoryOverview();
      if (requestId !== currentDashboardRequestId) return;
      
      const localStore = useProductionStore.getState();

      const merged = data.map((o) => {
        const local = localStore.lineStorage[o.line.code];
        if (local && local.queue && local.queue.length > 0) {
          const currentItem = local.queue[local.currentQueueIndex] || local.queue[0];
          const localProg = currentItem ? local.queueProgress[currentItem.id] : undefined;
          const isLocalRecent = localProg?.palletLastUpdated && (Date.now() - localProg.palletLastUpdated < 5000);

          if (!isLocalRecent) {
            return o;
          }

          const prog = localProg;

          if (currentItem && prog) {
            const calc = calculateFormat({
              id: currentItem.formatId,
              boxType: currentItem.boxType,
              quantity: currentItem.quantity,
              noblejas: currentItem.noblejas,
              boxesPerPallet: currentItem.boxesPerPallet,
            });

            const totalBoxes = currentItem.quantity;
            const noblejasBoxes = currentItem.noblejas;
            const maxNobPallets = noblejasBoxes > 0 ? Math.floor(noblejasBoxes / currentItem.boxesPerPallet) : 0;
            const totalPallets = calc.pallets + maxNobPallets;
            const completedPallets = (prog.completedPallets || 0) + (prog.noblejasCompletedPallets || 0);
            const noblejasDoneBoxes = (prog.noblejasCompletedPallets || 0) * currentItem.boxesPerPallet + (prog.nobjelasPicoCompleted ? (noblejasBoxes % currentItem.boxesPerPallet) : 0);
            const milagroDoneBoxes = (prog.completedPallets || 0) * currentItem.boxesPerPallet + (prog.picoCompleted ? calc.pico : 0);
            const completedBoxes = noblejasDoneBoxes + milagroDoneBoxes;

            return {
              ...o,
              currentSaladName: currentItem.saladName,
              currentBoxType: currentItem.boxType,
              currentLote: currentItem.lote,
              totalBoxes,
              completedBoxes,
              totalPallets,
              completedPallets,
              noblejasBoxes,
              noblejasDoneBoxes,
              percent: totalBoxes > 0 ? Math.min(Math.round((completedBoxes / totalBoxes) * 100), 100) : 0,
              queueLength: Math.max(o.queueLength, local.queue.length),
              pendingCount: Math.max(0, local.queue.length - local.currentQueueIndex - 1),
              currentItem,
              nextItem: local.queue[local.currentQueueIndex + 1] || o.nextItem,
              calc,
              progress: prog,
              queue: local.queue,
              line: {
                ...o.line,
                isProducing: local.isProducing ?? o.line.isProducing,
              },
            };
          }
        }
        return o;
      });

      setOverview(merged);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    try {
      const res = await testSupabaseConnection();
      setConnectionTest(res);
    } finally {
      setIsTestingConn(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    handleTestConnection();
    
    // Subscribe to global realtime changes for instant dashboard updates
    const unsubscribe = subscribeToGlobalChanges(() => {
      fetchOverview();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // === LIVE PRODUCTION ESTIMATE (actualiza cada 30s) ===
  useEffect(() => {
    const tick = () => {
      setLiveEstimates(prev => {
        const next: Record<string, number> = { ...prev };
        const state = useProductionStore.getState();
        Object.values(state.lineStorage).forEach((lineData: any) => {
          const lineCode = lineData.code;
          if (!lineData.isProducing || !lineData.currentProgress) return;
          const prog = lineData.currentProgress;
          const intervalMs = prog.lastPalletIntervalMs;
          const lastUpdated = prog.palletLastUpdated || prog.lastPalletTimestamp || 0;
          if (!intervalMs || !lastUpdated || intervalMs <= 0) { next[lineCode] = 0; return; }
          const elapsedMs = Date.now() - lastUpdated;
          const queue = lineData.queue || [];
          if (!queue.length) return;
          const currentItem = queue[0];
          const boxesPerPallet = currentItem?.boxesPerPallet || 70;
          // Rate: cajas por ms
          const rate = boxesPerPallet / intervalMs;
          // Cajas estimadas desde el último palet registrado
          const estimatedExtra = Math.min(Math.floor(rate * elapsedMs), boxesPerPallet - 1);
          next[lineCode] = estimatedExtra;
        });
        return next;
      });
    };
    tick(); // inicial
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Unidades de ensalada por caja según tipo
  const getSaladasPerCaja = (boxType: string): number => {
    if (boxType.includes("12")) return 12;
    if (boxType.includes("6")) return 6;
    if (boxType.includes("4")) return 4;
    return 6; // fallback
  };

  // Quick Action Dinámica Milagro: Avanza Palet o Pico
  const handleQuickMilagroAction = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.currentItem || !item.calc) return;
    const prog: FormatProgress = item.progress || {
      queueItemId: item.currentItem.id,
      completedPallets: 0,
      picoCompleted: false,
      noblejasCompleted: false,
      noblejasCompletedPallets: 0,
      nobjelasPicoCompleted: false,
      finished: false,
      boxesAdjustment: 0,
    };

    const hasPalletsLeft = prog.completedPallets < item.calc.pallets;
    const hasPicoLeft = item.calc.pico > 0 && !prog.picoCompleted;

    if (!hasPalletsLeft && !hasPicoLeft) return;

    setActionLoadingId(`${item.line.id}-mil`);

    let nextPallets = prog.completedPallets;
    let nextPicoDone = prog.picoCompleted;
    let addedBoxes = 0;

    if (hasPalletsLeft) {
      nextPallets = prog.completedPallets + 1;
      addedBoxes = item.currentItem.boxesPerPallet;
    } else if (hasPicoLeft) {
      nextPicoDone = true;
      addedBoxes = item.calc.pico;
    }

    const isFinished = nextPallets >= item.calc.pallets && (item.calc.pico === 0 || nextPicoDone);
    const updatedProg: FormatProgress = {
      ...prog,
      completedPallets: nextPallets,
      picoCompleted: nextPicoDone,
      finished: isFinished,
      palletLastUpdated: Date.now(),
    };

    useProductionStore.getState().updateLineItemProgress(item.line.code, item.currentItem.id, updatedProg);

    setOverview((prev) =>
      prev.map((o) => {
        if (o.line.id !== item.line.id) return o;
        const newDone = o.completedBoxes + addedBoxes;
        const totalCompletedP = nextPallets + (prog.noblejasCompletedPallets || 0);
        return {
          ...o,
          completedBoxes: newDone,
          completedPallets: totalCompletedP,
          percent: Math.min(Math.round((newDone / o.totalBoxes) * 100), 100),
          progress: updatedProg,
        };
      })
    );

    await syncProgress(item.currentItem.id, updatedProg);
    setActionLoadingId(null);
  };

  // Quick Action Dinámica Noblejas
  const handleQuickNoblejasAction = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.currentItem || item.noblejasBoxes <= 0) return;
    const prog: FormatProgress = item.progress || {
      queueItemId: item.currentItem.id,
      completedPallets: 0,
      picoCompleted: false,
      noblejasCompleted: false,
      noblejasCompletedPallets: 0,
      nobjelasPicoCompleted: false,
      finished: false,
      boxesAdjustment: 0,
    };

    const maxNobPallets = Math.floor(item.noblejasBoxes / item.currentItem.boxesPerPallet);
    const nobPicoCajas = item.noblejasBoxes % item.currentItem.boxesPerPallet;

    const hasNobPalletsLeft = prog.noblejasCompletedPallets < maxNobPallets;
    const hasNobPicoLeft = nobPicoCajas > 0 && !prog.nobjelasPicoCompleted;

    if (!hasNobPalletsLeft && !hasNobPicoLeft) return;

    setActionLoadingId(`${item.line.id}-nob`);

    let nextNobPallets = prog.noblejasCompletedPallets;
    let nextNobPicoDone = prog.nobjelasPicoCompleted;
    let addedBoxes = 0;

    if (hasNobPalletsLeft) {
      nextNobPallets = prog.noblejasCompletedPallets + 1;
      addedBoxes = item.currentItem.boxesPerPallet;
    } else if (hasNobPicoLeft) {
      nextNobPicoDone = true;
      addedBoxes = nobPicoCajas;
    }

    const isNobDone = nextNobPallets >= maxNobPallets && (nobPicoCajas === 0 || nextNobPicoDone);
    const updatedProg: FormatProgress = {
      ...prog,
      noblejasCompleted: isNobDone,
      noblejasCompletedPallets: nextNobPallets,
      nobjelasPicoCompleted: nextNobPicoDone,
      palletLastUpdated: Date.now(),
    };

    useProductionStore.getState().updateLineItemProgress(item.line.code, item.currentItem.id, updatedProg);

    setOverview((prev) =>
      prev.map((o) => {
        if (o.line.id !== item.line.id) return o;
        const newDone = o.completedBoxes + addedBoxes;
        const totalCompletedP = (prog.completedPallets || 0) + nextNobPallets;
        return {
          ...o,
          completedBoxes: newDone,
          completedPallets: totalCompletedP,
          noblejasDoneBoxes: o.noblejasDoneBoxes + addedBoxes,
          percent: Math.min(Math.round((newDone / o.totalBoxes) * 100), 100),
          progress: updatedProg,
        };
      })
    );

    await syncProgress(item.currentItem.id, updatedProg);
    setActionLoadingId(null);
  };

  // Deshacer último palet Milagro (-1)
  const handleUndoMilagroPallet = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.currentItem || !item.progress) return;
    const prog = item.progress;
    if (prog.completedPallets <= 0 && !prog.picoCompleted) return;
    setActionLoadingId(`${item.line.id}-undo-mil`);
    let nextPallets = prog.completedPallets;
    let nextPicoDone = prog.picoCompleted;
    let removedBoxes = 0;
    if (prog.picoCompleted && item.calc) {
      nextPicoDone = false;
      removedBoxes = item.calc.pico;
    } else if (prog.completedPallets > 0) {
      nextPallets = prog.completedPallets - 1;
      removedBoxes = item.currentItem.boxesPerPallet;
    }
    const updatedProg: FormatProgress = { ...prog, completedPallets: nextPallets, picoCompleted: nextPicoDone, finished: false };
    useProductionStore.getState().updateLineItemProgress(item.line.code, item.currentItem.id, updatedProg);
    setOverview(prev => prev.map(o => {
      if (o.line.id !== item.line.id) return o;
      const newDone = Math.max(0, o.completedBoxes - removedBoxes);
      const totalCompletedP = nextPallets + (prog.noblejasCompletedPallets || 0);
      return { ...o, completedBoxes: newDone, completedPallets: totalCompletedP, percent: Math.min(Math.round((newDone / o.totalBoxes) * 100), 100), progress: updatedProg };
    }));
    await syncProgress(item.currentItem.id, updatedProg);
    setActionLoadingId(null);
  };

  // Deshacer último palet Noblejas (-1)
  const handleUndoNoblejasPallet = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.currentItem || !item.progress) return;
    const prog = item.progress;
    if (prog.noblejasCompletedPallets <= 0 && !prog.nobjelasPicoCompleted) return;
    setActionLoadingId(`${item.line.id}-undo-nob`);
    const maxNobPallets = Math.floor(item.noblejasBoxes / item.currentItem.boxesPerPallet);
    const nobPicoCajas = item.noblejasBoxes % item.currentItem.boxesPerPallet;
    let nextNobPallets = prog.noblejasCompletedPallets;
    let nextNobPicoDone = prog.nobjelasPicoCompleted;
    let removedBoxes = 0;
    if (prog.nobjelasPicoCompleted) {
      nextNobPicoDone = false;
      removedBoxes = nobPicoCajas;
    } else if (prog.noblejasCompletedPallets > 0) {
      nextNobPallets = prog.noblejasCompletedPallets - 1;
      removedBoxes = item.currentItem.boxesPerPallet;
    }
    const isNobDone = nextNobPallets >= maxNobPallets && (nobPicoCajas === 0 || nextNobPicoDone);
    const updatedProg: FormatProgress = { ...prog, noblejasCompletedPallets: nextNobPallets, nobjelasPicoCompleted: nextNobPicoDone, noblejasCompleted: isNobDone };
    useProductionStore.getState().updateLineItemProgress(item.line.code, item.currentItem.id, updatedProg);
    setOverview(prev => prev.map(o => {
      if (o.line.id !== item.line.id) return o;
      const newDone = Math.max(0, o.completedBoxes - removedBoxes);
      const totalCompletedP = (prog.completedPallets || 0) + nextNobPallets;
      return { ...o, completedBoxes: newDone, completedPallets: totalCompletedP, noblejasDoneBoxes: Math.max(0, o.noblejasDoneBoxes - removedBoxes), percent: Math.min(Math.round((newDone / o.totalBoxes) * 100), 100), progress: updatedProg };
    }));
    await syncProgress(item.currentItem.id, updatedProg);
    setActionLoadingId(null);
  };

  // Quick Action: Finalizar Formato y Limpiar Línea directamente desde el Dashboard
  const handleFinalizeAndCleanLine = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.currentItem) return;

    setActionLoadingId(`${item.line.id}-fin`);

    const historyItem: HistoryItem = {
      id: item.currentItem.id + "-" + Date.now(),
      saladName: item.currentItem.saladName,
      boxType: item.currentItem.boxType,
      quantity: item.currentItem.quantity,
      noblejas: item.currentItem.noblejas,
      boxesPerPallet: item.currentItem.boxesPerPallet,
      date: new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) + " " + new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }),
      duration: "Completado en Dashboard",
    };

    // Guardar en log de historial
    await saveHistoryLog(item.line.id, historyItem);

    const store = useProductionStore.getState();
    const local = store.lineStorage[item.line.code] || {};
    const currentQueue = local.queue || [];
    const remainingQueue = currentQueue.slice(1);

    if (remainingQueue.length > 0) {
      // Avanzar al siguiente formato de la cola
      const nextItem = remainingQueue[0];
      const nextProgress = local.queueProgress?.[nextItem.id] || {
        queueItemId: nextItem.id,
        completedPallets: 0,
        picoCompleted: false,
        noblejasCompleted: false,
        noblejasCompletedPallets: 0,
        nobjelasPicoCompleted: false,
        finished: false,
      };

      const nextLineState = {
        ...local,
        queue: remainingQueue,
        currentQueueIndex: 0,
        currentProgress: nextProgress,
        isProducing: true,
        formatStartTime: Date.now(),
        palletSpeeds: [],
      };

      useProductionStore.setState((s) => ({
        lineStorage: {
          ...s.lineStorage,
          [item.line.code]: nextLineState,
        },
        history: [historyItem, ...(s.history || [])].slice(0, 30),
        queueProgress: {
          ...(s.queueProgress || {}),
          [nextItem.id]: nextProgress,
        },
        ...(s.activeLineCode === item.line.code ? nextLineState : {}),
      }));

      // Sincronizar con Supabase
      await syncLineState(item.line.id, true, 0);
      await syncQueueItems(item.line.id, remainingQueue);

      // Actualizar UI inmediatamente
      setOverview((prev) =>
        prev.map((o) => {
          if (o.line.id !== item.line.id) return o;
          return {
            ...o,
            currentSaladName: nextItem.saladName,
            currentBoxType: nextItem.boxType,
            currentLote: nextItem.lote,
            totalBoxes: nextItem.quantity,
            completedBoxes: 0,
            totalPallets: Math.floor(nextItem.quantity / nextItem.boxesPerPallet),
            completedPallets: 0,
            noblejasBoxes: nextItem.noblejas,
            noblejasDoneBoxes: 0,
            percent: 0,
            queueLength: remainingQueue.length,
            pendingCount: remainingQueue.length - 1,
            currentItem: nextItem,
            nextItem: remainingQueue.length > 1 ? remainingQueue[1] : undefined,
            progress: nextProgress,
            queue: remainingQueue,
            line: { ...o.line, isProducing: true },
          };
        })
      );
    } else {
      // Limpiar estado completo porque ya no hay nada en la cola
      const emptyState = {
        salads: local.salads || [],
        queue: [],
        currentQueueIndex: 0,
        currentProgress: null,
        queueProgress: {},
        isProducing: false,
        formatStartTime: null,
        palletSpeeds: [],
      };

      useProductionStore.setState((s) => ({
        lineStorage: {
          ...s.lineStorage,
          [item.line.code]: emptyState,
        },
        history: [historyItem, ...(s.history || [])].slice(0, 30),
        ...(s.activeLineCode === item.line.code ? emptyState : {}),
      }));

      // Sincronizar con Supabase
      await syncLineState(item.line.id, false, 0);
      await syncQueueItems(item.line.id, []);

      // Actualizar UI inmediatamente
      setOverview((prev) =>
        prev.map((o) => {
          if (o.line.id !== item.line.id) return o;
          return {
            ...o,
            currentSaladName: undefined,
            currentBoxType: undefined,
            currentLote: undefined,
            totalBoxes: 0,
            completedBoxes: 0,
            totalPallets: 0,
            completedPallets: 0,
            noblejasBoxes: 0,
            noblejasDoneBoxes: 0,
            percent: 0,
            queueLength: 0,
            pendingCount: 0,
            currentItem: undefined,
            nextItem: undefined,
            calc: undefined,
            progress: undefined,
            queue: [],
            line: { ...o.line, isProducing: false },
          };
        })
      );
    }

    setActionLoadingId(null);
  };

  // Quick Action: Cargar Ensalada Rápida desde Modal
  const handleQuickAddSubmit = async () => {
    if (!quickAddLineCode) return;
    const targetLine = overview.find((o) => o.line.code === quickAddLineCode);
    if (!targetLine) return;

    const boxConfig = DEFAULT_BOX_TYPES.find((b) => b.name === modalBoxType) || DEFAULT_BOX_TYPES[0];
    const totalQty = parseInt(modalBoxes, 10) || 0;
    const nobQty = parseInt(modalNoblejas, 10) || 0;

    const newFormat = {
      id: generateId(),
      boxType: boxConfig.name,
      quantity: totalQty,
      noblejas: nobQty,
      boxesPerPallet: boxConfig.defaultBoxesPerPallet,
      lote: modalLote || undefined,
      linea: quickAddLineCode,
    };

    const newSalad: Salad = {
      id: generateId(),
      name: modalSaladName,
      formats: [newFormat],
    };

    // Use the native store action to append to queue correctly without deleting everything else
    await useProductionStore.getState().addSalad(newSalad, quickAddLineCode);

    setQuickAddLineCode(null);
    fetchOverview();
    
    setFeedbackMsg({ text: `¡Ensalada añadida con éxito en ${quickAddLineCode}!`, type: 'success' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const totalBoxesPlant = overview.reduce((acc, o) => acc + o.totalBoxes, 0);
  const totalCompletedPlant = overview.reduce((acc, o) => acc + o.completedBoxes, 0);
  const activeLinesCount = overview.filter((o) => o.line.isProducing && o.queueLength > 0).length;

  const displayedLines = overview.filter((item) => {
    if (viewMode === "ALL") return true;
    if (viewMode === "PAIR_01") return item.line.code === "K00" || item.line.code === "K01";
    if (viewMode === "PAIR_23") return item.line.code === "K02" || item.line.code === "K03";
    if (viewMode === "CUSTOM") return customSelectedLines.includes(item.line.code);
    return true;
  });

  const isDuoView = viewMode === "PAIR_01" || viewMode === "PAIR_23" || (viewMode === "CUSTOM" && displayedLines.length <= 2);

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto px-2 sm:px-4 py-3 relative min-h-screen">
      {/* Background Decorators for Glassmorphism */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className={cn("absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full mix-blend-multiply filter blur-[100px] opacity-50 animate-blob", goldMode ? "bg-amber-300" : "bg-emerald-200")} />
        <div className={cn("absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full mix-blend-multiply filter blur-[100px] opacity-50 animate-blob animation-delay-2000", goldMode ? "bg-yellow-200" : "bg-teal-200")} />
        <div className={cn("absolute bottom-[-20%] left-[20%] w-[50%] h-[50%] rounded-full mix-blend-multiply filter blur-[100px] opacity-50 animate-blob animation-delay-4000", goldMode ? "bg-orange-200" : "bg-green-200")} />
      </div>

      {/* Cabecera del Monitor de Planta (Limpia y Flotante) */}
      <div className={cn(
        "flex flex-col lg:flex-row items-center justify-between gap-4 p-4 rounded-2xl border backdrop-blur-xl transition-all shadow-lg",
        goldMode
          ? "bg-[#120e06]/60 border-amber-500/20 text-white"
          : "bg-white/40 border-white/50 text-[#0f291e]"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-xl", goldMode ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-700")}>
            🏢
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight">
              <span className={goldMode ? "text-gold-gradient" : "text-[#0f291e]"}>
                {viewMode === "PAIR_01" ? "Supervisión K00-K01" : viewMode === "PAIR_23" ? "Supervisión K02-K03" : "Monitor General de Planta"}
              </span>
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {connectionTest && (
                <span className={cn(
                  "text-[10px] font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 border shadow-sm transition-all duration-300",
                  connectionTest.connected
                    ? (goldMode ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200")
                    : (goldMode ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-red-50 text-red-700 border-red-200")
                )}>
                  {connectionTest.connected ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span>Sincronizado en Tiempo Real ({connectionTest.latencyMs}ms)</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5" />
                      <span>Desconectado / Error BD</span>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Métricas consolidadas de planta */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className={cn(
            "rounded-xl px-3 py-1.5 text-center flex items-center gap-2 border",
            goldMode ? "bg-white/5 border-white/10" : "bg-white/60 border-white/40 shadow-sm"
          )}>
            <span className={cn("text-[10px] uppercase font-bold", goldMode ? "text-white/40" : "text-[#64748b]")}>
              Activas
            </span>
            <span className="text-sm font-black text-emerald-600">
              {activeLinesCount}/{overview.length || 4}
            </span>
          </div>

          <div className={cn(
            "rounded-xl px-3 py-1.5 text-center flex items-center gap-2 border",
            goldMode ? "bg-white/5 border-white/10" : "bg-white/60 border-white/40 shadow-sm"
          )}>
            <span className={cn("text-[10px] uppercase font-bold", goldMode ? "text-white/40" : "text-[#64748b]")}>
              Cajas
            </span>
            <span className="text-sm font-black text-emerald-600">
              {totalCompletedPlant}/{totalBoxesPlant}
            </span>
          </div>

          <button
            onClick={() => setExcelUploaderOpen(true)}
            className={cn("h-8 w-8 rounded-xl flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-sm border", goldMode ? "border-white/10 bg-white/5 hover:bg-white/10 text-white" : "border-emerald-600/20 bg-white hover:bg-emerald-50 text-emerald-700")}
            title="Cargar Plan de Producción (Excel)"
            type="button"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setNoblejasUploaderOpen(true)}
            className={cn("h-8 w-8 rounded-xl flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-sm border", goldMode ? "border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400" : "border-emerald-600/20 bg-white hover:bg-emerald-50 text-emerald-700")}
            title="Cargar Cajas Noblejas"
            type="button"
          >
            <Package className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              fetchOverview();
              handleTestConnection();
            }}
            disabled={loading || isTestingConn}
            className={cn(
              "h-8 w-8 rounded-xl flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-sm border",
              goldMode ? "border-white/10 bg-white/5 hover:bg-white/10 text-white" : "border-emerald-600/20 bg-white hover:bg-emerald-50 text-emerald-700"
            )}
            title="Refrescar"
            type="button"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (loading || isTestingConn) && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className={cn(
        "glass-card rounded-2xl p-3 sm:p-4 border relative overflow-hidden transition-all shadow-xl space-y-4",
        goldMode
          ? "bg-[#141006]/80 border-amber-500/20 text-white"
          : "bg-white/60 border-emerald-600/10 text-[#0f291e]"
      )}>

        {/* Barra de Filtros */}
        <div className={cn(
          "pt-3.5 border-t flex items-center justify-between flex-wrap gap-2.5",
          goldMode ? "border-white/10" : "border-emerald-600/10"
        )}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-wider mr-1",
              goldMode ? "text-white/40" : "text-[#64748b]"
            )}>
              Modo de Visualización:
            </span>
            <button
              onClick={() => setViewMode("ALL")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm",
                viewMode === "ALL"
                  ? goldMode ? "bg-amber-500 text-black font-black" : "bg-emerald-600 text-white font-black"
                  : goldMode
                  ? "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
                  : "bg-white text-[#334155] hover:bg-emerald-50 border border-emerald-600/15"
              )}
              type="button"
            >
              Todas las 4 Líneas
            </button>
            <button
              onClick={() => setViewMode("PAIR_01")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm",
                viewMode === "PAIR_01"
                  ? goldMode ? "bg-amber-500 text-black font-black" : "bg-emerald-600 text-white font-black"
                  : goldMode
                  ? "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
                  : "bg-white text-[#334155] hover:bg-emerald-50 border border-emerald-600/15"
              )}
              type="button"
            >
              Dúo K00 & K01 (Detallado)
            </button>
            <button
              onClick={() => setViewMode("PAIR_23")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm",
                viewMode === "PAIR_23"
                  ? goldMode ? "bg-amber-500 text-black font-black" : "bg-emerald-600 text-white font-black"
                  : goldMode
                  ? "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
                  : "bg-white text-[#334155] hover:bg-emerald-50 border border-emerald-600/15"
              )}
              type="button"
            >
              Dúo K02 & K03 (Detallado)
            </button>
            <button
              onClick={() => setViewMode("CUSTOM")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm",
                viewMode === "CUSTOM"
                  ? goldMode ? "bg-amber-500 text-black font-black" : "bg-emerald-600 text-white font-black"
                  : goldMode
                  ? "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
                  : "bg-white text-[#334155] hover:bg-emerald-50 border border-emerald-600/15"
              )}
              type="button"
            >
              Personalizada
            </button>
          </div>

          {viewMode === "CUSTOM" && (
            <div className={cn(
              "flex items-center gap-1.5 border rounded-xl p-1",
              goldMode ? "bg-black/50 border-white/10" : "bg-emerald-50/70 border-emerald-600/15"
            )}>
              {(["K00", "K01", "K02", "K03"] as const).map((code) => {
                const selected = customSelectedLines.includes(code);
                return (
                  <button
                    key={code}
                    onClick={() => {
                      if (selected && customSelectedLines.length > 1) {
                        setCustomSelectedLines(customSelectedLines.filter((c) => c !== code));
                      } else if (!selected) {
                        setCustomSelectedLines([...customSelectedLines, code]);
                      }
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer",
                      selected
                        ? goldMode
                          ? "bg-white/20 text-white border border-white/30"
                          : "bg-emerald-600 text-white shadow-sm"
                        : goldMode
                        ? "text-white/30 hover:text-white hover:bg-white/5"
                        : "text-[#64748b] hover:text-[#0f291e] hover:bg-white"
                    )}
                    type="button"
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Grid de Líneas de Producción */}
      <div className={cn(
        "grid gap-5",
        isDuoView ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
      )}>
        {loading && overview.length === 0 ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className={cn(
              "rounded-3xl p-6 border shadow-lg flex flex-col gap-4 animate-pulse",
              goldMode ? "bg-[#141006]/50 border-amber-500/10" : "bg-white/50 border-emerald-600/10"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn("w-12 h-12 rounded-2xl", goldMode ? "bg-amber-500/20" : "bg-emerald-600/20")} />
                <div className="flex flex-col gap-2 flex-1">
                  <div className={cn("h-5 w-32 rounded", goldMode ? "bg-amber-500/20" : "bg-emerald-600/20")} />
                  <div className={cn("h-3 w-20 rounded", goldMode ? "bg-amber-500/10" : "bg-emerald-600/10")} />
                </div>
              </div>
              <div className={cn("h-24 w-full rounded-2xl mt-2", goldMode ? "bg-white/5" : "bg-gray-100")} />
              <div className={cn("h-12 w-full rounded-xl mt-2", goldMode ? "bg-white/5" : "bg-gray-100")} />
            </div>
          ))
        ) : (
          displayedLines.map((item) => {
            const currentItem = item.currentItem;
          const calc = item.calc;
          const prog = item.progress || {
            queueItemId: item.currentItem ? item.currentItem.id : "",
            completedPallets: 0,
            picoCompleted: false,
            noblejasCompleted: false,
            noblejasCompletedPallets: 0,
            nobjelasPicoCompleted: false,
            finished: false,
            boxesAdjustment: 0,
          };

          const totalMilagroPallets = calc ? calc.pallets : item.totalPallets;
          const milagroPicoCajas = calc ? calc.pico : 0;
          const maxNobPallets = currentItem && item.noblejasBoxes > 0 ? Math.floor(item.noblejasBoxes / currentItem.boxesPerPallet) : 0;
          const nobjelasPicoCajas = currentItem && item.noblejasBoxes > 0 ? (item.noblejasBoxes % currentItem.boxesPerPallet) : 0;

          // Estado dinámico y 100% reactivo
          const hasActiveOrders = item.queueLength > 0 && !!item.currentSaladName;
          const isFinished = hasActiveOrders && (item.percent >= 100 || prog.finished);
          const isProducing = item.line.isProducing && hasActiveOrders && !isFinished;

          // === DETECCIÓN DE ANOMALÍA (ritmo de fábrica con tolerancia de 12 min base + IA) ===
          const now = Date.now();
          const lastUpdated = prog.palletLastUpdated || prog.lastPalletTimestamp || 0;
          const minutesSinceLastPallet = lastUpdated > 0 ? Math.floor((now - lastUpdated) / 60000) : 0;
          const estimatedPalletMinutes = prog.lastPalletIntervalMs ? Math.round(prog.lastPalletIntervalMs / 60000) : 15;

          // Thresholds adaptados: el operario tarda ~15 min por palet, tolerancia base a partir de 12 min
          const warningThreshold = Math.max(12, Math.round(estimatedPalletMinutes * 1.15));
          const criticalThreshold = Math.max(18, Math.round(estimatedPalletMinutes * 1.6));

          const isDelayWarning = isProducing && minutesSinceLastPallet >= warningThreshold;
          const isDelayCritical = isProducing && minutesSinceLastPallet >= criticalThreshold;
          const showPalletCadenceReminder = isDelayWarning;

          // Disparar IA solo si: es crítico, tenemos historial y no hemos alertado en los últimos 10 min
          const existingAlert = aiAlerts[item.line.code];
          const aiCooldownOk = !existingAlert || (now - existingAlert.firedAt) > 10 * 60 * 1000;
          if (isDelayCritical && aiCooldownOk) {
            // Lanzar llamada IA (fuera del render, async)
            const lineCode = item.line.code;
            const saladName = item.currentSaladName || "Ensalada";
            const completed = prog.completedPallets;
            const total = totalMilagroPallets;
            setAiAlerts(prev => ({ ...prev, [lineCode]: { message: "", level: "critical", firedAt: now } }));
            fetch("/api/anomaly", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lineCode, saladName, expectedMinutes: estimatedPalletMinutes, elapsedMinutes: minutesSinceLastPallet, completedPallets: completed, totalPallets: total })
            }).then(r => r.json()).then(data => {
              setAiAlerts(prev => ({ ...prev, [lineCode]: { message: data.message || "", level: data.level || "critical", firedAt: now } }));
            }).catch(() => {});
          }
          // Limpiar alerta si la línea se normaliza
          if (!isDelayWarning && existingAlert) {
            setAiAlerts(prev => { const n = { ...prev }; delete n[item.line.code]; return n; });
          }

          const hasMilagroPalletsLeft = prog.completedPallets < totalMilagroPallets;
          const hasMilagroPicoLeft = milagroPicoCajas > 0 && !prog.picoCompleted;
          const isMilagroDone = !hasMilagroPalletsLeft && !hasMilagroPicoLeft;

          const hasNobPalletsLeft = maxNobPallets > 0 && prog.noblejasCompletedPallets < maxNobPallets;
          const hasNobPicoLeft = nobjelasPicoCajas > 0 && !prog.nobjelasPicoCompleted;
          const isNobDone = item.noblejasBoxes > 0 && !hasNobPalletsLeft && !hasNobPicoLeft;

          return (
            <div
              key={item.line.id}
              className={cn(
                "rounded-3xl p-5 sm:p-6 border transition-all duration-300 hover:shadow-2xl relative overflow-hidden group space-y-4",
                !hasActiveOrders && "h-fit self-start",
                goldMode
                  ? "border-amber-500/25 hover:border-amber-500/50 bg-[#120e06]/60 backdrop-blur-xl text-white shadow-[0_8px_32px_0_rgba(245,158,11,0.1)]"
                  : "border-white/50 hover:border-emerald-300 bg-white/50 backdrop-blur-xl text-[#0f291e] shadow-[0_8px_32px_0_rgba(16,185,129,0.08)]",
                isFinished && (goldMode ? "ring-2 ring-amber-400 border-amber-400 bg-amber-950/20" : "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/80"),
                isProducing && "ring-1 ring-emerald-500/30 shadow-xl shadow-emerald-500/5",
                isDuoView && "p-6 sm:p-7"
              )}
            >
              {/* Encabezado de la Línea con Badge Reactivo Limpio */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div 
                  onClick={() => onSelectLine(item.line.code)}
                  className="flex items-center gap-3 cursor-pointer group/title select-none hover:opacity-90 transition-opacity"
                  title={`Abrir panel de producción de ${item.line.code}`}
                >
                  <span className={cn(
                    "text-sm font-black px-3.5 py-1.5 rounded-xl border shadow-sm tracking-wider group-hover/title:scale-105 transition-transform",
                    goldMode
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-emerald-600 text-white border-emerald-500/40"
                  )}>
                    {item.line.code}
                  </span>
                  <div>
                    <h3 className={cn(
                      "text-base sm:text-lg font-black transition-colors flex items-center gap-1.5",
                      goldMode ? "text-white group-hover/title:text-amber-400" : "text-[#0f291e] group-hover/title:text-emerald-700"
                    )}>
                      <span>Línea {item.line.code}</span>
                      <ArrowRight className="w-4 h-4 opacity-40 group-hover/title:opacity-100 group-hover/title:translate-x-1 transition-all" />
                    </h3>
                    <p className={cn("text-[11px] font-mono", goldMode ? "text-white/40" : "text-[#64748b]")}>
                      📋 {item.queueLength} {item.queueLength === 1 ? "formato" : "formatos"} ({item.pendingCount} en cola)
                    </p>
                  </div>
                </div>

                {/* Badge Reactivo Automático (Sin doble punto y sin acción manual forzada) */}
                <div className="flex items-center gap-2">

                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenSettingsLineCode(openSettingsLineCode === item.line.code ? null : item.line.code);
                      }}
                      className={cn(
                        "h-8 px-2.5 rounded-xl flex items-center justify-center cursor-pointer transition-all active:scale-95 shadow-sm border",
                        goldMode ? "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400" : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                      )}
                      title="Ajustes de Línea"
                      type="button"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    {openSettingsLineCode === item.line.code && (
                      <div className={cn(
                        "absolute right-0 top-full mt-1 w-56 rounded-xl shadow-lg border p-1.5 z-50 animate-in fade-in zoom-in-95 flex flex-col gap-1",
                        goldMode ? "bg-[#120e06] border-white/10" : "bg-white border-gray-200"
                      )}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors font-medium rounded-lg text-sm",
                            goldMode ? "hover:bg-blue-500/10 text-blue-400" : "hover:bg-blue-50 text-blue-700"
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickAddLineCode(item.line.code);
                            setManualScannerOpen(true);
                            setOpenSettingsLineCode(null);
                          }}
                        >
                          <ListChecks className="w-4 h-4" /> Ingreso Manual
                        </button>
                        <button
                          className={cn("w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-red-500/10 transition-colors text-red-500 font-medium rounded-lg text-sm")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setClearLineTarget(item.line.code);
                            setOpenSettingsLineCode(null);
                          }}
                        >
                          <Trash2 className="w-4 h-4" /> Limpiar Línea
                        </button>
                      </div>
                    )}
                  </div>
                  <div
                    className={cn(
                      "h-8 px-3 rounded-xl border text-[11px] font-black uppercase tracking-wider flex items-center gap-2 shadow-sm select-none",
                      isFinished
                        ? goldMode
                          ? "bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse"
                          : "bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/30"
                        : isProducing
                        ? goldMode
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                          : "bg-emerald-100 border-emerald-300 text-emerald-800"
                        : "bg-slate-100 border-slate-200 text-slate-500"
                    )}
                  >
                    {isFinished ? (
                      <>
                        <Trophy className="w-3.5 h-3.5 text-amber-300 animate-bounce" />
                        <span>FINALIZADO</span>
                      </>
                    ) : isProducing ? (
                      <>
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                        <span>EN MARCHA</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        <span>EN ESPERA</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Contenido de la Orden Actual */}
              {item.currentSaladName ? (
                <div className="space-y-4">
                  {/* Fila principal del producto */}
                  <div className={cn(
                    "rounded-2xl p-4 space-y-3 border transition-all",
                    isFinished
                      ? goldMode
                        ? "bg-amber-950/30 border-amber-400/40 shadow-inner"
                        : "bg-emerald-50 border-emerald-400 shadow-sm"
                      : goldMode
                      ? "bg-white/[0.03] border-white/10"
                      : "bg-emerald-50/50 border-emerald-600/15"
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={cn("text-[9px] uppercase font-black tracking-wider flex items-center gap-1", goldMode ? "text-white/40" : "text-[#64748b]")}>
                          {isFinished ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> ORDEN FINALIZADA AL 100%
                            </span>
                          ) : (
                            <span>🌿 ORDEN DE FABRICACIÓN ACTUAL</span>
                          )}
                        </p>
                        <h4 className={cn("text-xl sm:text-2xl font-black leading-tight mt-0.5 flex items-center gap-1.5 flex-wrap", goldMode ? "text-white" : "text-[#0f291e]")}>
                          <span>🥗</span>
                          <span>{formatDisplayName(item.currentItem?.codigo10e, item.currentSaladName)}</span>
                        </h4>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {/* Lote + DLC combinados en un badge visual */}
                          {item.currentLote && (
                            <div className={cn(
                              "flex items-center gap-0 rounded-xl overflow-hidden border shadow-sm font-mono font-black text-xs",
                              goldMode ? "border-purple-500/30" : "border-purple-300"
                            )}>
                              <span className={cn(
                                "px-2.5 py-1.5 flex items-center gap-1",
                                goldMode ? "bg-purple-500/20 text-purple-300" : "bg-purple-100 text-purple-700"
                              )}>
                                🏷️ Lote: {item.currentLote}
                              </span>
                              {item.currentItem?.fechaCaducidad && (
                                <span className={cn(
                                  "px-2.5 py-1.5 flex items-center gap-1 border-l",
                                  goldMode ? "bg-purple-500/10 border-purple-500/30 text-purple-400/80" : "bg-purple-50 border-purple-200 text-purple-600"
                                )}>
                                  📅 DLC: {item.currentItem.fechaCaducidad}
                                </span>
                              )}
                            </div>
                          )}
                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                            <span>📦</span>
                            <span>{item.currentBoxType}</span>
                          </span>
                          <span className={cn("text-xs font-mono font-bold px-2 py-1 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10", goldMode ? "text-white/80" : "text-[#334155]")}>
                            {item.totalBoxes} cajas totales
                          </span>
                          {(() => {
                            const totalPico = milagroPicoCajas + nobjelasPicoCajas;
                            if (totalPico <= 0) return null;
                            if (item.noblejasBoxes > 0 && nobjelasPicoCajas > 0) {
                              return (
                                <span className={cn("text-[11px] font-mono px-2 py-1 rounded-lg border font-bold", goldMode ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-emerald-50 border-emerald-200 text-emerald-700")}>
                                  ⚡ Pico Total: {totalPico}c {milagroPicoCajas > 0 ? `(${milagroPicoCajas}c Mil + ${nobjelasPicoCajas}c Nob)` : `(${nobjelasPicoCajas}c Nob)`}
                                </span>
                              );
                            }
                            return (
                              <span className={cn("text-[11px] font-mono px-2 py-1 rounded-lg border font-bold", goldMode ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-emerald-50 border-emerald-200 text-emerald-700")}>
                                ⚡ Pico Milagro: {milagroPicoCajas}c
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Barra de progreso con capa en vivo */}
                    {(() => {
                      const liveExtra = liveEstimates[item.line.code] || 0;
                      const hasLiveData = isProducing && liveExtra > 0 && (item.progress?.lastPalletIntervalMs || 0) > 0;
                      const confirmedPct = item.percent;
                      const liveTotalBoxes = item.completedBoxes + liveExtra;
                      const livePct = Math.min(Math.round((liveTotalBoxes / item.totalBoxes) * 100), 100);
                      return (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className={goldMode ? "text-white/80" : "text-[#334155]"}>
                              📦 {item.completedBoxes}
                              {hasLiveData && (
                                <span className={cn("ml-1 font-mono", goldMode ? "text-amber-400" : "text-emerald-500")}>
                                  +~{liveExtra}
                                </span>
                              )}
                              <span className="opacity-50"> / {item.totalBoxes} cajas</span>
                              <span className="opacity-40 ml-1">({item.completedPallets}/{item.totalPallets} palets)</span>
                            </span>
                            <span className={cn("font-mono font-black text-sm", isFinished ? "text-emerald-500 text-base animate-pulse" : "text-emerald-600")}>
                              {hasLiveData ? `~${livePct}` : confirmedPct}%
                            </span>
                          </div>
                          <div className={cn(
                            "h-3.5 rounded-full overflow-hidden border relative",
                            goldMode ? "bg-white/5 border-white/10" : "bg-slate-200 border-slate-300"
                          )}>
                            {/* Capa base: palets confirmados */}
                            <div
                              className={cn(
                                "absolute inset-0 h-full transition-all duration-500 rounded-full",
                                isFinished
                                  ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 animate-pulse"
                                  : "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400"
                              )}
                              style={{ width: `${confirmedPct}%` }}
                            />
                            {/* Capa fantasma: estimación en vivo */}
                            {hasLiveData && (
                              <div
                                className={cn(
                                  "absolute inset-0 h-full rounded-full transition-all duration-[3000ms] ease-linear",
                                  goldMode
                                    ? "bg-amber-400/30"
                                    : "bg-emerald-400/35"
                                )}
                                style={{ width: `${livePct}%` }}
                              />
                            )}
                          </div>
                          {/* Indicador de velocidad */}
                          {hasLiveData && item.progress?.lastPalletIntervalMs && (
                            <p className={cn("text-[10px] font-mono text-right", goldMode ? "text-amber-400/60" : "text-emerald-600/60")}>
                              ⚡ ~{(item.currentItem?.boxesPerPallet || 70)} cj/{Math.round(item.progress.lastPalletIntervalMs / 60000)}min · estimación en vivo
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Recordatorio de Cadencia de Palet */}
                    {/* === ALERTA IA: PALET OLVIDADO === */}
                    {showPalletCadenceReminder && (
                      <div className={cn(
                        "p-3 rounded-xl border flex items-start gap-3 animate-pulse",
                        isDelayCritical
                          ? (goldMode ? "bg-red-500/15 border-red-500/40 text-red-300" : "bg-red-50 border-red-300 text-red-800")
                          : (goldMode ? "bg-amber-500/15 border-amber-500/40 text-amber-200" : "bg-amber-50 border-amber-300 text-amber-800")
                      )}>
                        <div className={cn(
                          "mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
                          isDelayCritical ? "bg-red-500/20" : "bg-amber-500/20"
                        )}>
                          <Bell className={cn("w-3.5 h-3.5", isDelayCritical ? "text-red-500" : "text-amber-500")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-xs uppercase tracking-wide">
                              {isDelayCritical ? "⚠️ Verificación de Palet Requerida" : "ℹ️ Tiempo de Ciclo Prolongado"}
                            </span>
                            <span className="font-mono text-[10px] opacity-70">
                              {minutesSinceLastPallet}m transcurridos / cadencia ~{estimatedPalletMinutes > 0 ? `${estimatedPalletMinutes}m` : "15m"}
                            </span>
                          </div>
                          {/* Mensaje IA (si ya cargó) */}
                          {isDelayCritical && aiAlerts[item.line.code]?.message && (
                            <p className="text-xs mt-1 font-medium opacity-90 leading-relaxed">
                              {aiAlerts[item.line.code].message}
                            </p>
                          )}
                          {isDelayCritical && !aiAlerts[item.line.code]?.message && (
                            <p className="text-xs mt-1 opacity-60 italic">Supervisión L.I.A analizando estado de línea... ⌛</p>
                          )}
                          {!isDelayCritical && (
                            <p className="text-xs mt-0.5 opacity-80">Por favor, confirme si el palet en curso ha sido completado para registrarlo en el sistema.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Matriz Visual de Palets en Vivo */}
                    {(isDuoView || totalMilagroPallets > 0) && (
                      <div className={cn("pt-2 border-t space-y-1.5", goldMode ? "border-white/5" : "border-emerald-600/10")}>
                        <div className="flex items-center justify-between text-xs">
                          <p className={cn("text-[10px] font-black uppercase tracking-wider flex items-center gap-2", goldMode ? "text-white/40" : "text-[#64748b]")}>
                            <span>🪵 MATRIZ DE PALETS ({prog.completedPallets}/{totalMilagroPallets})</span>
                            {estimatedPalletMinutes > 0 && (
                              <span className={cn("normal-case tracking-normal border px-1.5 rounded-sm", isDelayWarning ? "border-red-400 text-red-500 font-bold bg-red-500/10 animate-pulse" : (goldMode ? "border-white/10 text-white/50" : "border-emerald-600/20 text-emerald-700/60"))}>
                                {isDelayWarning ? `⚠️ Atrasado: ${minutesSinceLastPallet}m / ${estimatedPalletMinutes}m` : `~${estimatedPalletMinutes}m/palet`}
                              </span>
                            )}
                          </p>
                          {milagroPicoCajas > 0 && (
                            <span className={cn("text-[10px] font-bold font-mono", prog.picoCompleted ? "text-emerald-500 font-black" : (goldMode ? "text-amber-400" : "text-emerald-700"))}>
                              {prog.picoCompleted ? "✓ Pico Completado" : `Pico: ${milagroPicoCajas} cajas`}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {Array.from({ length: totalMilagroPallets }).map((_, pIdx) => {
                            const isDone = pIdx < prog.completedPallets;
                            const isCurrent = pIdx === prog.completedPallets;
                            return (
                              <div
                                key={pIdx}
                                className={cn(
                                  "h-8 px-2.5 rounded-lg border flex items-center justify-center text-[10px] font-mono font-bold transition-all",
                                  isDone
                                    ? goldMode
                                      ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                                      : "bg-emerald-100 border-emerald-400 text-emerald-800"
                                    : isCurrent
                                    ? goldMode
                                      ? "bg-emerald-500/5 border-emerald-400 border-dashed text-emerald-400 animate-pulse font-black"
                                      : "bg-emerald-50 border-emerald-500 border-dashed text-emerald-700 animate-pulse font-black"
                                    : goldMode
                                    ? "bg-white/[0.02] border-white/5 text-white/25"
                                    : "bg-slate-100 border-slate-200 text-slate-400"
                                )}
                              >
                                {isDone ? `📦 P${pIdx + 1} ✓` : `📦 P${pIdx + 1}`}
                              </div>
                            );
                          })}

                          {milagroPicoCajas > 0 && (
                            <div
                              className={cn(
                                "h-8 px-2.5 rounded-lg border flex items-center justify-center text-[10px] font-mono font-bold transition-all",
                                prog.picoCompleted
                                  ? goldMode
                                    ? "bg-emerald-500/25 border-emerald-400 text-emerald-300 font-black shadow-sm"
                                    : "bg-emerald-200 border-emerald-500 text-emerald-900 font-black"
                                  : !hasMilagroPalletsLeft
                                  ? goldMode
                                    ? "bg-amber-500/20 border-amber-400 border-dashed text-amber-300 animate-pulse font-black"
                                    : "bg-amber-100 border-amber-500 border-dashed text-amber-800 animate-pulse font-black"
                                  : goldMode
                                  ? "bg-white/[0.02] border-white/5 text-white/30"
                                  : "bg-slate-100 border-slate-200 text-slate-400"
                              )}
                            >
                              {prog.picoCompleted ? `⚡ Pico (${milagroPicoCajas}c) ✓` : `⚡ Pico (${milagroPicoCajas}c)`}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Desglose y Matriz de Noblejas */}
                    {item.noblejasBoxes > 0 && (
                      <div className={cn("pt-2 border-t space-y-1.5", goldMode ? "border-white/5" : "border-emerald-600/10")}>
                        <div className="flex items-center justify-between text-xs text-purple-600">
                          <span className="font-black uppercase tracking-wider text-[10px]">
                            🟣 NOBLEJAS ({item.noblejasDoneBoxes}/{item.noblejasBoxes} cajas)
                          </span>
                          <span className="font-mono font-bold">
                            {prog.noblejasCompletedPallets}/{maxNobPallets} palets {nobjelasPicoCajas > 0 ? `+ ${nobjelasPicoCajas}c pico` : ""}
                          </span>
                        </div>

                        {(isDuoView || maxNobPallets > 0) && (
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from({ length: maxNobPallets }).map((_, nIdx) => {
                              const isDone = nIdx < prog.noblejasCompletedPallets;
                              return (
                                <div
                                  key={nIdx}
                                  className={cn(
                                    "h-7 px-2 rounded-lg border flex items-center justify-center text-[9px] font-mono font-bold",
                                    isDone
                                      ? goldMode
                                        ? "bg-purple-500/25 border-purple-500/50 text-purple-200 font-black"
                                        : "bg-purple-100 border-purple-400 text-purple-800 font-black"
                                      : goldMode
                                      ? "bg-purple-500/5 border-purple-500/20 text-purple-400/40"
                                      : "bg-slate-100 border-slate-200 text-slate-400"
                                  )}
                                >
                                  {isDone ? `📦 Nob${nIdx + 1} ✓` : `📦 Nob${nIdx + 1}`}
                                </div>
                              );
                            })}

                            {nobjelasPicoCajas > 0 && (
                              <div
                                className={cn(
                                  "h-7 px-2 rounded-lg border flex items-center justify-center text-[9px] font-mono font-bold",
                                  prog.nobjelasPicoCompleted
                                    ? goldMode
                                      ? "bg-purple-500/35 border-purple-400 text-purple-200 font-black"
                                      : "bg-purple-200 border-purple-500 text-purple-900 font-black"
                                    : goldMode
                                    ? "bg-purple-500/10 border-purple-400 border-dashed text-purple-300"
                                    : "bg-purple-50 border-purple-300 border-dashed text-purple-700"
                                )}
                              >
                                {prog.nobjelasPicoCompleted ? `Nob Pico (${nobjelasPicoCajas}c) ✓` : `Nob Pico (${nobjelasPicoCajas}c)`}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Botones de Acción Rápida Directos desde Dashboard */}
                  <div className="space-y-2">
                    {/* Si está finalizado, mostrar botón de Limpieza y Finalización directa */}
                    {isFinished ? (
                      <button
                        onClick={(e) => handleFinalizeAndCleanLine(item, e)}
                        disabled={actionLoadingId === `${item.line.id}-fin`}
                        className={cn(
                          "w-full h-12 rounded-2xl text-xs font-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20 border animate-bounce",
                          goldMode
                            ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-black border-amber-400"
                            : "bg-gradient-to-r from-emerald-600 to-teal-500 text-white border-emerald-500"
                        )}
                        type="button"
                      >
                        {item.pendingCount > 0 ? (
                          <>
                            <SkipForward className="w-4 h-4" />
                            <span>✅ COMPLETADA → SIGUIENTE ({item.pendingCount} en cola)</span>
                          </>
                        ) : (
                          <>
                            <Trophy className="w-4 h-4" />
                            <span>🎉 FINALIZAR Y LIMPIAR LÍNEA</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <button
                          onClick={(e) => handleQuickMilagroAction(item, e)}
                          disabled={actionLoadingId === `${item.line.id}-mil` || isMilagroDone}
                          className={cn(
                            "h-10 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border shadow-sm",
                            item.noblejasBoxes > 0 ? "col-span-1" : "col-span-1 sm:col-span-2",
                            hasMilagroPalletsLeft
                              ? goldMode
                                ? "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300"
                                : "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white"
                              : hasMilagroPicoLeft
                              ? goldMode
                                ? "bg-amber-500/25 hover:bg-amber-500/35 border-amber-400 text-amber-200 animate-pulse font-black"
                                : "bg-amber-600 hover:bg-amber-700 border-amber-600 text-white animate-pulse font-black"
                              : "bg-slate-200 border-slate-300 text-slate-500"
                          )}
                          type="button"
                        >
                          {hasMilagroPalletsLeft ? (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>+1 Palet Milagro</span>
                            </>
                          ) : hasMilagroPicoLeft ? (
                            <>
                              <Zap className="w-3.5 h-3.5 text-amber-300" />
                              <span>+ Pico ({milagroPicoCajas}c)</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Milagro OK</span>
                            </>
                          )}
                        </button>

                        {item.noblejasBoxes > 0 && (
                          <button
                            onClick={(e) => handleQuickNoblejasAction(item, e)}
                            disabled={actionLoadingId === `${item.line.id}-nob` || isNobDone}
                            className={cn(
                              "h-10 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border shadow-sm",
                              hasNobPalletsLeft
                                ? goldMode
                                  ? "bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/30 text-purple-300"
                                  : "bg-purple-600 hover:bg-purple-700 border-purple-600 text-white"
                                : hasNobPicoLeft
                                ? goldMode
                                  ? "bg-purple-500/30 hover:bg-purple-500/40 border-purple-400 text-purple-200 animate-pulse font-black"
                                  : "bg-purple-700 hover:bg-purple-800 border-purple-700 text-white animate-pulse font-black"
                                : "bg-slate-200 border-slate-300 text-slate-500"
                            )}
                            type="button"
                          >
                            {hasNobPalletsLeft ? (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>+1 Palet Nob</span>
                              </>
                            ) : hasNobPicoLeft ? (
                              <>
                                <Zap className="w-3.5 h-3.5" />
                                <span>+ Pico Nob ({nobjelasPicoCajas}c)</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Nob OK</span>
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => onSelectLine(item.line.code)}
                          className={cn(
                            "h-10 px-2 rounded-xl border text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer shadow-sm",
                            item.noblejasBoxes > 0 ? "col-span-2 sm:col-span-1" : "col-span-1",
                            goldMode
                              ? "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                              : "bg-white hover:bg-emerald-50 border-emerald-600/20 text-[#0f291e]"
                          )}
                          type="button"
                        >
                          <span>✏️ Abrir Panel</span>
                          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Fila de corrección: deshacer palets */}
                  {item.progress && (prog.completedPallets > 0 || prog.picoCompleted || prog.noblejasCompletedPallets > 0 || prog.nobjelasPicoCompleted) && (
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <span className={cn("text-[10px] font-black uppercase tracking-widest opacity-40", goldMode ? "text-white" : "text-slate-500")}>Corregir:</span>
                      {(prog.completedPallets > 0 || prog.picoCompleted) && (
                        <button
                          onClick={(e) => handleUndoMilagroPallet(item, e)}
                          disabled={actionLoadingId === `${item.line.id}-undo-mil`}
                          className={cn(
                            "h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition-all active:scale-95 disabled:opacity-40",
                            goldMode
                              ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                              : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                          )}
                          type="button"
                          title="Deshacer último palet Milagro"
                        >
                          <Minus className="w-3 h-3" /> Milagro
                        </button>
                      )}
                      {item.noblejasBoxes > 0 && (prog.noblejasCompletedPallets > 0 || prog.nobjelasPicoCompleted) && (
                        <button
                          onClick={(e) => handleUndoNoblejasPallet(item, e)}
                          disabled={actionLoadingId === `${item.line.id}-undo-nob`}
                          className={cn(
                            "h-7 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition-all active:scale-95 disabled:opacity-40",
                            goldMode
                              ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
                              : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                          )}
                          type="button"
                          title="Deshacer último palet Noblejas"
                        >
                          <Minus className="w-3 h-3" /> Noblejas
                        </button>
                      )}
                    </div>
                  )}

                  {/* Resumen simple: cuánto falta en ensaladas */}
                  {(() => {
                    const cajasRestantes = item.totalBoxes - item.completedBoxes;
                    if (cajasRestantes <= 0) return null;
                    const saladasPerCaja = getSaladasPerCaja(item.currentBoxType || "");
                    const saladasRestantes = cajasRestantes * saladasPerCaja;
                    return (
                      <div className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-xl border text-xs",
                        goldMode ? "bg-white/3 border-white/8 text-white/70" : "bg-slate-50 border-slate-200 text-slate-600"
                      )}>
                        <span className="font-bold">Quedan:</span>
                        <div className="flex items-center gap-3">
                          <span className={cn("font-mono font-black text-sm", goldMode ? "text-amber-300" : "text-emerald-700")}>
                            {cajasRestantes} cajas
                          </span>
                          <span className="opacity-40">·</span>
                          <span className={cn("font-mono font-black text-sm", goldMode ? "text-white" : "text-slate-800")}>
                            ~{saladasRestantes.toLocaleString()} uds
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Siguiente Orden en Cola si existe */}
                  {item.nextItem && (() => {
                    const nextNobPallets = Math.floor(item.nextItem.noblejas / item.nextItem.boxesPerPallet);
                    const nextNobPico = item.nextItem.noblejas % item.nextItem.boxesPerPallet;
                    const totalPallets = Math.floor(item.nextItem.quantity / item.nextItem.boxesPerPallet);
                    const picoBoxes = item.nextItem.quantity % item.nextItem.boxesPerPallet;
                    return (
                      <div className={cn(
                        "border rounded-2xl p-3 flex flex-col gap-2 text-xs",
                        goldMode ? "bg-white/[0.01] border-white/5" : "bg-emerald-50/40 border-emerald-600/15"
                      )}>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest", goldMode ? "bg-amber-500/20 text-amber-400" : "bg-emerald-600/20 text-emerald-700")}>
                              A CONTINUACIÓN
                            </span>
                            <span className={cn("font-bold text-sm", goldMode ? "text-white" : "text-[#0f291e]")}>
                              🥗 {formatDisplayName(item.nextItem.codigo10e, item.nextItem.saladName)}
                            </span>
                            <span className={cn("font-bold", goldMode ? "text-amber-400/80" : "text-emerald-700")}>· 📦 {item.nextItem.boxType}</span>
                          </div>
                          <span className="text-emerald-600 font-mono font-bold text-sm bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                            {item.nextItem.quantity} cajas totales
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className="text-foreground/50 font-normal font-mono bg-foreground/5 px-2 py-0.5 rounded-md">
                            ({totalPallets} pales + {picoBoxes} cajas pico)
                          </span>
                          {item.nextItem.noblejas > 0 && (
                            <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-bold bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-lg">
                              Nob: {item.nextItem.noblejas} ({nextNobPallets}p + {nextNobPico}c)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Resto de la cola (Siguientes) */}
                  {item.queue && item.queue.length > (item.currentQueueIndex || 0) + 2 && (
                    <div className="flex flex-col gap-2 mt-2">
                      <div 
                        className="flex items-center gap-2 cursor-pointer select-none py-1 group/acc"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollapsedQueues(prev => ({ ...prev, [item.line.code]: !prev[item.line.code] }));
                        }}
                      >
                        <div className="text-[10px] uppercase font-black tracking-widest opacity-50 px-1 group-hover/acc:opacity-80 transition-opacity">
                          Siguientes en Cola ({(item.queue?.length || 0) - (item.currentQueueIndex || 0) - 2})
                        </div>
                        <span className="text-[10px] opacity-40">Click para ver</span>
                      </div>
                      
                      {!collapsedQueues[item.line.code] && item.queue.slice((item.currentQueueIndex || 0) + 2).map((qItem, idx) => {
                        const realIndex = (item.currentQueueIndex || 0) + 2 + idx;
                        const nextNobPallets = Math.floor(qItem.noblejas / qItem.boxesPerPallet);
                        const nextNobPico = qItem.noblejas % qItem.boxesPerPallet;
                        const totalPallets = Math.floor(qItem.quantity / qItem.boxesPerPallet);
                        const picoBoxes = qItem.quantity % qItem.boxesPerPallet;
                        return (
                          <div key={qItem.id} className={cn(
                            "border rounded-xl p-2.5 flex flex-col gap-1.5 text-xs relative group",
                            goldMode ? "bg-white/[0.01] border-white/5" : "bg-emerald-50/40 border-emerald-600/15"
                          )}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn("font-bold text-sm", goldMode ? "text-white" : "text-[#0f291e]")}>
                                  <span className="opacity-40 text-[10px] mr-1.5">#{realIndex + 1}</span>🥗 {formatDisplayName(qItem.codigo10e, qItem.saladName)}
                                </span>
                                <span className={cn("font-bold", goldMode ? "text-amber-400/80" : "text-emerald-700")}>· 📦 {qItem.boxType}</span>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => useProductionStore.getState().multiLineReorderQueue(item.line.code, realIndex, realIndex - 1)}
                                  className="p-1 rounded hover:bg-black/10 transition-colors"
                                  title="Subir"
                                >
                                  <span className="text-[10px]">⬆️</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => useProductionStore.getState().multiLineReorderQueue(item.line.code, realIndex, realIndex + 1)}
                                  disabled={realIndex === (item.queue?.length || 0) - 1}
                                  className="p-1 rounded hover:bg-black/10 disabled:opacity-30 transition-colors"
                                  title="Bajar"
                                >
                                  <span className="text-[10px]">⬇️</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    useProductionStore.getState().multiLineRemoveFromQueue(item.line.code, realIndex);
                                  }}
                                  className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-foreground/60 font-mono bg-foreground/5 px-1.5 py-0.5 rounded text-[10px]">
                                {qItem.quantity} cajas ({totalPallets}p + {picoBoxes}c)
                              </span>
                              {qItem.codigo10e && (
                                <span className={cn(
                                  "font-mono font-bold px-1.5 py-0.5 rounded text-[10px]",
                                  goldMode 
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                    : "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                                )}>
                                  🏷️ {qItem.codigo10e} {qItem.noblejas > 0 && "· 💜 Noblejas"}
                                </span>
                              )}
                              {qItem.noblejas > 0 && (
                                <span className="text-purple-600 dark:text-purple-400 font-bold text-[10px]">
                                  Nob: {qItem.noblejas} ({nextNobPallets}p + {nextNobPico}c)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                /* Estado vacío con botón rápido de carga directa */
                <div className={cn(
                  "border border-dashed rounded-2xl p-6 sm:p-8 text-center space-y-3",
                  goldMode ? "bg-white/[0.02] border-white/10" : "bg-slate-50/70 border-slate-300"
                )}>
                  <p className={cn("text-sm font-bold", goldMode ? "text-white/60" : "text-[#334155]")}>
                    ⚪ Línea sin órdenes activas
                  </p>
                  <p className={cn("text-xs", goldMode ? "text-white/40" : "text-[#64748b]")}>
                    Inicia una orden directamente en {item.line.code} con 1 clic:
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickAddLineCode(item.line.code);
                      }}
                      className={cn(
                        "px-4 py-2.5 rounded-xl text-xs font-black transition-all active:scale-95 inline-flex items-center gap-2 cursor-pointer shadow-md",
                        goldMode
                          ? "bg-amber-500 text-black hover:bg-amber-400"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      )}
                      type="button"
                    >
                      <Plus className="w-4 h-4" />
                      <span>⚡ Cargar Ensalada Rápida</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLine(item.line.code);
                      }}
                      className={cn(
                        "px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 inline-flex items-center gap-2 cursor-pointer border shadow-sm",
                        goldMode
                          ? "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                          : "bg-white hover:bg-emerald-50 border-emerald-600/20 text-[#0f291e]"
                      )}
                      type="button"
                    >
                      <span>✏️ Abrir Panel {item.line.code}</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  </div>
                </div>
              )}

              {/* Pie de Tarjeta (Limpio) */}
              <div className={cn("flex items-center justify-end pt-1 text-xs border-t", goldMode ? "border-white/5" : "border-emerald-600/10")}>
                <button
                  type="button"
                  onClick={() => onSelectLine(item.line.code)}
                  className="text-emerald-600 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform cursor-pointer hover:text-emerald-700 bg-transparent border-none p-0"
                >
                  <span>Ir a {item.line.code}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
          })
        )}
      </div>

      {/* Modal Popup para Cargar Ensalada Rápida desde el Dashboard */}
      {quickAddLineCode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setQuickAddLineCode(null)}
        >
          <div
            className={cn(
              "w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 animate-scale-in",
              goldMode
                ? "bg-[#141006] border-amber-500/40 text-white"
                : "bg-white border-emerald-600/30 text-[#0f291e]"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black flex items-center gap-2">
                <span>⚡ Cargar Ensalada en {quickAddLineCode}</span>
              </h3>
              <button
                onClick={() => setQuickAddLineCode(null)}
                className="p-1 rounded-lg hover:bg-black/10 cursor-pointer"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Variedad de ensalada */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider opacity-70">
                Selecciona Ensalada:
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {DEFAULT_SALADS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setModalSaladName(name)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer text-left flex items-center gap-1.5",
                      modalSaladName === name
                        ? goldMode ? "bg-amber-500 text-black border-amber-400 font-black" : "bg-emerald-600 text-white border-emerald-700 font-black"
                        : goldMode ? "bg-white/5 border-white/10 text-white/70" : "bg-slate-50 border-slate-200 text-slate-700"
                    )}
                  >
                    <span>🥗</span>
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tipo de Caja */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider opacity-70">
                Tipo de Caja:
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {DEFAULT_BOX_TYPES.map((box) => (
                  <button
                    key={box.name}
                    type="button"
                    onClick={() => setModalBoxType(box.name)}
                    className={cn(
                      "px-2 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer text-center",
                      modalBoxType === box.name
                        ? goldMode ? "bg-amber-500 text-black border-amber-400 font-black" : "bg-emerald-600 text-white border-emerald-700 font-black"
                        : goldMode ? "bg-white/5 border-white/10 text-white/70" : "bg-slate-50 border-slate-200 text-slate-700"
                    )}
                  >
                    {box.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Cantidad de Cajas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider opacity-70">
                  Cajas Totales:
                </label>
                <input
                  type="number"
                  value={modalBoxes}
                  onChange={(e) => setModalBoxes(e.target.value)}
                  className={cn(
                    "w-full h-10 px-3 rounded-xl border text-sm font-bold",
                    goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                  )}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider opacity-70">
                  Noblejas (cajas):
                </label>
                <input
                  type="number"
                  value={modalNoblejas}
                  onChange={(e) => setModalNoblejas(e.target.value)}
                  className={cn(
                    "w-full h-10 px-3 rounded-xl border text-sm font-bold",
                    goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                  )}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Lote */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider opacity-70">
                Lote (Opcional):
              </label>
              <input
                type="text"
                value={modalLote}
                onChange={(e) => setModalLote(e.target.value)}
                placeholder="Ej. L-2611A"
                className={cn(
                  "w-full h-10 px-3 rounded-xl border text-sm font-bold",
                  goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                )}
              />
            </div>

            {/* Botón Iniciar */}
            <button
              onClick={handleQuickAddSubmit}
              className={cn(
                "w-full h-12 rounded-2xl font-black text-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-lg",
                goldMode
                  ? "bg-gradient-to-r from-amber-500 to-yellow-400 text-black shadow-amber-500/25"
                  : "bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-emerald-500/25"
              )}
              type="button"
            >
              <Sparkles className="w-4 h-4" />
              <span>INICIAR PRODUCCIÓN EN {quickAddLineCode}</span>
            </button>
          </div>
        </div>
      )}

      {/* Scanner Manual Modal */}
      {isManualScannerOpen && quickAddLineCode && (
        <ManualOrderScanner
          targetLineCode={quickAddLineCode}
          onClose={() => {
            setManualScannerOpen(false);
            setQuickAddLineCode(null);
          }}
        />
      )}

      {/* Modal: Configurar Noblejas 10E */}
      {isNoblejasConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={cn(
            "relative w-full max-w-md p-6 rounded-3xl border shadow-2xl flex flex-col gap-6",
            goldMode ? "bg-[#141006] border-amber-500/30 text-white" : "bg-white border-emerald-600/20 text-[#0f291e]"
          )}>
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black">Diccionario Noblejas (10E)</h3>
              <button onClick={() => setIsNoblejasConfigOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5 opacity-50" />
              </button>
            </div>
            
            <p className="text-sm opacity-70">
              Configura cuántas cajas van a Noblejas por cada código 10E. Al escanear con la IA o agregar manualmente, se asignarán automáticamente.
            </p>

            <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-2">
              {Object.entries(useProductionStore.getState().noblejasConfig).length === 0 && (
                <div className="text-center p-4 opacity-50 text-sm italic border rounded-xl border-dashed">
                  No hay códigos 10E configurados.
                </div>
              )}
              {Object.entries(useProductionStore.getState().noblejasConfig).map(([code, boxes]) => (
                <div key={code} className="flex justify-between items-center p-3 border rounded-xl bg-slate-50/5">
                  <div className="flex gap-2 items-center">
                    <span className="font-bold">{code}</span>
                    <ArrowRight className="w-4 h-4 opacity-50" />
                    <span className="text-emerald-600 font-bold">{boxes} cajas</span>
                  </div>
                  <button 
                    onClick={() => useProductionStore.getState().removeNoblejasConfig(code)}
                    className="p-2 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 items-end pt-2 border-t border-slate-200/20">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider opacity-70">Cód. 10E</label>
                <input 
                  type="text" 
                  value={newCode10e} 
                  onChange={e => setNewCode10e(e.target.value)} 
                  placeholder="Ej. 123" 
                  className={cn(
                    "w-full h-10 px-3 rounded-xl border text-sm font-bold",
                    goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                  )} 
                />
              </div>
              <div className="w-24 space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider opacity-70">Cajas</label>
                <input 
                  type="number" 
                  value={newBoxes10e} 
                  onChange={e => setNewBoxes10e(e.target.value)} 
                  placeholder="0" 
                  className={cn(
                    "w-full h-10 px-3 rounded-xl border text-sm font-bold",
                    goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                  )} 
                />
              </div>
              <button 
                onClick={() => {
                  if (newCode10e && newBoxes10e) {
                    const cleanCode = newCode10e.replace(/^10[eE]/i, '');
                    useProductionStore.getState().setNoblejasConfig(`10E${cleanCode}`, parseInt(newBoxes10e, 10));
                    setNewCode10e("");
                    setNewBoxes10e("");
                  }
                }}
                disabled={!newCode10e || !newBoxes10e}
                className={cn(
                  "h-10 px-4 rounded-xl font-bold flex items-center justify-center transition-all",
                  (!newCode10e || !newBoxes10e) ? "opacity-50 cursor-not-allowed bg-slate-200 text-slate-400" : (goldMode ? "bg-amber-500 text-black" : "bg-emerald-600 text-white")
                )}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botón Peligro - Limpiar Base de Datos */}
      <div className="flex justify-center pt-8 pb-4">
        <button
          onClick={() => setIsClearDBConfirmOpen(true)}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all border shadow-sm hover:shadow-md",
            goldMode 
              ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20" 
              : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
          )}
        >
          <Trash2 className="w-4 h-4" />
          Limpiar toda la Base de Datos
        </button>
      </div>

      {/* Modal: Confirmar Limpiar Todo */}
      {isClearDBConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={cn(
            "relative w-full max-w-sm p-6 rounded-3xl border shadow-2xl flex flex-col gap-6 text-center items-center",
            goldMode ? "bg-[#141006] border-red-500/30 text-white" : "bg-white border-red-600/20 text-[#0f291e]"
          )}>
            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center">
              <Database className="w-8 h-8" />
            </div>
            
            <div>
              <h3 className="text-xl font-black text-red-500 mb-2">¡Atención!</h3>
              <p className="text-sm opacity-80 leading-relaxed">
                Vas a eliminar de la base de datos <strong>TODAS las ensaladas de TODAS las líneas</strong>. Esto se usa para reiniciar el sistema al final del turno. Esta acción no se puede deshacer.
              </p>
            </div>

            <div className="flex w-full gap-3 pt-2">
              <button 
                onClick={() => setIsClearDBConfirmOpen(false)}
                className="flex-1 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  setLoading(true);
                  setIsClearDBConfirmOpen(false);
                  await useProductionStore.getState().clearAllDatabase();
                  await fetchOverview();
                  setLoading(false);
                }}
                className="flex-1 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
              >
                Borrar Todo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {feedbackMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className={cn(
            "px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 text-sm font-bold",
            feedbackMsg.type === 'success' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-red-600 border-red-500 text-white"
          )}>
            <span>{feedbackMsg.type === 'success' ? '✅' : '❌'}</span>
            <span>{feedbackMsg.text}</span>
          </div>
        </div>
      )}

      <ExcelUploader 
        open={isExcelUploaderOpen} 
        onOpenChange={setExcelUploaderOpen} 
        goldMode={goldMode} 
      />
      <NoblejasUploader 
        open={isNoblejasUploaderOpen} 
        onOpenChange={setNoblejasUploaderOpen} 
        goldMode={goldMode} 
      />
      {/* === MODAL CONFIRMACIÓN LIMPIAR LÍNEA === */}
      {clearLineTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
          <div className={cn(
            "w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl border animate-in zoom-in-95 duration-200",
            goldMode ? "bg-[#120e06] border-amber-500/20" : "bg-white border-slate-200"
          )}>
            {/* Header */}
            <div className={cn(
              "px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3",
            )}>
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center",
                "bg-red-500/10 text-red-500"
              )}>
                <Trash2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className={cn("text-xl font-black", goldMode ? "text-white" : "text-slate-800")}>
                  Limpiar Línea {clearLineTarget}
                </h3>
                <p className={cn("text-sm mt-1", goldMode ? "text-white/50" : "text-slate-500")}>
                  Se detendrá la producción y se borrará toda la cola de órdenes. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            {/* Confirm typing */}
            <div className={cn(
              "px-6 pb-5 flex flex-col gap-3"
            )}>
              <div className={cn(
                "p-3 rounded-xl border text-sm font-mono text-center font-bold",
                goldMode ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-red-50 border-red-200 text-red-600"
              )}>
                ⚠️ Línea {clearLineTarget}: 0 órdenes · Cola vacía
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setClearLineTarget(null)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all active:scale-95",
                    goldMode
                      ? "border-white/15 text-white hover:bg-white/5"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    useProductionStore.getState().multiLineClearQueueAndSalads(clearLineTarget);
                    setClearLineTarget(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl font-black text-sm bg-red-500 hover:bg-red-600 text-white transition-all active:scale-95 shadow-lg shadow-red-500/30"
                >
                  Sí, limpiar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
