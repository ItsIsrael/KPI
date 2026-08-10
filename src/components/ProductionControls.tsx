"use client";

import { useState, useEffect } from "react";
import { useProductionStore } from "@/store/production-store";
import { calculateFormat, getSaladsPerBox } from "@/types/types";
import type { QueueItem } from "@/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  const current: QueueItem | undefined = queue[currentQueueIndex];
  if (!current || !currentProgress) return null;

  const calc = calculateFormat({
    id: current.formatId,
    boxType: current.boxType,
    quantity: current.quantity,
    noblejas: current.noblejas,
    boxesPerPallet: current.boxesPerPallet,
  });

  const palletsComplete = currentProgress.completedPallets >= calc.pallets;
  const hasNoblejas = current.noblejas > 0;
  const hasPico = calc.pico > 0;

  // noblejasOk usa noblejasCompleted que se auto-computa en el store
  const noblejasOk = !hasNoblejas || currentProgress.noblejasCompleted;
  const picoOk = !hasPico || currentProgress.picoCompleted;
  // Requiere todo: noblejas + pico + todos los palets
  const canFinalize = noblejasOk && picoOk && palletsComplete && !currentProgress.finished;

  // --- Lógica del Botón Inteligente de Palets ---
  const nobjelasTotalPallets = hasNoblejas
    ? Math.floor(current.noblejas / current.boxesPerPallet)
    : 0;
  const noblejaspalletsDone = currentProgress.noblejasCompletedPallets;
  const nobjelasPicoCajas = hasNoblejas ? current.noblejas % current.boxesPerPallet : 0;
  const hasNobjelasPico = nobjelasPicoCajas > 0;

  // Determinar el bloque activo en la secuencia de producción
  let controlMode: "noblejas-pallet" | "noblejas-pico" | "milagro-pallet" | "milagro-pico" | "none" = "none";

  if (nobjelasTotalPallets > 0 && noblejaspalletsDone < nobjelasTotalPallets) {
    controlMode = "noblejas-pallet";
  } else if (hasNobjelasPico && !currentProgress.nobjelasPicoCompleted) {
    controlMode = "noblejas-pico";
  } else if (currentProgress.completedPallets < calc.pallets) {
    controlMode = "milagro-pallet";
  } else if (hasPico && !currentProgress.picoCompleted) {
    controlMode = "milagro-pico";
  }

  let canAdd = false;
  let canRemove = false;
  let handleAdd = () => {};
  let handleRemove = () => {};
  let buttonLabel = "";
  let undoLabel = "";
  let activeBgClass = "";

  if (controlMode === "noblejas-pallet") {
    canAdd = !currentProgress.finished;
    canRemove = !currentProgress.finished && noblejaspalletsDone > 0;
    handleAdd = addNobjelasPallet;
    handleRemove = removeNobjelasPallet;
    buttonLabel = "Pallet Nob.";
    undoLabel = "Pallet Nob.";
    activeBgClass = goldMode
      ? "bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-300 hover:to-purple-500 text-white shadow-xl shadow-purple-500/30"
      : "bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/30 border border-purple-600";
  } else if (controlMode === "noblejas-pico") {
    canAdd = !currentProgress.finished;
    canRemove = !currentProgress.finished; // descompleta el último palet de noblejas
    handleAdd = () => setNobjelasPicoCompleted(true);
    handleRemove = removeNobjelasPallet;
    buttonLabel = "Pico Nob. ✓";
    undoLabel = "Pallet Nob.";
    activeBgClass = goldMode
      ? "bg-gradient-to-br from-purple-400 to-purple-600 hover:from-purple-300 hover:to-purple-500 text-white shadow-xl shadow-purple-500/30"
      : "bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/30 border border-purple-600";
  } else if (controlMode === "milagro-pallet") {
    canAdd = !currentProgress.finished;
    canRemove = !currentProgress.finished && (
      currentProgress.completedPallets > 0 ||
      (hasNobjelasPico && currentProgress.nobjelasPicoCompleted) ||
      noblejaspalletsDone > 0
    );
    handleAdd = addPallet;
    handleRemove = () => {
      if (currentProgress.completedPallets > 0) {
        removePallet();
      } else if (hasNobjelasPico && currentProgress.nobjelasPicoCompleted) {
        setNobjelasPicoCompleted(false);
      } else if (noblejaspalletsDone > 0) {
        removeNobjelasPallet();
      }
    };
    buttonLabel = "Pallet Mil.";
    undoLabel = currentProgress.completedPallets > 0
      ? "Pallet Mil."
      : hasNobjelasPico && currentProgress.nobjelasPicoCompleted
      ? "Pico Nob."
      : "Pallet Nob.";
    activeBgClass = goldMode
      ? "bg-gradient-to-br from-orange-400 to-orange-600 hover:from-orange-300 hover:to-orange-500 text-white shadow-xl shadow-orange-500/30"
      : "bg-[#ff6600] hover:bg-[#e65c00] text-white shadow-lg shadow-orange-600/30 border-2 border-orange-600";
  } else if (controlMode === "milagro-pico") {
    canAdd = !currentProgress.finished;
    canRemove = !currentProgress.finished;
    handleAdd = () => setPicoCompleted(true);
    handleRemove = () => {
      if (currentProgress.completedPallets > 0) {
        removePallet();
      } else if (hasNobjelasPico && currentProgress.nobjelasPicoCompleted) {
        setNobjelasPicoCompleted(false);
      } else if (noblejaspalletsDone > 0) {
        removeNobjelasPallet();
      }
    };
    buttonLabel = "Pico Mil. ✓";
    undoLabel = currentProgress.completedPallets > 0
      ? "Pallet Mil."
      : hasNobjelasPico && currentProgress.nobjelasPicoCompleted
      ? "Pico Nob."
      : "Pallet Nob.";
    activeBgClass = goldMode
      ? "bg-gradient-to-br from-orange-400 to-orange-600 hover:from-orange-300 hover:to-orange-500 text-white shadow-xl shadow-orange-500/30"
      : "bg-[#ff6600] hover:bg-[#e65c00] text-white shadow-lg shadow-orange-600/30 border-2 border-orange-600";
  } else {
    canAdd = false;
    canRemove = !currentProgress.finished && (
      currentProgress.picoCompleted ||
      currentProgress.completedPallets > 0 ||
      (hasNobjelasPico && currentProgress.nobjelasPicoCompleted) ||
      noblejaspalletsDone > 0
    );
    handleRemove = () => {
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
    buttonLabel = "Formato Listo";
    undoLabel = hasPico && currentProgress.picoCompleted
      ? "Pico Mil."
      : currentProgress.completedPallets > 0
      ? "Pallet Mil."
      : hasNobjelasPico && currentProgress.nobjelasPicoCompleted
      ? "Pico Nob."
      : "Pallet Nob.";
    activeBgClass = goldMode
      ? "bg-white/5 border border-white/10 text-white/20"
      : "bg-slate-100 border border-slate-300 text-slate-400";
  }

  // Mensaje de advertencia
  const missingItems: string[] = [];
  if (!noblejasOk) missingItems.push("Noblejas");
  if (!picoOk) missingItems.push("Pico");
  if (!palletsComplete) missingItems.push(`Palets (${currentProgress.completedPallets}/${calc.pallets})`);

  // --- Lógica de Memoria / Tracker de Último Palet ---
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const lastTs = currentProgress.lastPalletTimestamp;
  const lastInterval = currentProgress.lastPalletIntervalMs;

  let timeAgoStr = "";
  let timeFormatted = "";
  let elapsedSec = 0;
  let isRecentClick = false;

  if (lastTs) {
    timeFormatted = new Date(lastTs).toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    elapsedSec = Math.max(0, Math.floor((nowTick - lastTs) / 1000));
    if (elapsedSec < 60) {
      timeAgoStr = `hace ${elapsedSec}s`;
    } else {
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      timeAgoStr = `hace ${mins}m ${secs}s`;
    }
    isRecentClick = elapsedSec <= 6;
  }

  let intervalStr = "";
  if (lastInterval) {
    const totalSec = Math.floor(lastInterval / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    intervalStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  return (
    <div className="space-y-2">
      {/* Tarjeta de Confirmación y Memoria del Último Palet */}
      {lastTs && !goldMode && (
        <div
          className={cn(
            "rounded-xl p-2.5 transition-all duration-300 border flex items-center justify-between text-xs gap-2 select-none",
            isRecentClick
              ? goldMode
                ? "bg-emerald-500/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse"
                : "bg-emerald-100 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] animate-pulse"
              : goldMode
                ? "bg-white/5 border-white/10 backdrop-blur-md"
                : "bg-emerald-50 border-emerald-200"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isRecentClick && <span className="text-base shrink-0">✅</span>}
            <div className="min-w-0">
              <p className={cn("font-bold truncate leading-tight flex items-center gap-1.5", goldMode ? "text-white" : "text-emerald-900")}>
                <span>Último palet: <strong className={cn("font-mono", goldMode ? "text-emerald-400" : "text-emerald-600")}>{timeFormatted}</strong></span>
                <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-mono font-bold border", goldMode ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-emerald-200 text-emerald-800 border-emerald-300")}>
                  {timeAgoStr}
                </span>
              </p>
              {intervalStr ? (
                <p className={cn("text-[10px] truncate mt-0.5", goldMode ? "text-white/50" : "text-emerald-700/70")}>
                  El palet anterior tardó <span className={cn("font-mono font-bold", goldMode ? "text-white/80" : "text-emerald-900")}>{intervalStr}</span>
                </p>
              ) : (
                <p className={cn("text-[10px] truncate mt-0.5", goldMode ? "text-white/40" : "text-emerald-700/60")}>
                  Palet registrado correctamente
                </p>
              )}
            </div>
          </div>

          {/* Botón rápido Deshacer si fue hace menos de 5 segundos */}
          {isRecentClick && canRemove && (
            <button
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
                handleRemove();
              }}
              className={cn("text-[10px] font-black uppercase tracking-wider border px-2 py-1 rounded-lg transition-all shrink-0 cursor-pointer active:scale-95", goldMode ? "bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30" : "bg-red-100 border-red-300 text-red-600 hover:bg-red-200")}
              type="button"
            >
              ↩ Deshacer
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 items-center">
        {/* +1 ACCION */}
        <Button
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(30);
            handleAdd();
          }}
          disabled={!canAdd}
          className={cn(
            "col-span-2 h-16 md:h-20 text-xl md:text-2xl font-black rounded-2xl transition-all duration-150 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex flex-col justify-center items-center relative overflow-hidden",
            canAdd
              ? activeBgClass
              : goldMode ? "bg-white/5 border border-white/10 text-white/20" : "bg-slate-100 border border-slate-300 text-slate-400"
          )}
          id="add-pallet-btn"
        >
          {/* Flash Effect on Recent Click */}
          {isRecentClick && canAdd && (
            <span className={cn("absolute inset-0 animate-ping opacity-20", goldMode ? "bg-emerald-400" : "bg-emerald-600")} />
          )}
          <span className="flex flex-col items-center gap-0 z-10">
            {controlMode.includes("pico") ? (
              <span className="text-2xl md:text-3xl font-extrabold">{buttonLabel}</span>
            ) : (
              <>
                <span className="text-2xl md:text-3xl font-extrabold leading-none pt-1">+1</span>
                <span className="text-[9px] uppercase tracking-wider font-bold mb-0.5">{buttonLabel}</span>
              </>
            )}
            
            {/* Inject the Time Ago String Directly Inside the Button if it exists and we can add more */}
            {canAdd && lastTs && !controlMode.includes("pico") && goldMode && (
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider mt-0.5 bg-black/20 text-white/80">
                ({timeAgoStr})
              </span>
            )}
          </span>
        </Button>

        {/* -1 ACCION */}
        <Button
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
            handleRemove();
          }}
          disabled={!canRemove}
          variant="outline"
          className={cn(
            "h-16 md:h-20 text-xl md:text-2xl font-black rounded-2xl transition-all duration-150 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed",
            goldMode
              ? "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800",
            canRemove && (controlMode.includes("noblejas") || undoLabel.includes("Nob"))
              ? goldMode ? "border-purple-500/30 text-purple-400 hover:bg-purple-500/10" : "border-purple-300 text-purple-600 bg-purple-50 hover:bg-purple-100"
              : "",
            canRemove && (controlMode.includes("milagro") || undoLabel.includes("Mil"))
              ? goldMode ? "border-orange-500/30 text-orange-400 hover:bg-orange-500/10" : "border-orange-300 text-orange-600 bg-orange-50 hover:bg-orange-100"
              : ""
          )}
          id="remove-pallet-btn"
        >
          <span className="flex flex-col items-center gap-0 text-center">
            <span>−1</span>
            <span className="text-[8px] uppercase tracking-wider opacity-60 font-semibold line-clamp-1">{undoLabel}</span>
          </span>
        </Button>
      </div>

      {/* Advertencia */}
      {missingItems.length > 0 && !currentProgress.finished && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
          <p className="text-amber-400 text-xs font-semibold">
            ⚠️ Completa: {missingItems.join(", ")}
          </p>
        </div>
      )}

      {/* Finalizar formato — Solo visible si declinó la transición automática y está listo */}
      {canFinalize && currentProgress.declinedAutoAdvance && (
        <Button
          onClick={finishFormat}
          className="w-full h-14 md:h-16 text-lg md:text-xl font-black rounded-2xl transition-all duration-150 active:scale-95 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/30 animate-pulse"
          id="finish-format-btn"
        >
          FINALIZAR FORMATO
        </Button>
      )}
    </div>
  );
}
