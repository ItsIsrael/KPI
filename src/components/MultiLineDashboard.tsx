"use client";

import { useEffect, useState } from "react";
import type { LineOverview, FormatProgress, Salad, QueueItem, HistoryItem } from "@/types/types";
import { calculateFormat, DEFAULT_BOX_TYPES, generateId } from "@/types/types";
import { getFactoryOverview, syncProgress, syncLineState, syncQueueItems, saveHistoryLog } from "@/lib/supabase-service";
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
  X
} from "lucide-react";

interface MultiLineDashboardProps {
  onSelectLine: (lineCode: string) => void;
  goldMode: boolean;
}

type ViewMode = "ALL" | "PAIR_01" | "PAIR_23" | "CUSTOM";

const QUICK_SALADS = [
  "César",
  "César American",
  "Pasta y Rúcula",
  "Gourmet",
  "Pasta y Atún",
  "Japón",
  "Digestiva",
  "Wraps",
];

export function MultiLineDashboard({ onSelectLine, goldMode }: MultiLineDashboardProps) {
  const [overview, setOverview] = useState<LineOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("ALL");
  const [customSelectedLines, setCustomSelectedLines] = useState<string[]>(["K00", "K01"]);
  const [connectionTest, setConnectionTest] = useState<SupabaseTestResult | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modal para Cargar Ensalada Rápida directamente desde el Dashboard
  const [quickAddLineCode, setQuickAddLineCode] = useState<string | null>(null);
  const [modalSaladName, setModalSaladName] = useState<string>("César");
  const [modalBoxType, setModalBoxType] = useState<string>("Cartón 4");
  const [modalBoxes, setModalBoxes] = useState<string>("144");
  const [modalNoblejas, setModalNoblejas] = useState<string>("0");
  const [modalLote, setModalLote] = useState<string>("");

  const fetchOverview = async () => {
    try {
      const data = await getFactoryOverview();
      const localStore = useProductionStore.getState();

      const merged = data.map((o) => {
        const local = localStore.lineStorage[o.line.code];
        if (local && local.queue && local.queue.length > 0) {
          const currentItem = local.queue[local.currentQueueIndex] || local.queue[0];
          const localProg = currentItem ? local.queueProgress[currentItem.id] : undefined;
          const dbProg = o.progress;

          const prog = (localProg && (!dbProg || localProg.completedPallets >= (dbProg.completedPallets || 0)))
            ? localProg
            : (dbProg || localProg);

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
            const totalPallets = calc.pallets;
            const completedPallets = prog.completedPallets;
            const noblejasDoneBoxes = (prog.noblejasCompletedPallets || 0) * currentItem.boxesPerPallet + (prog.nobjelasPicoCompleted ? (noblejasBoxes % currentItem.boxesPerPallet) : 0);
            const milagroDoneBoxes = completedPallets * currentItem.boxesPerPallet + (prog.picoCompleted ? calc.pico : 0);
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
    const interval = setInterval(fetchOverview, 3000);
    return () => clearInterval(interval);
  }, []);

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
        return {
          ...o,
          completedBoxes: newDone,
          completedPallets: nextPallets,
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
        return {
          ...o,
          completedBoxes: newDone,
          noblejasDoneBoxes: o.noblejasDoneBoxes + addedBoxes,
          percent: Math.min(Math.round((newDone / o.totalBoxes) * 100), 100),
          progress: updatedProg,
        };
      })
    );

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

    // Limpiar estado en memoria local y store
    const emptyState = {
      salads: [],
      queue: [],
      currentQueueIndex: 0,
      currentProgress: null,
      queueProgress: {},
      isProducing: false,
      formatStartTime: null,
      palletSpeeds: [],
    };

    const store = useProductionStore.getState();
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

    setActionLoadingId(null);
  };

  // Quick Action: Cargar Ensalada Rápida desde Modal
  const handleQuickAddSubmit = async () => {
    if (!quickAddLineCode) return;
    const targetLine = overview.find((o) => o.line.code === quickAddLineCode);
    if (!targetLine) return;

    const boxConfig = DEFAULT_BOX_TYPES.find((b) => b.name === modalBoxType) || DEFAULT_BOX_TYPES[0];
    const totalQty = parseInt(modalBoxes, 10) || 144;
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

    const newQueueItem: QueueItem = {
      id: generateId(),
      saladId: newSalad.id,
      saladName: newSalad.name,
      formatId: newFormat.id,
      boxType: newFormat.boxType,
      quantity: newFormat.quantity,
      noblejas: newFormat.noblejas,
      boxesPerPallet: newFormat.boxesPerPallet,
      lote: newFormat.lote,
      linea: quickAddLineCode,
    };

    const initialProg: FormatProgress = {
      queueItemId: newQueueItem.id,
      completedPallets: 0,
      picoCompleted: false,
      noblejasCompleted: false,
      noblejasCompletedPallets: 0,
      nobjelasPicoCompleted: false,
      finished: false,
      boxesAdjustment: 0,
    };

    const lineState = {
      salads: [newSalad],
      queue: [newQueueItem],
      currentQueueIndex: 0,
      currentProgress: initialProg,
      queueProgress: { [newQueueItem.id]: initialProg },
      isProducing: true,
      formatStartTime: Date.now(),
      palletSpeeds: [],
    };

    useProductionStore.setState((s) => ({
      lineStorage: {
        ...s.lineStorage,
        [quickAddLineCode]: lineState,
      },
      ...(s.activeLineCode === quickAddLineCode ? lineState : {}),
    }));

    await syncQueueItems(targetLine.line.id, [newQueueItem]);
    await syncLineState(targetLine.line.id, true, 0);
    await syncProgress(newQueueItem.id, initialProg);

    setQuickAddLineCode(null);
    fetchOverview();
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
    <div className="space-y-4 max-w-7xl mx-auto px-2 sm:px-4 py-3">
      {/* Cabecera del Monitor de Planta */}
      <div className={cn(
        "glass-card rounded-3xl p-4 sm:p-6 border relative overflow-hidden transition-all shadow-2xl space-y-4",
        goldMode
          ? "bg-[#141006]/95 border-amber-500/30 text-white"
          : "bg-white/95 border-emerald-600/20 text-[#0f291e]"
      )}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-sm",
                goldMode 
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40" 
                  : "bg-emerald-600/10 text-emerald-700 border-emerald-600/30"
              )}>
                <span>🏢</span>
                <span>🌿 Sala de Control y Monitorización</span>
              </span>

              {connectionTest && (
                <span className={cn(
                  "text-[10px] font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 transition-all shadow-sm",
                  connectionTest.connected
                    ? goldMode 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                )}>
                  {connectionTest.connected ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                      <span>⚡ Supabase Realtime ({connectionTest.latencyMs}ms)</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                      <span>Modo Local</span>
                    </>
                  )}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-2 mt-0.5">
              <span className={goldMode ? "text-gold-gradient" : "text-[#0f291e]"}>
                {viewMode === "PAIR_01" ? "🌱 Supervisión de Líneas K00 & K01" : viewMode === "PAIR_23" ? "🌱 Supervisión de Líneas K02 & K03" : "🌿 Monitor General de Planta (4 Líneas)"}
              </span>
            </h2>
            <p className={cn("text-xs", goldMode ? "text-white/50" : "text-[#475569]")}>
              Control en vivo, avance de palets, picos y alertas de cadencia en directo
            </p>
          </div>

          {/* Métricas consolidadas de planta */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className={cn(
              "rounded-2xl px-3.5 py-2 text-center min-w-[95px] border shadow-sm",
              goldMode ? "bg-white/5 border-white/10" : "bg-emerald-50/70 border-emerald-600/15"
            )}>
              <p className={cn("text-[9px] uppercase font-bold tracking-wider", goldMode ? "text-white/40" : "text-[#64748b]")}>
                Líneas Activas
              </p>
              <p className="text-base sm:text-lg font-black text-emerald-600 tabular-nums">
                {activeLinesCount} <span className={cn("text-xs", goldMode ? "text-white/40" : "text-[#94a3b8]")}>/ {overview.length || 4}</span>
              </p>
            </div>

            <div className={cn(
              "rounded-2xl px-3.5 py-2 text-center min-w-[110px] border shadow-sm",
              goldMode ? "bg-white/5 border-white/10" : "bg-emerald-50/70 border-emerald-600/15"
            )}>
              <p className={cn("text-[9px] uppercase font-bold tracking-wider", goldMode ? "text-white/40" : "text-[#64748b]")}>
                📦 Cajas en Planta
              </p>
              <p className={cn("text-base sm:text-lg font-black tabular-nums", goldMode ? "text-white" : "text-[#0f291e]")}>
                {totalCompletedPlant} <span className={cn("text-xs", goldMode ? "text-white/40" : "text-[#94a3b8]")}>/ {totalBoxesPlant}</span>
              </p>
            </div>

            <button
              onClick={() => {
                fetchOverview();
                handleTestConnection();
              }}
              disabled={loading || isTestingConn}
              className={cn(
                "h-11 px-3.5 border rounded-2xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 text-xs font-bold shrink-0 shadow-sm",
                goldMode
                  ? "border-white/10 bg-white/5 hover:bg-white/10 text-white"
                  : "border-emerald-600/20 bg-white hover:bg-emerald-50 text-[#0f291e]"
              )}
              title="Refrescar datos en vivo"
              type="button"
            >
              <RefreshCw className={cn("w-4 h-4 text-emerald-600", (loading || isTestingConn) && "animate-spin")} />
              <span className="hidden sm:inline">Refrescar</span>
            </button>
          </div>
        </div>

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
        {displayedLines.map((item) => {
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

          // Recordatorio inteligente de palet (> 5 min sin registrar palet en marcha)
          const now = Date.now();
          const lastUpdated = prog.palletLastUpdated || prog.lastPalletTimestamp || 0;
          const minutesSinceLastPallet = lastUpdated > 0 ? Math.floor((now - lastUpdated) / 60000) : 0;
          const showPalletCadenceReminder = isProducing && minutesSinceLastPallet >= 5;

          const hasMilagroPalletsLeft = prog.completedPallets < totalMilagroPallets;
          const hasMilagroPicoLeft = milagroPicoCajas > 0 && !prog.picoCompleted;
          const isMilagroDone = !hasMilagroPalletsLeft && !hasMilagroPicoLeft;

          const hasNobPalletsLeft = maxNobPallets > 0 && prog.noblejasCompletedPallets < maxNobPallets;
          const hasNobPicoLeft = nobjelasPicoCajas > 0 && !prog.nobjelasPicoCompleted;
          const isNobDone = item.noblejasBoxes > 0 && !hasNobPalletsLeft && !hasNobPicoLeft;

          return (
            <div
              key={item.line.id}
              onClick={() => onSelectLine(item.line.code)}
              className={cn(
                "glass-card rounded-3xl p-5 sm:p-6 border transition-all duration-300 hover:shadow-2xl cursor-pointer relative overflow-hidden group space-y-4",
                goldMode
                  ? "border-amber-500/25 hover:border-amber-500/50 bg-[#120e06]/90 text-white"
                  : "border-emerald-600/20 hover:border-emerald-500 bg-white/95 text-[#0f291e] shadow-lg",
                isFinished && (goldMode ? "ring-2 ring-amber-400 border-amber-400 bg-amber-950/20" : "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/80"),
                isProducing && "ring-1 ring-emerald-500/30 shadow-xl shadow-emerald-500/5",
                isDuoView && "p-6 sm:p-7"
              )}
            >
              {/* Encabezado de la Línea con Badge Reactivo Limpio */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-sm font-black px-3.5 py-1.5 rounded-xl border shadow-sm tracking-wider",
                    goldMode
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-emerald-600 text-white border-emerald-500/40"
                  )}>
                    {item.line.code}
                  </span>
                  <div>
                    <h3 className={cn(
                      "text-base sm:text-lg font-black transition-colors flex items-center gap-1.5",
                      goldMode ? "text-white group-hover:text-emerald-400" : "text-[#0f291e] group-hover:text-emerald-700"
                    )}>
                      <span>Línea {item.line.code}</span>
                    </h3>
                    <p className={cn("text-[11px] font-mono", goldMode ? "text-white/40" : "text-[#64748b]")}>
                      📋 {item.queueLength} {item.queueLength === 1 ? "formato" : "formatos"} ({item.pendingCount} en cola)
                    </p>
                  </div>
                </div>

                {/* Badge Reactivo Automático (Sin doble punto y sin acción manual forzada) */}
                <div className="flex items-center gap-2">
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
                        <h4 className={cn("text-xl sm:text-2xl font-black leading-tight mt-0.5 flex items-center gap-1.5", goldMode ? "text-white" : "text-[#0f291e]")}>
                          <span>🥗</span>
                          <span>{item.currentSaladName}</span>
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                            <span>📦</span>
                            <span>{item.currentBoxType}</span>
                          </span>
                          <span className="opacity-30">|</span>
                          <span className={cn("text-xs font-mono font-bold", goldMode ? "text-white/70" : "text-[#334155]")}>
                            {item.totalBoxes} cajas totales
                          </span>
                          {milagroPicoCajas > 0 && (
                            <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded-lg border", goldMode ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-emerald-50 border-emerald-200 text-emerald-700")}>
                              Pico Milagro: {milagroPicoCajas}c
                            </span>
                          )}
                        </div>
                      </div>

                      {item.currentLote && (
                        <div className="text-right">
                          <span className={cn(
                            "text-[10px] font-mono font-bold px-2.5 py-1 rounded-xl block border",
                            goldMode
                              ? "bg-purple-500/20 text-purple-300 border-purple-500/35"
                              : "bg-purple-50 text-purple-700 border-purple-200"
                          )}>
                            🏷️ Lote: {item.currentLote}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Barra de progreso global con porcentaje */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className={goldMode ? "text-white/80" : "text-[#334155]"}>
                          📦 {item.completedBoxes} de {item.totalBoxes} cajas ({item.completedPallets} / {item.totalPallets} palets)
                          {item.totalBoxes - item.completedBoxes > 0 && (
                            <span className="opacity-60 ml-1">({item.totalBoxes - item.completedBoxes} restantes)</span>
                          )}
                        </span>
                        <span className={cn("font-mono font-black text-sm", isFinished ? "text-emerald-500 text-base animate-pulse" : "text-emerald-600")}>
                          {item.percent}%
                        </span>
                      </div>
                      <div className={cn(
                        "h-3.5 rounded-full overflow-hidden border relative",
                        goldMode ? "bg-white/5 border-white/10" : "bg-slate-200 border-slate-300"
                      )}>
                        <div
                          className={cn(
                            "h-full transition-all duration-500 rounded-full",
                            isFinished
                              ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 animate-pulse"
                              : "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400"
                          )}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Recordatorio de Cadencia de Palet */}
                    {showPalletCadenceReminder && (
                      <div className={cn(
                        "p-2.5 rounded-xl border flex items-center justify-between text-xs animate-pulse",
                        goldMode ? "bg-amber-500/15 border-amber-500/40 text-amber-200" : "bg-amber-50 border-amber-300 text-amber-800"
                      )}>
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="font-bold">Hace {minutesSinceLastPallet} min del último palet. ¿Completaste uno?</span>
                        </div>
                        <span className="font-mono text-[10px] underline">Pulsa +1 Palet</span>
                      </div>
                    )}

                    {/* Matriz Visual de Palets en Vivo */}
                    {(isDuoView || totalMilagroPallets > 0) && (
                      <div className={cn("pt-2 border-t space-y-1.5", goldMode ? "border-white/5" : "border-emerald-600/10")}>
                        <div className="flex items-center justify-between text-xs">
                          <p className={cn("text-[10px] font-black uppercase tracking-wider", goldMode ? "text-white/40" : "text-[#64748b]")}>
                            🪵 MATRIZ DE PALETS MILAGRO ({prog.completedPallets}/{totalMilagroPallets})
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
                        <Trophy className="w-4 h-4" />
                        <span>🎉 FINALIZAR ORDEN Y LIMPIAR LÍNEA</span>
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

                  {/* Siguiente Orden en Cola si existe */}
                  {item.nextItem && isDuoView && (
                    <div className={cn(
                      "border rounded-2xl p-3 flex items-center justify-between text-xs",
                      goldMode ? "bg-white/[0.01] border-white/5" : "bg-emerald-50/40 border-emerald-600/15"
                    )}>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-black uppercase tracking-wider", goldMode ? "text-white/40" : "text-[#64748b]")}>
                          A continuación:
                        </span>
                        <span className={cn("font-bold", goldMode ? "text-white/80" : "text-[#0f291e]")}>🥗 {item.nextItem.saladName}</span>
                        <span className="opacity-40">· 📦 {item.nextItem.boxType}</span>
                      </div>
                      <span className="text-emerald-600 font-mono font-bold">{item.nextItem.quantity} cajas</span>
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
                    <span>⚡ Cargar Ensalada Rápida en {item.line.code}</span>
                  </button>
                </div>
              )}

              {/* Pie de Tarjeta */}
              <div className={cn("flex items-center justify-between pt-1 text-xs border-t", goldMode ? "border-white/5" : "border-emerald-600/10")}>
                <span className={cn("text-[11px] font-mono", goldMode ? "text-white/40" : "text-[#64748b]")}>
                  ⚡ Sincronizado vía WebSockets en vivo
                </span>
                <span className="text-emerald-600 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Ir a {item.line.code}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
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
                {QUICK_SALADS.map((name) => (
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
    </div>
  );
}
