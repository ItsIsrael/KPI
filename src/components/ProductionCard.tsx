"use client";

import { useState, useEffect, useRef } from "react";
import { useProductionStore } from "@/store/production-store";
import { calculateFormat, getSaladsPerBox, getActiveLote } from "@/types/types";
import type { QueueItem } from "@/types/types";
import { cn } from "@/lib/utils";

export function ProductionCard() {
  const {
    queue,
    currentQueueIndex,
    currentProgress,
    setPicoCompleted,
    addPallet,
    removePallet,
    addNobjelasPallet,
    removeNobjelasPallet,
    setNobjelasPicoCompleted,
    setEditingQueueItemId,
    palletSpeeds,
    goldMode,
    adjustBoxesDelta,
  } = useProductionStore();

  const [showInfoPopover, setShowInfoPopover] = useState(false);

  const current: QueueItem | undefined = queue[currentQueueIndex];

  const calc = current ? calculateFormat({
    id: current.formatId,
    boxType: current.boxType,
    quantity: current.quantity,
    noblejas: current.noblejas,
    boxesPerPallet: current.boxesPerPallet,
  }) : { production: 0, pallets: 0, pico: 0, noblejasPallets: 0, noblejasPico: 0 };

  const saladsPerBox = current ? getSaladsPerBox(current.boxType) : 0;

  // === Desglose de Noblejas ===
  const hasNoblejas = current ? current.noblejas > 0 : false;
  const nobjelasTotalPallets = hasNoblejas && current
    ? Math.floor(current.noblejas / current.boxesPerPallet)
    : 0;
  const nobjelasPicoCajas = hasNoblejas && current
    ? current.noblejas % current.boxesPerPallet
    : 0;
  const hasNobjelasPico = nobjelasPicoCajas > 0;

  // Progreso noblejas
  const noblejaspalletsDone = currentProgress ? currentProgress.noblejasCompletedPallets : 0;
  const nobjelasPalletsComplete = noblejaspalletsDone >= nobjelasTotalPallets;
  const nobjelasPicoOk =
    !hasNobjelasPico || (currentProgress ? currentProgress.nobjelasPicoCompleted : false);
  const noblejasFullyDone = nobjelasPalletsComplete && nobjelasPicoOk;

  const hasPico = calc.pico > 0;

  // === PROGRESO GLOBAL ===
  const totalSteps =
    (hasNoblejas ? nobjelasTotalPallets + (hasNobjelasPico ? 1 : 0) : 0) +
    (hasPico ? 1 : 0) +
    calc.pallets;

  const completedSteps =
    (hasNoblejas ? noblejaspalletsDone + (hasNobjelasPico && currentProgress?.nobjelasPicoCompleted ? 1 : 0) : 0) +
    (hasPico && currentProgress?.picoCompleted ? 1 : 0) +
    (currentProgress ? currentProgress.completedPallets : 0);

  const overallPercent =
    totalSteps > 0 ? Math.min((completedSteps / totalSteps) * 100, 100) : 0;

  // === Cajas hechas y restantes Milagro ===
  const boxesAdjustment = currentProgress?.boxesAdjustment || 0;
  const cajasHechasMilagro = currentProgress && current
    ? currentProgress.completedPallets * current.boxesPerPallet +
      (currentProgress.picoCompleted ? calc.pico : 0) + boxesAdjustment
    : 0;
  const cajasRestantesMilagro = calc.production - cajasHechasMilagro;
  const milagroPercent =
    calc.production > 0
      ? Math.min((cajasHechasMilagro / calc.production) * 100, 100)
      : 0;

  // === Cajas hechas y restantes Noblejas ===
  const cajasHechasNoblejas = hasNoblejas && currentProgress && current
    ? currentProgress.noblejasCompletedPallets * current.boxesPerPallet +
      (currentProgress.nobjelasPicoCompleted ? nobjelasPicoCajas : 0)
    : 0;
  const cajasRestantesNoblejas = hasNoblejas && current
    ? current.noblejas - cajasHechasNoblejas
    : 0;
  const noblejasPercent =
    hasNoblejas && current && current.noblejas > 0
      ? Math.min((cajasHechasNoblejas / current.noblejas) * 100, 100)
      : 0;

  const noblejasComplete = !hasNoblejas || (cajasRestantesNoblejas === 0);
  const milagroComplete = cajasRestantesMilagro === 0;

  // === Global ===
  const totalCajasObjetivo = calc.production + (hasNoblejas && current ? current.noblejas : 0);
  const totalCajasHechas = cajasHechasMilagro + cajasHechasNoblejas;

  const stepLabel = (n: number) => {
    let s = 0;
    if (hasNoblejas) s++;
    if (hasPico) s++;
    s++;
    return s === 1 ? "" : `${n}. `;
  };

  let stepN = 1;
  const stepPaletsNoblejas = nobjelasTotalPallets > 0 ? stepN++ : 0;
  const stepPicoNoblejas = hasNobjelasPico ? stepN++ : 0;
  const stepPaletsMilagro = calc.pallets > 0 ? stepN++ : 0;
  const stepPicoMilagro = hasPico ? stepN++ : 0;

  // Auxiliares de completado
  const palletsComplete = currentProgress ? currentProgress.completedPallets >= calc.pallets : false;

  // Estados de expansión de acordeón para los 4 bloques
  const [noblejasPalletsExpanded, setNoblejasPalletsExpanded] = useState(true);
  const [noblejasPicoExpanded, setNoblejasPicoExpanded] = useState(true);
  const [milagroPalletsExpanded, setMilagroPalletsExpanded] = useState(true);
  const [milagroPicoExpanded, setMilagroPicoExpanded] = useState(true);

  // Determinar cuál es el bloque activo actualmente en la secuencia de producción
  let activeBlock: "nob-pallets" | "nob-pico" | "mil-pallets" | "mil-pico" | null = null;
  if (nobjelasTotalPallets > 0 && noblejaspalletsDone < nobjelasTotalPallets) {
    activeBlock = "nob-pallets";
  } else if (hasNobjelasPico && currentProgress && !currentProgress.nobjelasPicoCompleted) {
    activeBlock = "nob-pico";
  } else if (calc.pallets > 0 && currentProgress && currentProgress.completedPallets < calc.pallets) {
    activeBlock = "mil-pallets";
  } else if (hasPico && currentProgress && !currentProgress.picoCompleted) {
    activeBlock = "mil-pico";
  }

  // Sincronizar estado durante renderizado en lugar de useEffect para evitar renderizados en cascada (React 19)
  const [prevFormatId, setPrevFormatId] = useState<string | null>(null);
  const [prevActiveBlockState, setPrevActiveBlockState] = useState<string | null>(null);

  const currentFormatId = current?.formatId || null;

  if (currentFormatId !== prevFormatId) {
    setPrevFormatId(currentFormatId);
    setPrevActiveBlockState(activeBlock);
    setNoblejasPalletsExpanded(activeBlock === "nob-pallets" || activeBlock === null);
    setNoblejasPicoExpanded(activeBlock === "nob-pico");
    setMilagroPalletsExpanded(activeBlock === "mil-pallets");
    setMilagroPicoExpanded(activeBlock === "mil-pico");
  } else if (activeBlock !== prevActiveBlockState) {
    setPrevActiveBlockState(activeBlock);
    setNoblejasPalletsExpanded(activeBlock === "nob-pallets");
    setNoblejasPicoExpanded(activeBlock === "nob-pico");
    setMilagroPalletsExpanded(activeBlock === "mil-pallets");
    setMilagroPicoExpanded(activeBlock === "mil-pico");
  }

  // Auto-open finish dialog when completed disabled in favor of global auto-advance
  const canFinalize = noblejasComplete && milagroComplete;

  // === Desglose de Cajas Totales ===
  const totalPallets = current ? Math.floor(current.quantity / current.boxesPerPallet) : 0;
  const totalPico = current ? current.quantity % current.boxesPerPallet : 0;

  if (!current || !currentProgress) return null;

  return (
    <div className={cn(
      "glass-card rounded-2xl p-3 md:p-4 space-y-3 transition-all duration-500",
      currentProgress.finished
        ? "border-emerald-500/40 bg-emerald-500/[0.02] animate-pulse-green"
        : "border-white/10"
    )}>
      {/* Título — nombre ensalada grande + tipo caja con info */}
      <div className="text-center">
        <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] flex items-center justify-center gap-1.5">
          <span>OF Actual</span>
          <button
            type="button"
            onClick={() => setEditingQueueItemId(current.id)}
            className="text-[10px] font-bold text-emerald-400/70 hover:text-emerald-400 bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-0.5"
            title="Editar OF actual"
          >
            <span>✏️</span>
            <span>Editar</span>
          </button>
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-white leading-tight">
          {current.saladName}
        </h2>
        {goldMode && current.note && (
          <div className="mt-2 mx-auto max-w-sm px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold flex items-center justify-center gap-1.5 animate-pulse">
            <span>📝 Alerta:</span>
            <span>{current.note}</span>
          </div>
        )}

        {current.cambioLote && (
          <div className="mt-2 mx-auto max-w-sm px-3 py-1.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-black flex items-center justify-center gap-1.5 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <span>🔄 ¡CAMBIO DE LOTE!</span>
            <span>Lote: {getActiveLote(queue, currentQueueIndex)}</span>
          </div>
        )}

        {current.saladName.toUpperCase().includes("PROMO") && (
          <div className="mt-2 mx-auto max-w-sm px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/45 text-amber-300 text-xs font-black flex items-center justify-center gap-1.5 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.3)] border-dashed border-amber-400">
            <span>✨ ¡LLEVA FILM PROMO!</span>
          </div>
        )}
        
        {/* Fila del Tipo de Caja con botón de 3 puntos Popover */}
        <div className="flex items-center justify-center gap-1.5 mt-0.5 relative flex-wrap">
          <span className="text-xs md:text-sm text-emerald-400 font-bold">{current.boxType}</span>
          {getActiveLote(queue, currentQueueIndex) && (
            <span className={cn(
              "text-[10px] font-mono font-bold border px-1.5 py-0.5 rounded-md animate-fade-in",
              current.cambioLote
                ? "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.2)] animate-pulse"
                : "bg-purple-500/10 text-purple-300 border-purple-500/20"
            )}>
              Lote: {getActiveLote(queue, currentQueueIndex)}
            </span>
          )}
          
          <button
            type="button"
            onClick={() => setShowInfoPopover(!showInfoPopover)}
            className={cn(
              "w-5 h-5 rounded-lg flex items-center justify-center text-white/45 hover:text-white transition-all cursor-pointer text-[10px] font-bold",
              showInfoPopover ? "bg-white/15 border border-white/20" : "bg-white/5 border border-white/10"
            )}
            title="Información de caja"
          >
            •••
          </button>

          {showInfoPopover && (
            <>
              {/* Backdrop invisible */}
              <div 
                className="fixed inset-0 z-40 cursor-default" 
                onClick={() => setShowInfoPopover(false)} 
              />
              
              {/* Popover flotante con información detallada de la caja */}
              <div className={cn(
                "absolute top-7 left-1/2 -translate-x-1/2 w-64 backdrop-blur-lg border rounded-2xl p-3 shadow-2xl text-left z-50 animate-slide-down text-xs space-y-2 select-none",
                goldMode
                  ? "bg-slate-950/95 border-white/10 text-white"
                  : "bg-white/95 border-emerald-500/20 text-slate-900 shadow-emerald-900/10"
              )}>
                <h4 className={cn("font-black border-b pb-1 flex justify-between items-center text-[10px] uppercase tracking-wider", goldMode ? "text-white border-white/5" : "text-slate-900 border-slate-200")}>
                  <span>Detalles de {current.boxType}</span>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-black">Caja</span>
                </h4>
                <div className={cn("space-y-1.5", goldMode ? "text-white/70" : "text-slate-700")}>
                  <div className="flex justify-between">
                    <span>Ensaladas por caja:</span>
                    <span className={cn("font-mono font-bold", goldMode ? "text-white" : "text-slate-900")}>{saladsPerBox} uds</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cajas por palet:</span>
                    <span className={cn("font-mono font-bold", goldMode ? "text-white" : "text-slate-900")}>{current.boxesPerPallet} cajas</span>
                  </div>
                  <div className={cn("flex justify-between border-t pt-1.5 mt-1", goldMode ? "border-white/5" : "border-slate-200")}>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Ensaladas por palet:</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{current.boxesPerPallet * saladsPerBox} uds</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== PIRÁMIDE DE MÉTRICAS ===== */}
      <div className="space-y-3">
        {/* Cúspide: Cajas Totales */}
        <div className={cn(
          "glass-card-inner rounded-2xl p-3.5 text-center transition-all duration-300 relative overflow-hidden hover:scale-[1.01] hover:border-white/15 cursor-default shadow-md shadow-black/5",
          currentProgress.finished
            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10"
            : "border-white/10 text-white"
        )}>
          {currentProgress.finished && (
            <div className="absolute top-2 right-2.5 bg-emerald-500 text-slate-950 font-black text-[8px] tracking-wider px-2 py-0.5 rounded-full uppercase animate-bounce">
              ✓ Terminado
            </div>
          )}
          <p className={cn(
            "text-[9px] uppercase tracking-[0.2em] font-black",
            currentProgress.finished ? "text-emerald-400/80" : "text-white/40"
          )}>
            Cajas Totales
          </p>
          <p className="text-3xl md:text-4xl font-black tabular-nums mt-1 select-none leading-none">
            {current.quantity}
          </p>
          <p className={cn(
            "text-[8px] font-mono mt-1 opacity-50",
            currentProgress.finished ? "text-emerald-400/70" : "text-white/40"
          )}>
            ({current.quantity * saladsPerBox} uds)
          </p>
        </div>

        {/* Pallets y Pico grandes y claros en el medio (como antes) */}
        <div className={cn("grid gap-3", hasNoblejas ? "grid-cols-4" : "grid-cols-2")}>
          {hasNoblejas && (
            <>
              {/* Palets Nob */}
              <div className={cn(
                "rounded-2xl p-3.5 border transition-all duration-300 text-center shadow-lg",
                noblejasComplete
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-inner"
                  : noblejaspalletsDone >= nobjelasTotalPallets
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-300 shadow-inner"
                  : "bg-white/[0.02] border-white/5 text-white/50"
              )}>
                <p className={cn(
                  "text-[9px] uppercase tracking-widest font-black opacity-60",
                  noblejasComplete ? "text-emerald-400" : "text-purple-400"
                )}>Pallets Nob.</p>
                <p className={cn(
                  "text-2xl md:text-3xl font-black tabular-nums mt-1 leading-none",
                  noblejasComplete ? "text-emerald-400" : "text-white"
                )}>{noblejaspalletsDone} / {nobjelasTotalPallets}</p>
              </div>

              {/* Pico Nob */}
              <div className={cn(
                "rounded-2xl p-3.5 border transition-all duration-300 text-center shadow-lg",
                noblejasComplete
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-inner"
                  : currentProgress.nobjelasPicoCompleted
                  ? "bg-purple-500/10 border-purple-500/30 text-purple-300 shadow-inner"
                  : "bg-white/[0.02] border-white/5 text-white/50"
              )}>
                <p className={cn(
                  "text-[9px] uppercase tracking-widest font-black opacity-60",
                  noblejasComplete ? "text-emerald-400" : "text-purple-400"
                )}>Pico Nob.</p>
                <p className={cn(
                  "text-2xl md:text-3xl font-black tabular-nums mt-1 leading-none",
                  noblejasComplete ? "text-emerald-400" : "text-white"
                )}>{currentProgress.nobjelasPicoCompleted ? "Listo" : `${nobjelasPicoCajas}c`}</p>
              </div>
            </>
          )}

          {/* Palets Mil */}
          <div className={cn(
            "rounded-2xl p-3.5 border transition-all duration-300 text-center shadow-lg",
            milagroComplete
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-inner"
              : currentProgress.completedPallets >= calc.pallets
              ? "bg-orange-500/10 border-orange-500/30 text-orange-300 shadow-inner"
              : "bg-white/[0.02] border-white/5 text-white/50"
          )}>
            <p className={cn(
              "text-[9px] uppercase tracking-widest font-black opacity-60",
              milagroComplete ? "text-emerald-400" : "text-orange-400"
            )}>Pallets Mil.</p>
            <p className={cn(
              "text-2xl md:text-3xl font-black tabular-nums mt-1 leading-none",
              milagroComplete ? "text-emerald-400" : "text-orange-400"
            )}>{currentProgress.completedPallets} / {calc.pallets}</p>
          </div>

          {/* Pico Mil */}
          <div className={cn(
            "rounded-2xl p-3.5 border transition-all duration-300 text-center shadow-lg",
            milagroComplete
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-inner"
              : currentProgress.picoCompleted
              ? "bg-orange-500/10 border-orange-500/30 text-orange-300 shadow-inner"
              : "bg-white/[0.02] border-white/5 text-white/50"
          )}>
            <p className={cn(
              "text-[9px] uppercase tracking-widest font-black opacity-60",
              milagroComplete ? "text-emerald-400" : "text-orange-400"
            )}>Pico Mil.</p>
            <p className={cn(
              "text-2xl md:text-3xl font-black tabular-nums mt-1 leading-none",
              milagroComplete ? "text-emerald-400" : "text-orange-400"
            )}>{currentProgress.picoCompleted ? "Listo" : `${calc.pico}c`}</p>
          </div>
        </div>

        {/* Base: Noblejas y Milagro side-by-side con métricas y anillo de progreso */}
        <div className={cn("grid gap-3.5", hasNoblejas ? "grid-cols-2" : "grid-cols-1")}>
          {/* Tarjeta Noblejas */}
          {hasNoblejas && (
            <div className={cn(
              "glass-card-inner rounded-2xl p-4 border transition-all duration-300 hover:scale-[1.02] hover:shadow-xl cursor-default text-left space-y-3.5",
              noblejasComplete
                ? "border-emerald-500/30 bg-gradient-to-br from-emerald-950/15 via-emerald-900/[0.03] to-transparent hover:border-emerald-500/50 hover:shadow-emerald-950/10"
                : "border-purple-500/20 bg-gradient-to-br from-purple-950/15 via-purple-900/[0.03] to-transparent hover:border-purple-500/40 hover:shadow-purple-950/10"
            )}>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className={cn(
                    "text-[11px] md:text-xs font-black uppercase tracking-widest",
                    noblejasComplete ? "text-emerald-400" : "text-purple-400"
                  )}>Noblejas</p>
                  
                  {/* Cajas hechas / total */}
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={cn(
                      "text-3xl md:text-4xl font-black tabular-nums leading-none",
                      noblejasComplete ? "text-emerald-400" : "text-purple-400"
                    )}>
                      {cajasHechasNoblejas}
                    </span>
                    <span className="text-sm md:text-base text-white/50 font-bold">/ {current.noblejas} c.</span>
                  </div>
                  
                  {/* Unidades hechas / total */}
                  <p className="text-[10px] md:text-xs text-white/40 font-bold">
                    {cajasHechasNoblejas * saladsPerBox} / {current.noblejas * saladsPerBox} u
                  </p>

                  {/* Cajas Restantes */}
                  <p className={cn(
                    "text-[10px] md:text-xs font-black mt-2",
                    cajasRestantesNoblejas === 0 ? "text-emerald-400" : "text-purple-300"
                  )}>
                    {cajasRestantesNoblejas === 0 
                      ? "Listo" 
                      : `Faltan: ${cajasRestantesNoblejas} c. (${cajasRestantesNoblejas * saladsPerBox} u)`
                    }
                  </p>
                </div>
                
                {/* Anillo de Progreso */}
                <ProgressCircle 
                  percent={noblejasPercent} 
                  colorClass={noblejasComplete ? "text-emerald-400" : "text-purple-400"} 
                  strokeColor={noblejasComplete ? "stroke-emerald-500" : "stroke-purple-500"} 
                />
              </div>
            </div>
          )}

          {/* Tarjeta Milagro */}
          <div className={cn(
            "glass-card-inner rounded-2xl p-4 border transition-all duration-300 hover:scale-[1.02] hover:shadow-xl cursor-default text-left space-y-3.5",
            milagroComplete
              ? "border-emerald-500/30 bg-gradient-to-br from-emerald-950/15 via-emerald-900/[0.03] to-transparent hover:border-emerald-500/50 hover:shadow-emerald-950/10"
              : "border-orange-500/20 bg-gradient-to-br from-orange-950/15 via-orange-900/[0.03] to-transparent hover:border-orange-500/40 hover:shadow-orange-950/10"
          )}>
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className={cn(
                  "text-[11px] md:text-xs font-black uppercase tracking-widest",
                  milagroComplete ? "text-emerald-400" : "text-orange-400"
                )}>Milagro</p>
                
                {/* Cajas hechas / total */}
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className={cn(
                    "text-3xl md:text-4xl font-black tabular-nums leading-none",
                    milagroComplete ? "text-emerald-400" : "text-orange-400"
                  )}>
                    {cajasHechasMilagro}
                  </span>
                  <span className="text-sm md:text-base text-white/50 font-bold">/ {calc.production} c.</span>
                </div>
                
                {/* Unidades hechas / total */}
                <p className="text-[10px] md:text-xs text-white/40 font-bold">
                  {cajasHechasMilagro * saladsPerBox} / {calc.production * saladsPerBox} u
                </p>

                {/* Cajas Restantes */}
                <p className={cn(
                  "text-[10px] md:text-xs font-black mt-2",
                  cajasRestantesMilagro === 0 ? "text-emerald-400" : "text-orange-300"
                )}>
                  {cajasRestantesMilagro === 0 
                    ? "Listo" 
                    : `Faltan: ${cajasRestantesMilagro} c. (${cajasRestantesMilagro * saladsPerBox} u)`
                  }
                </p>
              </div>
              
              {/* Anillo de Progreso */}
              <ProgressCircle 
                percent={milagroPercent} 
                colorClass={milagroComplete ? "text-emerald-400" : "text-orange-400"} 
                strokeColor={milagroComplete ? "stroke-emerald-500" : "stroke-orange-500"} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* ===== PANEL DE PROGRESO DE CAJAS REACTIVO Y SEGMENTADO ===== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-white/50 text-[10px] uppercase tracking-wider font-bold">Progreso</span>
          <span className="font-bold text-white tabular-nums text-sm">
            {completedSteps}/{totalSteps}
            <span className="text-white/30 text-[10px] ml-1">pasos</span>
          </span>
        </div>
        <div className="relative h-4 bg-white/5 rounded-full overflow-hidden border border-white/10 flex">
          {overallPercent >= 100 ? (
            <div
              className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 flex-1 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
            />
          ) : (
            <>
              {/* Tramo Noblejas */}
              {hasNoblejas && (
                <div
                  className="h-full bg-gradient-to-r from-purple-700 via-purple-500 to-purple-400 transition-all duration-500 ease-out relative shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                  style={{ width: `${(cajasHechasNoblejas / totalCajasObjetivo) * 100}%` }}
                />
              )}
              {/* Tramo Milagro */}
              <div
                className="h-full bg-gradient-to-r from-orange-700 via-orange-500 to-orange-400 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(249,115,22,0.2)]"
                style={{ width: `${(cajasHechasMilagro / totalCajasObjetivo) * 100}%` }}
              />
            </>
          )}
          
          {/* Hito divisor entre Noblejas y Milagro (solo si hay noblejas y no está 100% completado) */}
          {hasNoblejas && overallPercent < 100 && (
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-white/25 z-10"
              style={{ left: `${(current.noblejas / totalCajasObjetivo) * 100}%` }}
            />
          )}

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {Math.round(overallPercent)}%
            </span>
          </div>
        </div>
      </div>

      {/* ===== SECUENCIA DE EXTRACCIÓN ===== */}
      <div className="border-t border-white/5 pt-2 space-y-1.5">
        <h3 className="text-[9px] font-bold text-white/35 uppercase tracking-[0.15em]">
          Secuencia de Extracción
        </h3>

        {/* — 1. PALETS NOBLEJAS (ACORDEÓN) — */}
        {nobjelasTotalPallets > 0 && (
          <div className="space-y-2">
            <div
              onClick={() => setNoblejasPalletsExpanded(!noblejasPalletsExpanded)}
              className={cn(
                "flex items-center justify-between p-3 rounded-2xl border cursor-pointer select-none transition-all active:scale-[0.99]",
                nobjelasPalletsComplete
                  ? "bg-purple-900/10 border-purple-500/30 text-purple-300 hover:bg-purple-900/15"
                  : "bg-purple-950/20 border-purple-500/15 text-white hover:bg-purple-950/30"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 transition-all",
                  nobjelasPalletsComplete ? "bg-purple-500 text-white" : "border border-purple-500/40 text-purple-400"
                )}>
                  {nobjelasPalletsComplete ? "✓" : stepPaletsNoblejas}
                </div>
                <span className="font-black text-xs md:text-sm tracking-wide">
                  {stepPaletsNoblejas}. Palets Noblejas
                </span>
                {nobjelasPalletsComplete && (
                  <span className="text-[10px] text-purple-400/60 font-semibold bg-purple-500/10 px-1.5 py-0.5 rounded-md">
                    Completado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-purple-400/50">
                <span className="font-mono text-purple-400/60">
                  {noblejaspalletsDone} / {nobjelasTotalPallets} p ({noblejaspalletsDone * current.boxesPerPallet * saladsPerBox} / {nobjelasTotalPallets * current.boxesPerPallet * saladsPerBox} u)
                </span>
                <span>{noblejasPalletsExpanded ? "▲ Colapsar" : "▼ Desplegar"}</span>
              </div>
            </div>

            {noblejasPalletsExpanded && (
              <div
                className={cn(
                  "rounded-2xl border transition-all p-3.5 space-y-2.5 animate-slide-down",
                  nobjelasPalletsComplete
                    ? "bg-purple-500/5 border-purple-500/25 opacity-70"
                    : "bg-purple-500/[0.02] border-purple-500/10"
                )}
              >
                <div className="flex justify-between items-center text-[10px] font-bold text-white/40 px-0.5 mb-1">
                  <span>Rejilla de Palets Noblejas</span>
                  <span className="font-mono text-purple-400 font-bold">
                    {noblejaspalletsDone} / {nobjelasTotalPallets} p ({noblejaspalletsDone * current.boxesPerPallet * saladsPerBox} u)
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: nobjelasTotalPallets }).map((_, i) => {
                    const isDone = i < noblejaspalletsDone;
                    const isActive = i === noblejaspalletsDone && !currentProgress.finished;

                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={currentProgress.finished}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(25);
                          if (isDone && i === noblejaspalletsDone - 1) {
                            removeNobjelasPallet();
                          } else if (isActive) {
                            addNobjelasPallet();
                          }
                        }}
                        className={cn(
                          "h-12 w-20 rounded-xl border flex flex-col justify-center items-center gap-0.5 transition-all select-none cursor-pointer",
                          isDone
                            ? "bg-purple-500/20 border-purple-500/50 text-purple-300 font-black shadow-md shadow-purple-500/5"
                            : isActive
                            ? "bg-purple-500/5 border-purple-400 border-dashed text-purple-400 font-bold animate-pulse scale-[1.02]"
                            : "bg-white/[0.02] border-white/5 text-white/20 cursor-not-allowed opacity-40"
                        )}
                        title={isActive ? "Haz clic para completar este palet" : isDone && i === noblejaspalletsDone - 1 ? "Haz clic para deshacer este palet" : ""}
                      >
                        <span className="text-[9px] uppercase tracking-wider font-semibold opacity-65">Nob {i + 1}</span>
                        <span className="text-xs">{isDone ? "📦 ✓" : "📦"}</span>
                        <span className="text-[8px] opacity-40 font-mono">{(current.boxesPerPallet * saladsPerBox)} u</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* — 2. PICO NOBLEJAS (ACORDEÓN) — */}
        {hasNobjelasPico && (
          <div className="space-y-2">
            <div
              onClick={() => setNoblejasPicoExpanded(!noblejasPicoExpanded)}
              className={cn(
                "flex items-center justify-between p-3 rounded-2xl border cursor-pointer select-none transition-all active:scale-[0.99]",
                currentProgress.nobjelasPicoCompleted
                  ? "bg-purple-900/10 border-purple-500/30 text-purple-300 hover:bg-purple-900/15"
                  : "bg-purple-950/20 border-purple-500/15 text-white hover:bg-purple-950/30"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 transition-all",
                  currentProgress.nobjelasPicoCompleted ? "bg-purple-500 text-white" : "border border-purple-500/40 text-purple-400"
                )}>
                  {currentProgress.nobjelasPicoCompleted ? "✓" : stepPicoNoblejas}
                </div>
                <span className="font-black text-xs md:text-sm tracking-wide">
                  {stepPicoNoblejas}. Pico Noblejas
                </span>
                {currentProgress.nobjelasPicoCompleted && (
                  <span className="text-[10px] text-purple-400/60 font-semibold bg-purple-500/10 px-1.5 py-0.5 rounded-md">
                    Completado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-purple-400/50">
                <span className="font-mono text-purple-400/60">
                  {nobjelasPicoCajas}c ({nobjelasPicoCajas * saladsPerBox} u)
                </span>
                <span>{noblejasPicoExpanded ? "▲ Colapsar" : "▼ Desplegar"}</span>
              </div>
            </div>

            {noblejasPicoExpanded && (
              <div className="animate-slide-down">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
                    setNobjelasPicoCompleted(!currentProgress.nobjelasPicoCompleted);
                  }}
                  disabled={currentProgress.finished}
                  className={cn(
                    "w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all active:scale-[0.99] select-none cursor-pointer",
                    currentProgress.nobjelasPicoCompleted
                      ? "bg-purple-500/10 border-purple-500/30 shadow-md shadow-purple-500/5 text-purple-200/80"
                      : "bg-purple-500/5 border-purple-500/15 hover:bg-purple-500/10 text-white"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center border transition-all shrink-0 text-xs",
                        currentProgress.nobjelasPicoCompleted
                          ? "bg-purple-500 border-purple-500 text-white font-black"
                          : "border-purple-500/40 bg-transparent text-transparent"
                      )}
                    >
                      {currentProgress.nobjelasPicoCompleted && "✓"}
                    </div>
                    <span className={cn(
                      "font-bold text-sm transition-all",
                      currentProgress.nobjelasPicoCompleted ? "line-through opacity-60 text-white/60" : "text-white"
                    )}>
                      Verificar Pico Noblejas
                    </span>
                  </div>
                  <span className={cn(
                    "font-mono font-black px-2.5 py-1 rounded-xl text-xs border transition-all uppercase flex items-center gap-1.5",
                    currentProgress.nobjelasPicoCompleted
                      ? "bg-purple-500/20 border-purple-500/20 text-purple-300"
                      : "bg-purple-500/10 border-purple-500/20 text-purple-400"
                  )}>
                    {nobjelasPicoCajas} cajas ({nobjelasPicoCajas * saladsPerBox} uds)
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* — 3. PALETS MILAGRO (ACORDEÓN) — */}
        {calc.pallets > 0 && (
          <div className="space-y-2">
            <div
              onClick={() => setMilagroPalletsExpanded(!milagroPalletsExpanded)}
              className={cn(
                "flex items-center justify-between p-3 rounded-2xl border cursor-pointer select-none transition-all active:scale-[0.99]",
                palletsComplete
                  ? "bg-orange-900/10 border-orange-500/30 text-orange-300 hover:bg-orange-900/15"
                  : "bg-orange-950/20 border-orange-500/15 text-white hover:bg-orange-950/30"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 transition-all",
                  palletsComplete ? "bg-orange-500 text-white" : "border border-orange-500/40 text-orange-400"
                )}>
                  {palletsComplete ? "✓" : stepPaletsMilagro}
                </div>
                <span className="font-black text-xs md:text-sm tracking-wide">
                  {stepPaletsMilagro}. Palets Milagro
                </span>
                {palletsComplete && (
                  <span className="text-[10px] text-orange-400/60 font-semibold bg-orange-500/10 px-1.5 py-0.5 rounded-md">
                    Completado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-orange-400/50">
                <span className="font-mono text-orange-400/60">
                  {currentProgress.completedPallets} / {calc.pallets} p ({currentProgress.completedPallets * current.boxesPerPallet * saladsPerBox} / {calc.pallets * current.boxesPerPallet * saladsPerBox} u)
                </span>
                <span>{milagroPalletsExpanded ? "▲ Colapsar" : "▼ Desplegar"}</span>
              </div>
            </div>

            {milagroPalletsExpanded && (
              <div
                className={cn(
                  "rounded-2xl border transition-all p-3.5 space-y-2.5 animate-slide-down",
                  palletsComplete
                    ? "bg-orange-500/5 border-orange-500/25 opacity-70"
                    : "bg-orange-500/[0.02] border-orange-500/10"
                )}
              >
                <div className="flex justify-between items-center text-[10px] font-bold text-white/40 px-0.5 mb-1">
                  <span>Rejilla de Palets Milagro</span>
                  <span className="font-mono text-orange-400 font-bold">
                    {currentProgress.completedPallets} / {calc.pallets} p ({currentProgress.completedPallets * current.boxesPerPallet * saladsPerBox} u)
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: calc.pallets }).map((_, i) => {
                    const isDone = i < currentProgress.completedPallets;
                    const isActive = i === currentProgress.completedPallets && !currentProgress.finished;

                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={currentProgress.finished}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(25);
                          if (isDone && i === currentProgress.completedPallets - 1) {
                            removePallet();
                          } else if (isActive) {
                            addPallet();
                          }
                        }}
                        className={cn(
                          "h-12 w-20 rounded-xl border flex flex-col justify-center items-center gap-0.5 transition-all select-none cursor-pointer",
                          isDone
                            ? "bg-orange-500/20 border-orange-500/50 text-orange-300 font-black shadow-md shadow-orange-500/5"
                            : isActive
                            ? "bg-orange-500/5 border-orange-400 border-dashed text-orange-400 font-bold animate-pulse scale-[1.02]"
                            : "bg-white/[0.02] border-white/5 text-white/20 cursor-not-allowed opacity-40"
                        )}
                        title={isActive ? "Haz clic para completar este palet" : isDone && i === currentProgress.completedPallets - 1 ? "Haz clic para deshacer este palet" : ""}
                      >
                        <span className="text-[9px] uppercase tracking-wider font-semibold opacity-65">Palet {i + 1}</span>
                        <span className="text-xs">{isDone ? "📦 ✓" : "📦"}</span>
                        <span className="text-[8px] opacity-40 font-mono">{(current.boxesPerPallet * saladsPerBox)} u</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* — 4. PICO MILAGRO (ACORDEÓN) — */}
        {hasPico && (
          <div className="space-y-2">
            <div
              onClick={() => setMilagroPicoExpanded(!milagroPicoExpanded)}
              className={cn(
                "flex items-center justify-between p-3 rounded-2xl border cursor-pointer select-none transition-all active:scale-[0.99]",
                currentProgress.picoCompleted
                  ? "bg-orange-900/10 border-orange-500/30 text-orange-300 hover:bg-orange-900/15"
                  : "bg-orange-950/20 border-orange-500/15 text-white hover:bg-orange-950/30"
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 transition-all",
                  currentProgress.picoCompleted ? "bg-orange-500 text-white" : "border border-orange-500/40 text-orange-400"
                )}>
                  {currentProgress.picoCompleted ? "✓" : stepPicoMilagro}
                </div>
                <span className="font-black text-xs md:text-sm tracking-wide">
                  {stepPicoMilagro}. Pico Milagro
                </span>
                {currentProgress.picoCompleted && (
                  <span className="text-[10px] text-orange-400/60 font-semibold bg-orange-500/10 px-1.5 py-0.5 rounded-md">
                    Completado
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-orange-400/50">
                <span className="font-mono text-orange-400/60">
                  {calc.pico}c ({calc.pico * saladsPerBox} u)
                </span>
                <span>{milagroPicoExpanded ? "▲ Colapsar" : "▼ Desplegar"}</span>
              </div>
            </div>

            {milagroPicoExpanded && (
              <div className="animate-slide-down">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
                    setPicoCompleted(!currentProgress.picoCompleted);
                  }}
                  disabled={currentProgress.finished}
                  className={cn(
                    "w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all active:scale-[0.99] select-none cursor-pointer",
                    currentProgress.picoCompleted
                      ? "bg-orange-500/10 border-orange-500/30 shadow-md shadow-orange-500/5 text-orange-200/80"
                      : "bg-orange-500/5 border-orange-500/15 hover:bg-orange-500/10 text-white"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center border transition-all shrink-0 text-xs",
                        currentProgress.picoCompleted
                          ? "bg-orange-500 border-orange-500 text-white font-black"
                          : "border-orange-500/40 bg-transparent text-transparent"
                      )}
                    >
                      {currentProgress.picoCompleted && "✓"}
                    </div>
                    <span className={cn(
                      "font-bold text-sm transition-all",
                      currentProgress.picoCompleted ? "line-through opacity-60 text-white/60" : "text-white"
                    )}>
                      Verificar Pico Milagro
                    </span>
                  </div>
                  <span className={cn(
                    "font-mono font-black px-2.5 py-1 rounded-xl text-xs border transition-all uppercase flex items-center gap-1.5",
                    currentProgress.picoCompleted
                      ? "bg-orange-500/20 border-orange-500/20 text-orange-300"
                      : "bg-orange-500/10 border-orange-500/20 text-orange-400"
                  )}>
                    {calc.pico} cajas ({calc.pico * saladsPerBox} uds)
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
        
      </div>
    </div>
  );
}

// ===== BLOQUE DE DATO =====
function DataBlock({
  label,
  value,
  accent,
  highlight,
}: {
  label: string;
  value: number;
  accent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass-card-inner rounded-lg p-2 text-center",
        accent
          ? "border-emerald-500/15"
          : highlight
          ? "border-purple-500/15"
          : "border-white/5"
      )}
    >
      <p className="text-[8px] text-white/40 uppercase tracking-widest font-semibold">{label}</p>
      <p
        className={cn(
          "font-black tabular-nums text-xl md:text-2xl",
          accent
            ? "text-emerald-400"
            : highlight
            ? "text-purple-400"
            : "text-white"
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ===== CIRCULO DE PROGRESO SVG =====
function ProgressCircle({ percent, colorClass, strokeColor }: { percent: number; colorClass: string; strokeColor: string }) {
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;
  return (
    <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="22"
          cy="22"
          r={radius}
          className="stroke-white/5"
          strokeWidth="3"
          fill="transparent"
        />
        <circle
          cx="22"
          cy="22"
          r={radius}
          className={cn("transition-all duration-500 ease-out", strokeColor)}
          strokeWidth="3"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <span className={cn("absolute text-[9px] font-black font-sans", colorClass)}>
        {Math.round(percent)}%
      </span>
    </div>
  );
}

// ===== GRÁFICO DE RENDIMIENTO NEÓN SVG =====
function PerformanceChart({ speeds, goldMode }: { speeds: number[]; goldMode: boolean }) {
  if (!speeds || speeds.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center border border-dashed border-white/5 rounded-xl bg-white/[0.01]">
        <p className="text-[10px] text-white/20 uppercase tracking-widest font-bold">
          Esperando datos de ritmo...
        </p>
      </div>
    );
  }

  const height = 50;
  const width = 300;
  const padding = 5;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;

  const minSpeed = Math.min(...speeds, 30);
  const maxSpeed = Math.max(...speeds, 75);
  const range = maxSpeed - minSpeed || 1;

  const points = speeds.map((speed, i) => {
    const x = padding + (i / (speeds.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((speed - minSpeed) / range) * chartHeight;
    return `${x},${y}`;
  }).join(" ");

  const color = goldMode ? "#f59e0b" : "#10b981";
  const neonFilterId = goldMode ? "neon-glow-gold" : "neon-glow-emerald";

  return (
    <div className="bg-black/30 border border-white/5 rounded-2xl p-3 space-y-2 text-left">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-white/35 uppercase tracking-wider font-bold">
          📊 Ritmo de Paletizado (Live)
        </span>
        <span className={cn("text-[10px] font-bold tabular-nums", goldMode ? "text-amber-400" : "text-emerald-400")}>
          Último: {speeds[speeds.length - 1]} c/min
        </span>
      </div>
      <div className="relative w-full h-14 flex items-center justify-center">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" strokeDasharray="2" />
          <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" strokeDasharray="2" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" strokeDasharray="2" />

          <defs>
            <filter id={neonFilterId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <polyline
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            filter={`url(#${neonFilterId})`}
            className="opacity-75"
          />

          <polyline
            fill="none"
            stroke={goldMode ? "#fffbeb" : "#a7f3d0"}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {speeds.map((speed, i) => {
            const x = padding + (i / (speeds.length - 1 || 1)) * chartWidth;
            const y = padding + chartHeight - ((speed - minSpeed) / range) * chartHeight;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="2.2"
                fill={color}
                stroke={goldMode ? "#fffbeb" : "#ffffff"}
                strokeWidth="1"
                className="transition-all hover:scale-125"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
