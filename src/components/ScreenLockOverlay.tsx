"use client";

import { useState, useRef, useEffect } from "react";
import { useProductionStore } from "@/store/production-store";
import { calculateFormat, getSaladsPerBox, getTodayLabelColor } from "@/types/types";
import { Lock, Unlock, ShieldAlert, Sparkles, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScreenLockOverlay() {
  const {
    isScreenLocked,
    toggleScreenLock,
    goldMode,
    queue,
    currentQueueIndex,
    currentProgress,
    customDayLabelIndex,
  } = useProductionStore();

  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isScreenLocked) return null;

  const current = queue[currentQueueIndex];
  const calc = current
    ? calculateFormat({
        id: current.formatId,
        boxType: current.boxType,
        quantity: current.quantity,
        noblejas: current.noblejas,
        boxesPerPallet: current.boxesPerPallet,
      })
    : { production: 0, pallets: 0, pico: 0 };

  const todayLabel = getTodayLabelColor(customDayLabelIndex);

  const completedPallets = currentProgress ? currentProgress.completedPallets : 0;
  const boxesAdjustment = currentProgress?.boxesAdjustment || 0;
  const totalBoxesDone = currentProgress && current
    ? completedPallets * current.boxesPerPallet + (currentProgress.picoCompleted ? calc.pico : 0) + boxesAdjustment
    : 0;

  const totalPalletsTarget = calc.pallets + (calc.pico > 0 ? 1 : 0);

  let timeAgoStr = "";
  const lastTs = currentProgress?.lastPalletTimestamp;
  if (lastTs) {
    const elapsedSec = Math.max(0, Math.floor((nowTick - lastTs) / 1000));
    if (elapsedSec < 60) {
      timeAgoStr = `hace ${elapsedSec}s`;
    } else {
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      timeAgoStr = `hace ${mins}m ${secs}s`;
    }
  }

  const startHold = () => {
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    let pct = 0;
    holdIntervalRef.current = setInterval(() => {
      pct += 10;
      setHoldProgress(pct);
      if (pct >= 100) {
        clearInterval(holdIntervalRef.current!);
        holdIntervalRef.current = null;
        setHoldProgress(0);
        toggleScreenLock();
      }
    }, 100);
  };

  const stopHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  };

  return (
    <div className={cn("fixed inset-0 z-[300] backdrop-blur-3xl flex flex-col justify-between p-6 overflow-hidden select-none animate-fade-in", goldMode ? "bg-black/92" : "bg-emerald-50/95")}>
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={cn(
            "absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full blur-[140px] opacity-40 animate-pulse",
            goldMode ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ animationDuration: "6s" }}
        />
        <div
          className={cn(
            "absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full blur-[140px] opacity-30 animate-pulse",
            goldMode ? "bg-orange-500" : "bg-teal-500"
          )}
          style={{ animationDuration: "8s" }}
        />
      </div>

      {/* Lock Banner Top */}
      <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-2xl flex items-center justify-center border shadow-lg",
            goldMode
              ? "bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-amber-500/10"
              : "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 shadow-emerald-500/10"
          )}>
            <Lock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={cn("text-base font-black uppercase tracking-wider", goldMode ? "text-white" : "text-emerald-900")}>
                PANEL BLOQUEADO
              </h2>
              {goldMode && (
                <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded tracking-wide uppercase shrink-0">
                  👑 GOLD GLOVE-LOCK
                </span>
              )}
            </div>
            <p className={cn("text-xs", goldMode ? "text-white/40" : "text-emerald-700/60")}>
              Protección contra toques accidentales en planta
            </p>
          </div>
        </div>

        {/* Day label status */}
        <div className={cn(
          "px-3 py-1.5 rounded-xl text-xs font-black border uppercase flex items-center gap-2 shadow-md",
          todayLabel.bgClass,
          todayLabel.textClass,
          todayLabel.borderClass
        )}>
          <span className="opacity-75">Etiqueta:</span>
          <span>{todayLabel.colorName}</span>
        </div>
      </div>

      {/* Main KPI Status Center */}
      <div className="relative z-10 max-w-xl mx-auto w-full my-auto space-y-6 text-center">
        {current ? (
          <>
            <div className="space-y-2">
              <div className={cn("inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold", goldMode ? "bg-white/5 border border-white/10 text-white/70" : "bg-emerald-100 border border-emerald-300 text-emerald-800")}>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>FORMATO EN PRODUCCIÓN ({currentQueueIndex + 1}/{queue.length})</span>
              </div>
              <h1 className={cn(
                "text-3xl md:text-5xl font-black tracking-tight uppercase",
                goldMode ? "text-white text-gold-gradient" : "text-emerald-900"
              )}>
                {current.saladName}
              </h1>
              <p className={cn("text-base md:text-xl font-bold", goldMode ? "text-emerald-400" : "text-emerald-700")}>
                📦 {current.boxType} · {current.boxesPerPallet} cajas/palet
              </p>
            </div>

            {/* Huge Digits Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className={cn(
                "glass-card p-6 rounded-3xl border text-center relative overflow-hidden",
                goldMode ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-200 bg-white"
              )}>
                <p className={cn("text-xs font-bold uppercase tracking-widest mb-1", goldMode ? "text-white/40" : "text-emerald-700/50")}>
                  Palets Completados
                </p>
                <div className={cn("text-5xl md:text-6xl font-black tracking-tight", goldMode ? "text-white" : "text-emerald-900")}>
                  <span className={cn(goldMode ? "text-amber-400" : "text-emerald-600")}>
                    {completedPallets}
                  </span>
                  <span className={cn("text-3xl md:text-4xl", goldMode ? "text-white/30" : "text-emerald-700/40")}>/{calc.pallets}</span>
                </div>
                {lastTs && (
                  <p className={cn("text-[11px] uppercase font-bold mt-2 py-0.5 px-2 inline-block rounded-full border", goldMode ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "bg-emerald-100 text-emerald-800 border-emerald-300")}>
                    Último: {timeAgoStr}
                  </p>
                )}
                {calc.pico > 0 && (
                  <p className={cn("text-xs font-semibold mt-2", goldMode ? "text-white/50" : "text-emerald-700/60")}>
                    + Pico de {calc.pico} cajas {currentProgress?.picoCompleted ? "✅" : "⏳"}
                  </p>
                )}
              </div>

              <div className={cn(
                "glass-card p-6 rounded-3xl border text-center relative overflow-hidden",
                goldMode ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-200 bg-white"
              )}>
                <p className={cn("text-xs font-bold uppercase tracking-widest mb-1", goldMode ? "text-white/40" : "text-emerald-700/50")}>
                  Cajas Totales
                </p>
                <div className={cn("text-5xl md:text-6xl font-black tracking-tight", goldMode ? "text-white" : "text-emerald-900")}>
                  <span className={cn(goldMode ? "text-amber-300" : "text-teal-600")}>
                    {totalBoxesDone}
                  </span>
                  <span className={cn("text-3xl md:text-4xl", goldMode ? "text-white/30" : "text-emerald-700/40")}>/{calc.production}</span>
                </div>
                {boxesAdjustment !== 0 && (
                  <p className={cn("text-xs font-bold mt-2", goldMode ? "text-amber-400" : "text-emerald-600")}>
                    Ajuste Express: {boxesAdjustment > 0 ? `+${boxesAdjustment}` : boxesAdjustment} cajas
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className={cn("text-lg font-bold", goldMode ? "text-white/50" : "text-emerald-700/60")}>
            No hay producción activa en la cola.
          </div>
        )}
      </div>

      {/* Bottom Hold to Unlock Action */}
      <div className="relative z-10 max-w-md mx-auto w-full pt-4 pb-2 text-center space-y-3">
        <button
          onMouseDown={startHold}
          onMouseUp={stopHold}
          onMouseLeave={stopHold}
          onTouchStart={startHold}
          onTouchEnd={stopHold}
          className={cn(
            "relative w-full h-16 rounded-2xl font-black text-base tracking-wider border shadow-2xl flex items-center justify-center gap-3 overflow-hidden cursor-pointer select-none active:scale-[0.98] transition-all",
            goldMode
              ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-black border-amber-400 shadow-amber-500/25"
              : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-emerald-400 shadow-emerald-500/25"
          )}
          type="button"
        >
          {/* Progress fill visual */}
          <div
            className="absolute inset-0 bg-white/30 transition-all ease-linear"
            style={{ width: `${holdProgress}%` }}
          />

          <span className="relative z-10 flex items-center gap-2 uppercase">
            <Unlock className="w-5 h-5" />
            <span>MANTÉN PULSADO PARA DESBLOQUEAR</span>
          </span>
        </button>

        <p className={cn("text-[11px] font-medium", goldMode ? "text-white/35" : "text-emerald-700/60")}>
          Mantén presionado 1 segundo para desactivar el bloqueo táctil de planta.
        </p>
      </div>
    </div>
  );
}
