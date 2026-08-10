"use client";

import { useEffect, useState } from "react";
import type { LineOverview } from "@/types/types";
import { getFactoryOverview } from "@/lib/supabase-service";
import { testSupabaseConnection, type SupabaseTestResult } from "@/lib/supabase-test";
import { isSupabaseConfigured } from "@/lib/supabase";
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
  Check
} from "lucide-react";

interface MultiLineDashboardProps {
  onSelectLine: (lineCode: string) => void;
  goldMode: boolean;
}

type ViewMode = "ALL" | "PAIR_01" | "PAIR_23" | "CUSTOM";

export function MultiLineDashboard({ onSelectLine, goldMode }: MultiLineDashboardProps) {
  const [overview, setOverview] = useState<LineOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("ALL");
  const [customSelectedLines, setCustomSelectedLines] = useState<string[]>(["K00", "K01"]);
  const [connectionTest, setConnectionTest] = useState<SupabaseTestResult | null>(null);
  const [isTestingConn, setIsTestingConn] = useState(false);

  const fetchOverview = async () => {
    setLoading(true);
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
    const interval = setInterval(fetchOverview, 4000);
    return () => clearInterval(interval);
  }, []);

  const totalBoxesPlant = overview.reduce((acc, o) => acc + o.totalBoxes, 0);
  const totalCompletedPlant = overview.reduce((acc, o) => acc + o.completedBoxes, 0);
  const activeLinesCount = overview.filter((o) => o.line.isProducing).length;

  // Filtrar líneas según modo de visualización
  const displayedLines = overview.filter((item) => {
    if (viewMode === "ALL") return true;
    if (viewMode === "PAIR_01") return item.line.code === "K00" || item.line.code === "K01";
    if (viewMode === "PAIR_23") return item.line.code === "K02" || item.line.code === "K03";
    if (viewMode === "CUSTOM") return customSelectedLines.includes(item.line.code);
    return true;
  });

  const isDuoView = viewMode === "PAIR_01" || viewMode === "PAIR_23" || (viewMode === "CUSTOM" && displayedLines.length === 2);

  return (
    <div className="space-y-4 max-w-6xl mx-auto px-2 sm:px-4 py-3">
      {/* Cabecera de Fábrica */}
      <div className={cn(
        "rounded-2xl p-4 sm:p-5 border backdrop-blur-xl relative overflow-hidden transition-all shadow-xl",
        goldMode
          ? "bg-[#141006]/90 border-amber-500/30 text-white"
          : "bg-black/40 border-emerald-500/20 text-white"
      )}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border flex items-center gap-1.5",
                goldMode 
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30" 
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              )}>
                <Building2 className="w-3 h-3" />
                <span>Panel de Control de Planta</span>
              </span>

              {/* Indicador de Conexión en Vivo */}
              {connectionTest ? (
                <span className={cn(
                  "text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 transition-all",
                  connectionTest.connected
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                )}>
                  {connectionTest.connected ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span>Supabase Realtime Activo ({connectionTest.latencyMs}ms)</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-amber-400" />
                      <span>Modo Local (Configura .env.local)</span>
                    </>
                  )}
                </span>
              ) : null}
            </div>

            <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2 mt-1">
              <span className={goldMode ? "text-gold-gradient" : "text-white"}>
                Monitor de Envasado Multilínea
              </span>
            </h2>
            <p className="text-xs text-white/50">
              Supervisión de producción en tiempo real para todas las líneas de envasado
            </p>
          </div>

          {/* Resumen rápido de métricas y botón refrescar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-center min-w-[90px]">
              <p className="text-[9px] uppercase font-bold text-white/40 tracking-wider">Líneas Activas</p>
              <p className="text-base sm:text-lg font-black text-emerald-400 tabular-nums">
                {activeLinesCount} <span className="text-xs text-white/40">/ {overview.length || 4}</span>
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-center min-w-[90px]">
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
              className="h-10 px-3 border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 text-xs font-bold shrink-0"
              title="Actualizar datos y probar conexión"
              type="button"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (loading || isTestingConn) && "animate-spin text-emerald-400")} />
              <span className="hidden sm:inline">Refrescar</span>
            </button>
          </div>
        </div>

        {/* Selector de Vistas: Todas vs Parejas de Líneas */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mr-1">
              Vista:
            </span>
            <button
              onClick={() => setViewMode("ALL")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                viewMode === "ALL"
                  ? goldMode ? "bg-amber-500 text-black shadow-md" : "bg-emerald-500 text-white shadow-md"
                  : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
              )}
              type="button"
            >
              Todas (4 Líneas)
            </button>
            <button
              onClick={() => setViewMode("PAIR_01")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                viewMode === "PAIR_01"
                  ? goldMode ? "bg-amber-500 text-black shadow-md" : "bg-emerald-500 text-white shadow-md"
                  : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
              )}
              type="button"
            >
              Pareja K00 & K01
            </button>
            <button
              onClick={() => setViewMode("PAIR_23")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                viewMode === "PAIR_23"
                  ? goldMode ? "bg-amber-500 text-black shadow-md" : "bg-emerald-500 text-white shadow-md"
                  : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
              )}
              type="button"
            >
              Pareja K02 & K03
            </button>
            <button
              onClick={() => setViewMode("CUSTOM")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                viewMode === "CUSTOM"
                  ? goldMode ? "bg-amber-500 text-black shadow-md" : "bg-emerald-500 text-white shadow-md"
                  : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
              )}
              type="button"
            >
              Personalizada
            </button>
          </div>

          {/* Selector de líneas individuales en modo Personalizado */}
          {viewMode === "CUSTOM" && (
            <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl p-1">
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
                      "px-2 py-1 rounded-lg text-xs font-black transition-all cursor-pointer",
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

      {/* Cuadrícula de Líneas (1 columna en móvil, 2 columnas en modo pareja o 4 columnas si pantalla muy ancha) */}
      <div className={cn(
        "grid gap-4",
        isDuoView ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-2"
      )}>
        {displayedLines.map((item) => {
          const isProducing = item.line.isProducing;
          return (
            <div
              key={item.line.id}
              onClick={() => onSelectLine(item.line.code)}
              className={cn(
                "glass-card rounded-2xl p-4 sm:p-5 border transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl cursor-pointer relative overflow-hidden group space-y-3.5",
                goldMode
                  ? "border-amber-500/20 hover:border-amber-500/50 bg-[#120e06]/85"
                  : "border-white/10 hover:border-emerald-500/40 bg-black/40",
                isProducing && "ring-1 ring-emerald-500/25 shadow-lg shadow-emerald-500/5",
                isDuoView && "p-5 sm:p-6"
              )}
            >
              {/* Barra superior de la tarjeta de línea */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-xs font-black px-3 py-1.5 rounded-xl border shadow-sm tracking-wide",
                    goldMode
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-emerald-600 text-white border-emerald-500/40"
                  )}>
                    {item.line.code}
                  </span>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {item.line.name}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border flex items-center gap-1.5",
                    isProducing
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse"
                      : "bg-white/5 text-white/40 border-white/10"
                  )}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", isProducing ? "bg-emerald-400" : "bg-white/30")} />
                    {isProducing ? "Produciendo" : "En Espera"}
                  </span>
                </div>
              </div>

              {/* Contenido de la Orden Actual */}
              {item.currentSaladName ? (
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[9px] uppercase font-black text-white/40 tracking-wider">Orden de Fabricación Actual</p>
                      <h4 className="text-lg sm:text-xl font-black text-white leading-tight mt-0.5">
                        {item.currentSaladName}
                      </h4>
                      <p className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
                        <Package className="w-3.5 h-3.5" />
                        <span>Tipo de Caja: {item.currentBoxType}</span>
                      </p>
                    </div>

                    {item.currentLote && (
                      <span className="text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-1 rounded-lg shrink-0">
                        Lote: {item.currentLote}
                      </span>
                    )}
                  </div>

                  {/* Barra de progreso de la orden */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-white/70">
                        {item.completedBoxes} / {item.totalBoxes} cajas ({item.completedPallets} / {item.totalPallets} palets)
                      </span>
                      <span className="font-mono text-emerald-400 font-black">{item.percent}%</span>
                    </div>
                    <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/10 relative">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Desglose Noblejas si aplica */}
                  {item.noblejasBoxes > 0 && (
                    <div className="flex items-center justify-between text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-xl font-medium">
                      <span className="font-bold">Noblejas:</span>
                      <span className="font-mono font-black">{item.noblejasDoneBoxes} / {item.noblejasBoxes} cajas</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-5 text-center">
                  <p className="text-xs text-white/50 font-medium">Sin órdenes en producción activa</p>
                  <p className="text-[10px] text-white/30 mt-0.5">Haz clic para abrir el planificador y cargar ensaladas</p>
                </div>
              )}

              {/* Pie de tarjeta con botón de acceso */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[10px] text-white/40 font-mono">
                  Cola: {item.queueLength} formatos ({item.pendingCount} pendientes)
                </span>
                <span className="text-emerald-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Abrir Línea</span>
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
