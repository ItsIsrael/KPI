"use client";

import { useEffect, useState } from "react";
import type { LineOverview } from "@/types/types";
import { getFactoryOverview } from "@/lib/supabase-service";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Play, Pause, ArrowRight, RefreshCw, Layers, Sparkles, CheckCircle2, Clock } from "lucide-react";

interface MultiLineDashboardProps {
  onSelectLine: (lineCode: string) => void;
  goldMode: boolean;
}

export function MultiLineDashboard({ onSelectLine, goldMode }: MultiLineDashboardProps) {
  const [overview, setOverview] = useState<LineOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const data = await getFactoryOverview();
      setOverview(data);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 5000); // Polling suave como respaldo a WebSockets
    return () => clearInterval(interval);
  }, []);

  const totalBoxesPlant = overview.reduce((acc, o) => acc + o.totalBoxes, 0);
  const totalCompletedPlant = overview.reduce((acc, o) => acc + o.completedBoxes, 0);
  const activeLinesCount = overview.filter((o) => o.line.isProducing).length;

  return (
    <div className="space-y-4 max-w-6xl mx-auto px-2 sm:px-4 py-3">
      {/* Cabecera de Fábrica */}
      <div className={cn(
        "rounded-2xl p-4 sm:p-5 border backdrop-blur-xl relative overflow-hidden transition-all shadow-xl",
        goldMode
          ? "bg-[#141006]/90 border-amber-500/30 text-white"
          : "bg-black/40 border-emerald-500/20 text-white"
      )}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                goldMode 
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30" 
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              )}>
                🏢 Vista General de Planta
              </span>
              {!isSupabaseConfigured && (
                <span className="text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  ⚠️ Modo Local (Configura Supabase para Multi-PC)
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-black mt-1 tracking-tight flex items-center gap-2">
              <span className={goldMode ? "text-gold-gradient" : "text-white"}>
                Monitor Multilínea en Tiempo Real
              </span>
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              Estado de envasado en simultáneo para todas las líneas de producción
            </p>
          </div>

          {/* Resumen rápido de planta */}
          <div className="flex items-center gap-3">
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-[9px] uppercase font-bold text-white/40 tracking-wider">Líneas Activas</p>
              <p className="text-lg font-black text-emerald-400 tabular-nums">
                {activeLinesCount} <span className="text-xs text-white/40">/ {overview.length || 4}</span>
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-[9px] uppercase font-bold text-white/40 tracking-wider">Cajas en Planta</p>
              <p className="text-lg font-black text-white tabular-nums">
                {totalCompletedPlant} <span className="text-xs text-white/40">/ {totalBoxesPlant}</span>
              </p>
            </div>
            <button
              onClick={fetchOverview}
              disabled={loading}
              className="h-10 w-10 border border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0"
              title="Actualizar datos de planta"
              type="button"
            >
              <RefreshCw className={cn("w-4 h-4 text-white/70", loading && "animate-spin text-emerald-400")} />
            </button>
          </div>
        </div>
      </div>

      {/* Cuadrícula de las 4 Líneas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {overview.map((item) => {
          const isProducing = item.line.isProducing;
          return (
            <div
              key={item.line.id}
              onClick={() => onSelectLine(item.line.code)}
              className={cn(
                "glass-card rounded-2xl p-4 sm:p-5 border transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl cursor-pointer relative overflow-hidden group space-y-3",
                goldMode
                  ? "border-amber-500/20 hover:border-amber-500/50 bg-[#120e06]/75"
                  : "border-white/10 hover:border-emerald-500/40 bg-black/40",
                isProducing && "ring-1 ring-emerald-500/20"
              )}
            >
              {/* Barra superior de la tarjeta de línea */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={cn(
                    "text-xs font-black px-2.5 py-1 rounded-xl border shadow-sm",
                    goldMode
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : "bg-emerald-600 text-white border-emerald-500/40"
                  )}>
                    {item.line.code}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {item.line.name}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1",
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
                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[9px] uppercase font-black text-white/40 tracking-wider">OF Actual</p>
                      <h4 className="text-base sm:text-lg font-black text-white leading-tight">
                        {item.currentSaladName}
                      </h4>
                      <p className="text-xs font-bold text-emerald-400 mt-0.5">
                        📦 {item.currentBoxType}
                      </p>
                    </div>

                    {item.currentLote && (
                      <span className="text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-lg shrink-0">
                        Lote: {item.currentLote}
                      </span>
                    )}
                  </div>

                  {/* Barra de progreso de la orden */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-white/60">
                        {item.completedBoxes} / {item.totalBoxes} cajas ({item.completedPallets} / {item.totalPallets} palets)
                      </span>
                      <span className="font-mono text-emerald-400">{item.percent}%</span>
                    </div>
                    <div className="h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Desglose Noblejas si aplica */}
                  {item.noblejasBoxes > 0 && (
                    <div className="flex items-center justify-between text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
                      <span className="font-bold">🟣 Noblejas:</span>
                      <span className="font-mono font-black">{item.noblejasDoneBoxes} / {item.noblejasBoxes} cajas</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-4 text-center">
                  <p className="text-xs text-white/40 font-medium">No hay órdenes en producción activa</p>
                  <p className="text-[10px] text-white/20 mt-0.5">Haz clic para planificar la cola de esta línea</p>
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
