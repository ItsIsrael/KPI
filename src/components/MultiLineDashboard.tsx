"use client";

import { useEffect, useState } from "react";
import type { LineOverview, FormatProgress } from "@/types/types";
import { calculateFormat } from "@/types/types";
import { getFactoryOverview, syncProgress, syncLineState } from "@/lib/supabase-service";
import { testSupabaseConnection, type SupabaseTestResult } from "@/lib/supabase-test";
import { useProductionStore } from "@/store/production-store";
import { cn } from "@/lib/utils";
import { 
  Building2, 
  Package, 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Pause, 
  Play,
  Plus, 
  ArrowRight, 
  ChevronRight,
  Layers,
  CheckCircle2,
  Trophy
} from "lucide-react";

interface MultiLineDashboardProps {
  onSelectLine: (lineCode: string) => void;
  goldMode: boolean;
}

type ViewMode = "ALL" | "PAIR_01" | "PAIR_23" | "CUSTOM";

export function MultiLineDashboard({ onSelectLine, goldMode }: MultiLineDashboardProps) {
  const [overview, setOverview] = useState<LineOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("PAIR_01"); // Por defecto enfocamos en la pareja K00 & K01
  const [customSelectedLines, setCustomSelectedLines] = useState<string[]>(["K00", "K01"]);
  const [connectionTest, setConnectionTest] = useState<SupabaseTestResult | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      const data = await getFactoryOverview();
      const localStore = useProductionStore.getState();

      // Fusionar inteligentemente con lineStorage local
      const merged = data.map((o) => {
        const local = localStore.lineStorage[o.line.code];
        if (local && local.queue && local.queue.length > 0) {
          const currentItem = local.queue[local.currentQueueIndex] || local.queue[0];
          const localProg = currentItem ? local.queueProgress[currentItem.id] : undefined;
          const dbProg = o.progress;

          // Seleccionar el progreso más avanzado (optimista / local)
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
            const noblejasDoneBoxes = (prog.noblejasCompletedPallets || 0) * currentItem.boxesPerPallet;
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
    const interval = setInterval(fetchOverview, 3000); // Refresco en vivo constante
    return () => clearInterval(interval);
  }, []);

  // Quick Action: Añadir Palet Milagro directamente desde el Dashboard (Persistente y sin parpadeos)
  const handleQuickAddMilagroPallet = async (item: LineOverview, e: React.MouseEvent) => {
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
    if (prog.completedPallets >= item.calc.pallets) return;

    setActionLoadingId(`${item.line.id}-pal`);
    const nextPallets = prog.completedPallets + 1;
    const isFinished = nextPallets >= item.calc.pallets && (item.calc.pico === 0 || prog.picoCompleted);
    const updatedProg: FormatProgress = {
      ...prog,
      completedPallets: nextPallets,
      finished: isFinished,
      palletLastUpdated: Date.now(),
    };

    // 1. Actualización en Store global (incluye lineStorage local)
    useProductionStore.getState().updateLineItemProgress(item.line.code, item.currentItem.id, updatedProg);

    // 2. Actualización optimista inmediata en UI
    setOverview((prev) =>
      prev.map((o) => {
        if (o.line.id !== item.line.id) return o;
        const newDone = o.completedBoxes + item.currentItem!.boxesPerPallet;
        return {
          ...o,
          completedBoxes: newDone,
          completedPallets: nextPallets,
          percent: Math.min(Math.round((newDone / o.totalBoxes) * 100), 100),
          progress: updatedProg,
        };
      })
    );

    // 3. Sincronización asíncrona con Supabase
    await syncProgress(item.currentItem.id, updatedProg);
    setActionLoadingId(null);
  };

  // Quick Action: Añadir Palet Noblejas directamente desde el Dashboard (Persistente)
  const handleQuickAddNoblejasPallet = async (item: LineOverview, e: React.MouseEvent) => {
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
    if (prog.noblejasCompletedPallets >= maxNobPallets) return;

    setActionLoadingId(`${item.line.id}-nob`);
    const nextNobPallets = prog.noblejasCompletedPallets + 1;
    const isNobDone = nextNobPallets >= maxNobPallets;
    const updatedProg: FormatProgress = {
      ...prog,
      noblejasCompleted: isNobDone,
      noblejasCompletedPallets: nextNobPallets,
      palletLastUpdated: Date.now(),
    };

    // 1. Actualización en Store global
    useProductionStore.getState().updateLineItemProgress(item.line.code, item.currentItem.id, updatedProg);

    // 2. Actualización optimista en UI
    setOverview((prev) =>
      prev.map((o) => {
        if (o.line.id !== item.line.id) return o;
        const newDone = o.completedBoxes + item.currentItem!.boxesPerPallet;
        return {
          ...o,
          completedBoxes: newDone,
          noblejasDoneBoxes: o.noblejasDoneBoxes + item.currentItem!.boxesPerPallet,
          percent: Math.min(Math.round((newDone / o.totalBoxes) * 100), 100),
          progress: updatedProg,
        };
      })
    );

    // 3. Sincronización con Supabase
    await syncProgress(item.currentItem.id, updatedProg);
    setActionLoadingId(null);
  };

  // Quick Action: Alternar Producción / Pausa de la Línea
  const handleToggleLineProducing = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    const hasActiveOrders = item.queueLength > 0 && !!item.currentSaladName;
    if (!hasActiveOrders) return; // Si no hay órdenes, no se puede iniciar

    const nextProducing = !item.line.isProducing;
    setOverview((prev) =>
      prev.map((o) =>
        o.line.id === item.line.id
          ? { ...o, line: { ...o.line, isProducing: nextProducing } }
          : o
      )
    );
    await syncLineState(item.line.id, nextProducing, item.line.currentQueueIndex);
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
      {/* Cabecera del Monitor de Planta Adaptable a Tema Claro / Gold */}
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
                <span>🌿 Sala de Control y Monitorización Dual</span>
              </span>

              {/* Indicador de Supabase Realtime */}
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
                {viewMode === "PAIR_01" ? "🌱 Supervisión de Líneas K00 & K01" : viewMode === "PAIR_23" ? "🌱 Supervisión de Líneas K02 & K03" : "🌿 Monitor Multilínea en Tiempo Real"}
              </span>
            </h2>
            <p className={cn("text-xs", goldMode ? "text-white/50" : "text-[#475569]")}>
              Control simultáneo, avance de palets y seguimiento de lotes en directo
            </p>
          </div>

          {/* Métricas consolidadas de planta */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className={cn(
              "rounded-2xl px-3.5 py-2 text-center min-w-[95px] border shadow-sm",
              goldMode
                ? "bg-white/5 border-white/10"
                : "bg-emerald-50/70 border-emerald-600/15"
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
              goldMode
                ? "bg-white/5 border-white/10"
                : "bg-emerald-50/70 border-emerald-600/15"
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

        {/* Barra de Filtros: Parejas vs Todas */}
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

      {/* Grid de Líneas de Producción (Alta Densidad en Modo Dúo) */}
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
          const maxNobPallets = currentItem && item.noblejasBoxes > 0 ? Math.floor(item.noblejasBoxes / currentItem.boxesPerPallet) : 0;

          // Estado dinámico automático: detecta finalizado, en marcha o en espera
          const hasActiveOrders = item.queueLength > 0 && !!item.currentSaladName;
          const isFinished = hasActiveOrders && (item.percent >= 100 || prog.finished);
          const isProducing = item.line.isProducing && hasActiveOrders && !isFinished;

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
              {/* Encabezado de la Línea */}
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
                      📋 {item.queueLength} formatos ({item.pendingCount} en cola)
                    </p>
                  </div>
                </div>

                {/* Botón de Estado Dinámico de la Línea (Detecta Finalizado) */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleToggleLineProducing(item, e)}
                    disabled={!hasActiveOrders}
                    className={cn(
                      "h-8 px-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:cursor-default shadow-sm",
                      isFinished
                        ? goldMode
                          ? "bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse"
                          : "bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/30"
                        : isProducing
                        ? goldMode
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                          : "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200"
                        : hasActiveOrders
                        ? goldMode
                          ? "bg-white/5 border-white/10 text-white/40"
                          : "bg-slate-100 border-slate-200 text-slate-500"
                        : goldMode
                        ? "bg-white/5 border-white/10 text-white/40"
                        : "bg-slate-100 border-slate-200 text-slate-500"
                    )}
                    title={hasActiveOrders ? (isFinished ? "Formato completado al 100%" : isProducing ? "Pausar línea" : "Iniciar producción") : "Sin órdenes activas"}
                    type="button"
                  >
                    {isFinished ? (
                      <>
                        <Trophy className="w-3.5 h-3.5 animate-bounce" />
                        <span>🏆 FINALIZADO</span>
                      </>
                    ) : isProducing ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span>🟢 EN MARCHA</span>
                      </>
                    ) : hasActiveOrders ? (
                      <>
                        <Pause className="w-3 h-3 opacity-60" />
                        <span>⏸️ EN PAUSA</span>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        <span>⚪ EN ESPERA</span>
                      </>
                    )}
                  </button>
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

                    {/* Matriz Visual de Palets en Vivo (En Modo Dúo) */}
                    {isDuoView && totalMilagroPallets > 0 && (
                      <div className={cn("pt-2 border-t space-y-1.5", goldMode ? "border-white/5" : "border-emerald-600/10")}>
                        <p className={cn("text-[10px] font-black uppercase tracking-wider", goldMode ? "text-white/40" : "text-[#64748b]")}>
                          🪵 MATRIZ DE PALETS MILAGRO ({prog.completedPallets}/{totalMilagroPallets})
                        </p>
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
                            {prog.noblejasCompletedPallets}/{maxNobPallets} palets
                          </span>
                        </div>

                        {isDuoView && maxNobPallets > 0 && (
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
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Botones de Acción Rápida Directos desde el Dashboard */}
                  {isDuoView && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        onClick={(e) => handleQuickAddMilagroPallet(item, e)}
                        disabled={actionLoadingId === `${item.line.id}-pal` || prog.completedPallets >= totalMilagroPallets}
                        className={cn(
                          "h-10 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border shadow-sm",
                          item.noblejasBoxes > 0 ? "col-span-1" : "col-span-1 sm:col-span-2",
                          goldMode
                            ? "bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30 text-emerald-300"
                            : "bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white"
                        )}
                        title="Marcar +1 Palet Milagro completado"
                        type="button"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+1 Palet Milagro</span>
                      </button>

                      {/* Solo mostrar botón de Noblejas si la orden TIENE cajas de Noblejas */}
                      {item.noblejasBoxes > 0 && (
                        <button
                          onClick={(e) => handleQuickAddNoblejasPallet(item, e)}
                          disabled={actionLoadingId === `${item.line.id}-nob` || (maxNobPallets > 0 && prog.noblejasCompletedPallets >= maxNobPallets)}
                          className={cn(
                            "h-10 px-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border shadow-sm",
                            goldMode
                              ? "bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/30 text-purple-300"
                              : "bg-purple-600 hover:bg-purple-700 border-purple-600 text-white"
                          )}
                          title="Sumar +1 Palet de Noblejas a la línea"
                          type="button"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+1 Palet Nob</span>
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

                  {/* Siguiente Orden en Cola si existe */}
                  {item.nextItem && isDuoView && (
                    <div className={cn(
                      "border rounded-2xl p-3 flex items-center justify-between text-xs",
                      goldMode
                        ? "bg-white/[0.01] border-white/5"
                        : "bg-emerald-50/40 border-emerald-600/15"
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
                <div className={cn(
                  "border border-dashed rounded-2xl p-8 text-center space-y-2",
                  goldMode
                    ? "bg-white/[0.02] border-white/10"
                    : "bg-slate-50/70 border-slate-300"
                )}>
                  <p className={cn("text-sm font-bold", goldMode ? "text-white/60" : "text-[#334155]")}>
                    ⚪ Línea sin órdenes activas
                  </p>
                  <p className={cn("text-xs", goldMode ? "text-white/40" : "text-[#64748b]")}>
                    Haz clic para abrir el planificador y cargar ensaladas en {item.line.code}
                  </p>
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
    </div>
  );
}
