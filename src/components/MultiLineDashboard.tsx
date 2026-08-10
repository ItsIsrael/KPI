"use client";

import { useEffect, useState } from "react";
import type { LineOverview } from "@/types/types";
import { getFactoryOverview, syncProgress, syncLineState } from "@/lib/supabase-service";
import { testSupabaseConnection, type SupabaseTestResult } from "@/lib/supabase-test";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useProductionStore } from "@/store/production-store";
import { cn } from "@/lib/utils";
import { 
  Building2, 
  Layers, 
  Activity, 
  CheckCircle2, 
  Package, 
  Clock, 
  ArrowRight, 
  RefreshCw, 
  SlidersHorizontal,
  Wifi,
  WifiOff,
  AlertCircle,
  Play,
  Pause,
  Plus,
  Minus,
  Check,
  ChevronRight,
  TrendingUp,
  Boxes
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
      setOverview(data);
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

  // Quick Action: Añadir Palet Milagro directamente desde el Dashboard
  const handleQuickAddMilagroPallet = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.currentItem || !item.calc) return;
    const prog: import("@/types/types").FormatProgress = item.progress || {
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
    const updatedProg: import("@/types/types").FormatProgress = {
      ...prog,
      completedPallets: nextPallets,
      finished: isFinished,
    };

    // Actualización optimista inmediata en UI
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

    await syncProgress(item.currentItem.id, updatedProg);
    setActionLoadingId(null);
  };

  // Quick Action: Añadir Palet Noblejas directamente desde el Dashboard
  const handleQuickAddNoblejasPallet = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.currentItem) return;
    const prog: import("@/types/types").FormatProgress = item.progress || {
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
    const updatedProg: import("@/types/types").FormatProgress = {
      ...prog,
      noblejasCompletedPallets: nextNobPallets,
    };

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

    await syncProgress(item.currentItem.id, updatedProg);
    setActionLoadingId(null);
  };

  // Quick Action: Alternar Producción / Pausa de la Línea
  const handleToggleLineProducing = async (item: LineOverview, e: React.MouseEvent) => {
    e.stopPropagation();
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
  const activeLinesCount = overview.filter((o) => o.line.isProducing).length;

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
        "rounded-3xl p-4 sm:p-6 border backdrop-blur-2xl relative overflow-hidden transition-all shadow-2xl",
        goldMode
          ? "bg-[#141006]/95 border-amber-500/30 text-white"
          : "bg-black/60 border-white/10 text-white"
      )}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-sm",
                goldMode 
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40" 
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
              )}>
                <Building2 className="w-3.5 h-3.5" />
                <span>Sala de Control y Monitorización Dual</span>
              </span>

              {/* Indicador de Supabase Realtime */}
              {connectionTest && (
                <span className={cn(
                  "text-[10px] font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 transition-all shadow-sm",
                  connectionTest.connected
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                )}>
                  {connectionTest.connected ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>Supabase Realtime Conectado ({connectionTest.latencyMs}ms)</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>Modo Local</span>
                    </>
                  )}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight flex items-center gap-2 mt-0.5">
              <span className={goldMode ? "text-gold-gradient" : "text-white"}>
                {viewMode === "PAIR_01" ? "Supervisión de Líneas K00 & K01" : viewMode === "PAIR_23" ? "Supervisión de Líneas K02 & K03" : "Monitor Multilínea en Tiempo Real"}
              </span>
            </h2>
            <p className="text-xs text-white/50">
              Control simultáneo, avance de palets y seguimiento de lotes en directo
            </p>
          </div>

          {/* Métricas consolidadas de planta */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2 text-center min-w-[95px]">
              <p className="text-[9px] uppercase font-bold text-white/40 tracking-wider">Líneas Activas</p>
              <p className="text-base sm:text-lg font-black text-emerald-400 tabular-nums">
                {activeLinesCount} <span className="text-xs text-white/40">/ {overview.length || 4}</span>
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2 text-center min-w-[110px]">
              <p className="text-[9px] uppercase font-bold text-white/40 tracking-wider">Cajas en Planta</p>
              <p className="text-base sm:text-lg font-black text-white tabular-nums">
                {totalCompletedPlant} <span className="text-xs text-white/40">/ {totalBoxesPlant}</span>
              </p>
            </div>
            <button
              onClick={() => {
                fetchOverview();
                handleTestConnection();
              }}
              disabled={loading || isTestingConn}
              className="h-11 px-3.5 border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-2xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 text-xs font-bold shrink-0"
              title="Refrescar datos en vivo"
              type="button"
            >
              <RefreshCw className={cn("w-4 h-4", (loading || isTestingConn) && "animate-spin text-emerald-400")} />
              <span className="hidden sm:inline">Refrescar</span>
            </button>
          </div>
        </div>

        {/* Barra de Filtros: Parejas vs Todas */}
        <div className="mt-5 pt-3.5 border-t border-white/10 flex items-center justify-between flex-wrap gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mr-1">
              Modo de Visualización:
            </span>
            <button
              onClick={() => setViewMode("PAIR_01")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm",
                viewMode === "PAIR_01"
                  ? goldMode ? "bg-amber-500 text-black font-black" : "bg-emerald-500 text-white font-black"
                  : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
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
                  ? goldMode ? "bg-amber-500 text-black font-black" : "bg-emerald-500 text-white font-black"
                  : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
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
                  ? goldMode ? "bg-amber-500 text-black font-black" : "bg-emerald-500 text-white font-black"
                  : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
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
                  ? goldMode ? "bg-amber-500 text-black font-black" : "bg-emerald-500 text-white font-black"
                  : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
              )}
              type="button"
            >
              Personalizada
            </button>
          </div>

          {viewMode === "CUSTOM" && (
            <div className="flex items-center gap-1.5 bg-black/50 border border-white/10 rounded-xl p-1">
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
                        ? "bg-white/20 text-white border border-white/30"
                        : "text-white/30 hover:text-white hover:bg-white/5"
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
          const isProducing = item.line.isProducing;
          const currentItem = item.currentItem;
          const calc = item.calc;
          const prog = item.progress || {
            completedPallets: 0,
            picoCompleted: false,
            noblejasCompletedPallets: 0,
            nobjelasPicoCompleted: false,
            boxesAdjustment: 0,
          };
          const totalMilagroPallets = calc ? calc.pallets : item.totalPallets;
          const maxNobPallets = currentItem ? Math.floor(item.noblejasBoxes / currentItem.boxesPerPallet) : 0;

          return (
            <div
              key={item.line.id}
              onClick={() => onSelectLine(item.line.code)}
              className={cn(
                "glass-card rounded-3xl p-5 sm:p-6 border transition-all duration-300 hover:shadow-2xl cursor-pointer relative overflow-hidden group space-y-4",
                goldMode
                  ? "border-amber-500/25 hover:border-amber-500/50 bg-[#120e06]/90"
                  : "border-white/10 hover:border-emerald-500/40 bg-black/50",
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
                    <h3 className="text-base sm:text-lg font-black text-white group-hover:text-emerald-400 transition-colors">
                      Línea {item.line.code}
                    </h3>
                    <p className="text-[11px] text-white/40 font-mono">
                      {item.queueLength} formatos ({item.pendingCount} en cola)
                    </p>
                  </div>
                </div>

                {/* Botón Play/Pausa de la Línea */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleToggleLineProducing(item, e)}
                    className={cn(
                      "h-8 px-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95",
                      isProducing
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                        : "bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10"
                    )}
                    title={isProducing ? "Pausar línea" : "Iniciar producción"}
                    type="button"
                  >
                    {isProducing ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>En Marcha</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3 text-white/40" />
                        <span>En Espera</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Contenido de la Orden Actual */}
              {item.currentSaladName ? (
                <div className="space-y-4">
                  {/* Fila principal del producto */}
                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[9px] uppercase font-black text-white/40 tracking-wider">Orden de Fabricación Actual</p>
                        <h4 className="text-xl sm:text-2xl font-black text-white leading-tight mt-0.5">
                          {item.currentSaladName}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                            <Package className="w-3.5 h-3.5" />
                            <span>{item.currentBoxType}</span>
                          </span>
                          <span className="text-white/20">|</span>
                          <span className="text-xs text-white/70 font-mono font-bold">
                            {item.totalBoxes} cajas totales
                          </span>
                        </div>
                      </div>

                      {item.currentLote && (
                        <div className="text-right">
                          <span className="text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/35 px-2.5 py-1 rounded-xl block">
                            Lote: {item.currentLote}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Barra de progreso global con porcentaje */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-white/80">
                          {item.completedBoxes} de {item.totalBoxes} cajas ({item.completedPallets} / {item.totalPallets} palets)
                        </span>
                        <span className="font-mono text-emerald-400 font-black text-sm">{item.percent}%</span>
                      </div>
                      <div className="h-3.5 bg-white/5 rounded-full overflow-hidden border border-white/10 relative">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Matriz Visual de Palets en Vivo (En Modo Dúo) */}
                    {isDuoView && totalMilagroPallets > 0 && (
                      <div className="pt-2 border-t border-white/5 space-y-1.5">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">
                          Matriz de Palets Milagro ({prog.completedPallets}/{totalMilagroPallets})
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
                                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                                    : isCurrent
                                    ? "bg-emerald-500/5 border-emerald-400 border-dashed text-emerald-400 animate-pulse font-black"
                                    : "bg-white/[0.02] border-white/5 text-white/25"
                                )}
                              >
                                {isDone ? `P${pIdx + 1} OK` : `P${pIdx + 1}`}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Desglose y Matriz de Noblejas si aplica */}
                    {item.noblejasBoxes > 0 && (
                      <div className="pt-2 border-t border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-purple-300">
                          <span className="font-black uppercase tracking-wider text-[10px]">
                            Noblejas ({item.noblejasDoneBoxes}/{item.noblejasBoxes} cajas)
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
                                      ? "bg-purple-500/25 border-purple-500/50 text-purple-200 font-black"
                                      : "bg-purple-500/5 border-purple-500/20 text-purple-400/40"
                                  )}
                                >
                                  {isDone ? `Nob${nIdx + 1} OK` : `Nob${nIdx + 1}`}
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
                        className="h-10 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Marcar +1 Palet Milagro completado"
                        type="button"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+1 Palet Milagro</span>
                      </button>

                      {item.noblejasBoxes > 0 ? (
                        <button
                          onClick={(e) => handleQuickAddNoblejasPallet(item, e)}
                          disabled={actionLoadingId === `${item.line.id}-nob` || prog.noblejasCompletedPallets >= maxNobPallets}
                          className="h-10 px-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Marcar +1 Palet Noblejas completado"
                          type="button"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+1 Palet Nob</span>
                        </button>
                      ) : (
                        <div className="h-10 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center text-[10px] text-white/30 font-medium">
                          Sin Noblejas
                        </div>
                      )}

                      <button
                        onClick={() => onSelectLine(item.line.code)}
                        className="h-10 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer col-span-2 sm:col-span-1"
                        type="button"
                      >
                        <span>Abrir Panel</span>
                        <ChevronRight className="w-3.5 h-3.5 text-white/60" />
                      </button>
                    </div>
                  )}

                  {/* Siguiente Orden en Cola si existe */}
                  {item.nextItem && isDuoView && (
                    <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase text-white/40 tracking-wider">A continuación:</span>
                        <span className="font-bold text-white/80">{item.nextItem.saladName}</span>
                        <span className="text-white/40">· {item.nextItem.boxType}</span>
                      </div>
                      <span className="text-emerald-400 font-mono font-bold">{item.nextItem.quantity} cajas</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-8 text-center space-y-2">
                  <p className="text-sm text-white/60 font-bold">Línea sin órdenes activas</p>
                  <p className="text-xs text-white/40">Haz clic para abrir el planificador y cargar ensaladas en {item.line.code}</p>
                </div>
              )}

              {/* Pie de Tarjeta */}
              <div className="flex items-center justify-between pt-1 text-xs border-t border-white/5">
                <span className="text-[11px] text-white/40 font-mono">
                  Sincronizado vía WebSockets en vivo
                </span>
                <span className="text-emerald-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
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
