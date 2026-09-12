"use client";

import { useState, useEffect } from "react";
import { useProductionStore } from "@/store/production-store";
import { calculateFormat } from "@/types/types";
import type { QueueItem } from "@/types/types";
import { cn } from "@/lib/utils";
import { Plus, Check, ArrowRight, RotateCcw, Package, Clock } from "lucide-react";

export function ProductionControls() {
  const {
    queue,
    currentQueueIndex,
    currentProgress,
    addPallet,
    removePallet,
    addNobjelasPallet,
    removeNobjelasPallet,
    setPicoCompleted,
    setNobjelasPicoCompleted,
    finishFormat,
    goldMode,
  } = useProductionStore();

  const [nowTick, setNowTick] = useState(() => (typeof window !== "undefined" ? Date.now() : 0));

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const current: QueueItem | undefined = queue[currentQueueIndex];
  if (!current || !currentProgress) return null;

  const calc = calculateFormat({
    id: current.formatId,
    boxType: current.boxType,
    quantity: current.quantity,
    noblejas: current.noblejas,
    boxesPerPallet: current.boxesPerPallet,
  });

  const hasNoblejas = current.noblejas > 0;
  const nobjelasTotalPallets = hasNoblejas
    ? Math.floor(current.noblejas / current.boxesPerPallet)
    : 0;
  const noblejaspalletsDone = currentProgress.noblejasCompletedPallets || 0;
  const nobjelasPicoCajas = hasNoblejas ? current.noblejas % current.boxesPerPallet : 0;
  const hasNobjelasPico = nobjelasPicoCajas > 0;
  const hasPico = calc.pico > 0;

  // === Determinar el Paso Activo en la Secuencia ===
  let controlMode: "noblejas-pallet" | "noblejas-pico" | "milagro-pallet" | "milagro-pico" | "finished" = "finished";

  if (nobjelasTotalPallets > 0 && noblejaspalletsDone < nobjelasTotalPallets) {
    controlMode = "noblejas-pallet";
  } else if (hasNobjelasPico && !currentProgress.nobjelasPicoCompleted) {
    controlMode = "noblejas-pico";
  } else if (currentProgress.completedPallets < calc.pallets) {
    controlMode = "milagro-pallet";
  } else if (hasPico && !currentProgress.picoCompleted) {
    controlMode = "milagro-pico";
  } else {
    controlMode = "finished";
  }

  // === Configuración del CTA Operativo Único ===
  let ctaLabel = "";
  let ctaAction = () => {};
  let ctaStyle = "";
  let ctaIcon = <Plus className="w-5 h-5" />;

  if (controlMode === "noblejas-pallet") {
    ctaLabel = `+ 1 palé Noblejas (${current.boxesPerPallet} cajas)`;
    ctaAction = addNobjelasPallet;
    ctaIcon = <Package className="w-5 h-5" />;
    ctaStyle = goldMode
      ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25 hover:from-purple-400 hover:to-indigo-500"
      : "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/30 border border-purple-500";
  } else if (controlMode === "noblejas-pico") {
    ctaLabel = `Confirmar pico Noblejas · ${nobjelasPicoCajas} cajas`;
    ctaAction = () => setNobjelasPicoCompleted(true);
    ctaIcon = <Check className="w-5 h-5" />;
    ctaStyle = goldMode
      ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/25 hover:from-purple-400 hover:to-indigo-500"
      : "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/30 border border-purple-500";
  } else if (controlMode === "milagro-pallet") {
    ctaLabel = `+ 1 palé Milagro`;
    ctaAction = addPallet;
    ctaIcon = <Package className="w-5 h-5" />;
    ctaStyle = goldMode
      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-orange-400"
      : "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-lg shadow-orange-600/30 border border-orange-500";
  } else if (controlMode === "milagro-pico") {
    ctaLabel = `Confirmar pico Milagro · ${calc.pico} cajas`;
    ctaAction = () => setPicoCompleted(true);
    ctaIcon = <Check className="w-5 h-5" />;
    ctaStyle = goldMode
      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-orange-400"
      : "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-lg shadow-orange-600/30 border border-orange-500";
  } else {
    ctaLabel = queue.length > currentQueueIndex + 1 ? "Completado · Siguiente orden" : "Finalizar formato";
    ctaAction = finishFormat;
    ctaIcon = <ArrowRight className="w-5 h-5" />;
    ctaStyle = goldMode
      ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black shadow-lg shadow-emerald-500/30 hover:from-emerald-400 hover:to-teal-400"
      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 border border-emerald-500";
  }

  // === Acción Deshacer (solo si hay al menos un registro completado) ===
  const hasActionToUndo =
    (currentProgress.completedPallets > 0) ||
    (currentProgress.picoCompleted) ||
    (noblejaspalletsDone > 0) ||
    (currentProgress.nobjelasPicoCompleted);

  const handleUndo = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
    if (hasPico && currentProgress.picoCompleted) {
      setPicoCompleted(false);
    } else if (currentProgress.completedPallets > 0) {
      removePallet();
    } else if (hasNobjelasPico && currentProgress.nobjelasPicoCompleted) {
      setNobjelasPicoCompleted(false);
    } else if (noblejaspalletsDone > 0) {
      removeNobjelasPallet();
    }
  };

  // Texto contextual para el botón deshacer
  let undoDescription = "último palé";
  if (hasPico && currentProgress.picoCompleted) {
    undoDescription = "pico Milagro";
  } else if (currentProgress.completedPallets > 0) {
    undoDescription = "último palé Milagro";
  } else if (hasNobjelasPico && currentProgress.nobjelasPicoCompleted) {
    undoDescription = "pico Noblejas";
  } else if (noblejaspalletsDone > 0) {
    undoDescription = "último palé Noblejas";
  }

  // === Cadencia del Último Palet Registrado ===
  const lastTs = currentProgress.lastPalletTimestamp;
  const lastInterval = currentProgress.lastPalletIntervalMs;

  let timeAgoStr = "";
  let timeFormatted = "";
  if (lastTs) {
    timeFormatted = new Date(lastTs).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const elapsedSec = Math.max(0, Math.floor((nowTick - lastTs) / 1000));
    timeAgoStr = elapsedSec < 60 ? `hace ${elapsedSec}s` : `hace ${Math.floor(elapsedSec / 60)}m`;
  }

  let intervalStr = "";
  if (lastInterval) {
    const totalSec = Math.floor(lastInterval / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    intervalStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  return (
    <div className="space-y-2.5">
      {/* Tracker de cadencia / último palet (compacto) */}
      {lastTs && (
        <div
          className={cn(
            "p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all",
            goldMode
              ? "bg-white/[0.03] border-white/10 text-white/80"
              : "bg-emerald-50/60 border-emerald-200 text-emerald-900"
          )}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-bold">
              Último palet: <strong className="font-mono">{timeFormatted}</strong> ({timeAgoStr})
            </span>
          </div>

          {intervalStr && (
            <span className="text-[11px] font-mono opacity-75 font-semibold">
              Tardó: {intervalStr}
            </span>
          )}
        </div>
      )}

      {/* CTA OPERATIVO ÚNICO PRINCIPAL */}
      <button
        type="button"
        onClick={() => {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
          ctaAction();
        }}
        className={cn(
          "w-full min-h-[56px] sm:min-h-[64px] px-5 py-3 rounded-2xl font-black text-sm sm:text-base transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-3",
          ctaStyle
        )}
        id="main-operational-cta"
      >
        {ctaIcon}
        <span className="tracking-wide">{ctaLabel}</span>
      </button>

      {/* BOTÓN DESHACER (Solo si hay al menos un registro hecho) */}
      {hasActionToUndo && (
        <button
          type="button"
          onClick={handleUndo}
          className={cn(
            "w-full min-h-[44px] px-4 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2",
            goldMode
              ? "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
              : "bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-sm"
          )}
          id="undo-operational-cta"
          title={`Deshacer ${undoDescription}`}
        >
          <RotateCcw className="w-3.5 h-3.5 opacity-70" />
          <span>Deshacer {undoDescription}</span>
        </button>
      )}
    </div>
  );
}
