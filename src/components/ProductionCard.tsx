"use client";

import { useState } from "react";
import { useProductionStore } from "@/store/production-store";
import { calculateFormat, getSaladsPerBox, getActiveLote } from "@/types/types";
import type { QueueItem } from "@/types/types";
import { cn } from "@/lib/utils";
import { Check, Lock, ChevronDown, ChevronUp, Edit3, Package, AlertCircle } from "lucide-react";

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
    goldMode,
  } = useProductionStore();

  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const current: QueueItem | undefined = queue[currentQueueIndex];
  if (!current || !currentProgress) return null;

  const calc = calculateFormat({
    id: current.formatId,
    boxType: current.boxType,
    quantity: current.quantity,
    noblejas: current.noblejas,
    boxesPerPallet: current.boxesPerPallet,
  });

  const saladsPerBox = getSaladsPerBox(current.boxType);

  // === Cálculos de Noblejas ===
  const hasNoblejas = current.noblejas > 0;
  const nobjelasTotalPallets = hasNoblejas
    ? Math.floor(current.noblejas / current.boxesPerPallet)
    : 0;
  const nobjelasPicoCajas = hasNoblejas
    ? current.noblejas % current.boxesPerPallet
    : 0;
  const hasNobjelasPico = nobjelasPicoCajas > 0;

  const noblejaspalletsDone = currentProgress.noblejasCompletedPallets || 0;
  const nobjelasPalletsComplete = noblejaspalletsDone >= nobjelasTotalPallets;
  const nobjelasPicoOk = !hasNobjelasPico || !!currentProgress.nobjelasPicoCompleted;
  const noblejasFullyDone = !hasNoblejas || (nobjelasPalletsComplete && nobjelasPicoOk);

  // === Cálculos de Milagro ===
  const hasPico = calc.pico > 0;
  const milagroPalletsDone = currentProgress.completedPallets || 0;
  const milagroPalletsComplete = milagroPalletsDone >= calc.pallets;
  const milagroPicoOk = !hasPico || !!currentProgress.picoCompleted;
  const milagroFullyDone = milagroPalletsComplete && milagroPicoOk;

  // === Totales de Cajas ===
  const totalCajas = current.quantity;
  const boxesAdjustment = currentProgress.boxesAdjustment || 0;
  const cajasHechasNoblejas = (noblejaspalletsDone * current.boxesPerPallet) + (currentProgress.nobjelasPicoCompleted ? nobjelasPicoCajas : 0);
  const cajasHechasMilagro = (milagroPalletsDone * current.boxesPerPallet) + (currentProgress.picoCompleted ? calc.pico : 0) + boxesAdjustment;
  const totalCajasHechas = Math.min(totalCajas, cajasHechasNoblejas + cajasHechasMilagro);
  const totalCajasFaltan = Math.max(0, totalCajas - totalCajasHechas);
  const percent = totalCajas > 0 ? Math.min(100, Math.round((totalCajasHechas / totalCajas) * 100)) : 0;

  // === Determinación del Paso Activo en la Secuencia ===
  let activeStepId: "nob-pallets" | "nob-pico" | "mil-pallets" | "mil-pico" | "finished" = "finished";
  if (nobjelasTotalPallets > 0 && noblejaspalletsDone < nobjelasTotalPallets) {
    activeStepId = "nob-pallets";
  } else if (hasNobjelasPico && !currentProgress.nobjelasPicoCompleted) {
    activeStepId = "nob-pico";
  } else if (calc.pallets > 0 && milagroPalletsDone < calc.pallets) {
    activeStepId = "mil-pallets";
  } else if (hasPico && !currentProgress.picoCompleted) {
    activeStepId = "mil-pico";
  } else {
    activeStepId = "finished";
  }

  // Helper para saber si un paso está expandido (por defecto solo el activo)
  const isStepExpanded = (stepId: string) => {
    if (expandedSteps[stepId] !== undefined) {
      return expandedSteps[stepId];
    }
    return activeStepId === stepId;
  };

  const toggleStep = (stepId: string, locked: boolean) => {
    if (locked) return;
    setExpandedSteps((prev) => ({
      ...prev,
      [stepId]: !isStepExpanded(stepId),
    }));
  };

  // Construcción de la lista secuencial de pasos
  let currentStepNumber = 1;
  const steps: {
    id: "nob-pallets" | "nob-pico" | "mil-pallets" | "mil-pico";
    stepNum: number;
    title: string;
    type: "noblejas" | "milagro";
    isCompleted: boolean;
    isActive: boolean;
    isLocked: boolean;
    summaryText: string;
  }[] = [];

  if (nobjelasTotalPallets > 0) {
    steps.push({
      id: "nob-pallets",
      stepNum: currentStepNumber++,
      title: "Palets Noblejas",
      type: "noblejas",
      isCompleted: nobjelasPalletsComplete,
      isActive: activeStepId === "nob-pallets",
      isLocked: false,
      summaryText: `${noblejaspalletsDone} / ${nobjelasTotalPallets} palés`,
    });
  }

  if (hasNobjelasPico) {
    const isLocked = nobjelasTotalPallets > 0 && !nobjelasPalletsComplete;
    steps.push({
      id: "nob-pico",
      stepNum: currentStepNumber++,
      title: `Pico Noblejas (${nobjelasPicoCajas} cajas)`,
      type: "noblejas",
      isCompleted: !!currentProgress.nobjelasPicoCompleted,
      isActive: activeStepId === "nob-pico",
      isLocked,
      summaryText: currentProgress.nobjelasPicoCompleted ? "Confirmado" : `${nobjelasPicoCajas} cajas`,
    });
  }

  if (calc.pallets > 0) {
    const isLocked = (nobjelasTotalPallets > 0 && !nobjelasPalletsComplete) || (hasNobjelasPico && !currentProgress.nobjelasPicoCompleted);
    steps.push({
      id: "mil-pallets",
      stepNum: currentStepNumber++,
      title: "Palets Milagro",
      type: "milagro",
      isCompleted: milagroPalletsComplete,
      isActive: activeStepId === "mil-pallets",
      isLocked,
      summaryText: `${milagroPalletsDone} / ${calc.pallets} palés`,
    });
  }

  if (hasPico) {
    const isLocked = !milagroPalletsComplete || (nobjelasTotalPallets > 0 && !nobjelasPalletsComplete) || (hasNobjelasPico && !currentProgress.nobjelasPicoCompleted);
    steps.push({
      id: "mil-pico",
      stepNum: currentStepNumber++,
      title: `Pico Milagro (${calc.pico} cajas)`,
      type: "milagro",
      isCompleted: !!currentProgress.picoCompleted,
      isActive: activeStepId === "mil-pico",
      isLocked,
      summaryText: currentProgress.picoCompleted ? "Confirmado" : `${calc.pico} cajas`,
    });
  }

  const activeLote = getActiveLote(queue, currentQueueIndex);

  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5 sm:p-4.5 space-y-3.5 transition-all shadow-md",
        goldMode
          ? "bg-[#141006]/95 border-amber-500/20 text-white"
          : "bg-white border-slate-200 text-slate-900 shadow-slate-900/5"
      )}
    >
      {/* 1. CABECERA COMPACTA */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 shrink-0",
                  currentProgress.finished
                    ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                    : goldMode
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "bg-emerald-600 text-white"
                )}
              >
                {!currentProgress.finished && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                <span>{currentProgress.finished ? "Orden terminada" : "En producción"}</span>
              </span>

              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md border", goldMode ? "bg-white/5 border-white/10 text-white/70" : "bg-slate-100 border-slate-200 text-slate-700")}>
                {current.boxType}
              </span>

              {activeLote && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-500/30">
                  Lote: {activeLote}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-1 truncate flex items-center gap-2">
              <span>{current.saladName}</span>
              {current.codigo10e && (
                <span className="text-sm font-mono font-bold opacity-60">({current.codigo10e})</span>
              )}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setEditingQueueItemId(current.id)}
            className={cn(
              "min-h-[44px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0",
              goldMode
                ? "bg-white/5 hover:bg-white/10 border-white/10 text-white/80"
                : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
            )}
            title="Editar parámetros de esta orden"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editar</span>
          </button>
        </div>

        {/* Notas y Alertas si existen */}
        {current.note && (
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Nota: {current.note}</span>
          </div>
        )}

        {current.cambioLote && (
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center gap-2">
            <span className="font-black">⚠️ CAMBIO DE LOTE:</span>
            <span>{activeLote}</span>
          </div>
        )}

        {/* BLOQUE DE PROGRESO DOMINANTE ÚNICO */}
        <div
          className={cn(
            "p-3 rounded-2xl border space-y-2",
            goldMode ? "bg-white/[0.03] border-white/10" : "bg-slate-50/80 border-slate-200"
          )}
        >
          <div className="flex items-baseline justify-between text-xs sm:text-sm font-black">
            <div className="flex items-center gap-1.5">
              <span className={cn("text-base sm:text-lg font-mono", goldMode ? "text-amber-400" : "text-emerald-600")}>
                {percent}%
              </span>
              <span className="opacity-40">·</span>
              <span className="font-mono">{totalCajasHechas} / {totalCajas} cajas</span>
              <span className="opacity-40">·</span>
              <span className={cn(totalCajasFaltan === 0 ? "text-emerald-600" : "text-amber-600 dark:text-amber-400 font-bold")}>
                faltan {totalCajasFaltan}
              </span>
            </div>
            <span className="text-[10px] font-mono opacity-50 font-normal">
              ({totalCajas * saladsPerBox} uds)
            </span>
          </div>

          <div className="h-3 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden p-0.5 relative">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                currentProgress.finished
                  ? "bg-emerald-500"
                  : goldMode
                  ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                  : "bg-gradient-to-r from-emerald-600 to-teal-500"
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. RESUMEN DE PRODUCCIÓN (NOBLEJAS Y MILAGRO) */}
      <div className={cn("grid gap-2.5", hasNoblejas ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
        {/* Tarjeta Noblejas */}
        {hasNoblejas && (
          <div
            className={cn(
              "p-3 rounded-2xl border text-left space-y-1 transition-all",
              noblejasFullyDone
                ? "bg-purple-500/10 border-purple-500/30 text-purple-900 dark:text-purple-200"
                : "bg-purple-500/[0.06] border-purple-300 dark:border-purple-500/25 text-purple-950 dark:text-purple-100"
            )}
          >
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span>Noblejas</span>
              </span>
              <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-bold", noblejasFullyDone ? "bg-purple-500/20 text-purple-800 dark:text-purple-200" : "bg-purple-500/10 text-purple-700")}>
                {noblejasFullyDone ? "✓ Listo" : "En curso"}
              </span>
            </div>

            <p className="text-sm font-black font-mono">
              {nobjelasTotalPallets === 0 ? (
                `Solo pico: ${nobjelasPicoCajas} cajas`
              ) : (
                `${noblejaspalletsDone} / ${nobjelasTotalPallets} palés · pico: ${hasNobjelasPico ? `${nobjelasPicoCajas} cajas` : "sin pico"}`
              )}
            </p>
          </div>
        )}

        {/* Tarjeta Milagro */}
        <div
          className={cn(
            "p-3 rounded-2xl border text-left space-y-1 transition-all",
            milagroFullyDone
              ? "bg-orange-500/10 border-orange-500/30 text-orange-900 dark:text-orange-200"
              : "bg-orange-500/[0.06] border-orange-300 dark:border-orange-500/25 text-orange-950 dark:text-orange-100"
          )}
        >
          <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-orange-700 dark:text-orange-300">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ea580c]" />
              <span>Milagro</span>
            </span>
            <span className={cn("text-[10px] px-1.5 py-0.2 rounded font-bold", milagroFullyDone ? "bg-orange-500/20 text-orange-800 dark:text-orange-200" : "bg-orange-500/10 text-orange-700")}>
              {milagroFullyDone ? "✓ Listo" : "En curso"}
            </span>
          </div>

          <p className="text-sm font-black font-mono">
            {`${milagroPalletsDone} / ${calc.pallets} palés · pico: ${hasPico ? (currentProgress.picoCompleted ? "Listo" : `${calc.pico} cajas`) : "sin pico"}`}
          </p>
        </div>
      </div>

      {/* 3. FLUJO SECUENCIAL (STEPPER / ACORDEÓN) */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider opacity-60">
            Secuencia de Extracción
          </span>
          <span className="text-[10px] font-bold opacity-40">
            {steps.filter((s) => s.isCompleted).length} de {steps.length} completados
          </span>
        </div>

        <div className="space-y-2">
          {steps.map((step) => {
            const expanded = isStepExpanded(step.id);

            return (
              <div
                key={step.id}
                className={cn(
                  "rounded-2xl border transition-all overflow-hidden",
                  step.isCompleted
                    ? "bg-slate-500/[0.03] border-slate-200 dark:border-white/10"
                    : step.isActive
                    ? step.type === "noblejas"
                      ? "border-purple-400 bg-purple-500/[0.04] shadow-sm ring-1 ring-purple-400/30"
                      : "border-orange-400 bg-orange-500/[0.04] shadow-sm ring-1 ring-orange-400/30"
                    : "opacity-60 bg-slate-100/50 dark:bg-white/[0.01] border-slate-200 dark:border-white/5 cursor-not-allowed"
                )}
              >
                {/* Cabecera del Paso */}
                <button
                  type="button"
                  onClick={() => toggleStep(step.id, step.isLocked)}
                  className={cn(
                    "w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between text-left transition-all select-none",
                    step.isLocked ? "cursor-not-allowed" : "cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 transition-all",
                        step.isCompleted
                          ? "bg-emerald-500 text-white"
                          : step.isActive
                          ? step.type === "noblejas"
                            ? "bg-purple-600 text-white"
                            : "bg-[#ea580c] text-white"
                          : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-white/40"
                      )}
                    >
                      {step.isCompleted ? <Check className="w-3.5 h-3.5" /> : step.stepNum}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-xs font-black truncate", step.isActive ? "text-slate-900 dark:text-white" : "opacity-80")}>
                          {step.title}
                        </span>

                        {step.isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow-sm shrink-0 inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            <span>Siguiente paso</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[11px] font-mono font-bold opacity-70">
                      {step.summaryText}
                    </span>

                    {step.isLocked ? (
                      <Lock className="w-3.5 h-3.5 opacity-40" />
                    ) : expanded ? (
                      <ChevronUp className="w-4 h-4 opacity-50" />
                    ) : (
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    )}
                  </div>
                </button>

                {/* Contenido expandido solo para el paso activo o interactuable */}
                {expanded && !step.isLocked && (
                  <div className="px-3.5 pb-3.5 pt-1 border-t border-inherit/30 space-y-2">
                    {/* Controles para Palets Noblejas */}
                    {step.id === "nob-pallets" && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-purple-700 dark:text-purple-300">
                          Palets completos de Noblejas ({current.boxesPerPallet} cajas/palet):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: nobjelasTotalPallets }).map((_, i) => {
                            const isDone = i < noblejaspalletsDone;
                            const isCurrent = i === noblejaspalletsDone && !currentProgress.finished;

                            return (
                              <button
                                key={i}
                                type="button"
                                disabled={currentProgress.finished}
                                onClick={() => {
                                  if (isDone && i === noblejaspalletsDone - 1) {
                                    removeNobjelasPallet();
                                  } else if (isCurrent) {
                                    addNobjelasPallet();
                                  }
                                }}
                                className={cn(
                                  "min-h-[44px] min-w-[72px] px-3 py-2 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer",
                                  isDone
                                    ? "bg-purple-600/20 border-purple-500/50 text-purple-800 dark:text-purple-300 shadow-sm"
                                    : isCurrent
                                    ? "bg-purple-600/10 border-purple-500 border-dashed text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/30 font-black animate-pulse"
                                    : "bg-white/[0.03] border-white/10 text-white/30 cursor-not-allowed"
                                )}
                                title={isCurrent ? "Haz clic para registrar este palet" : isDone && i === noblejaspalletsDone - 1 ? "Haz clic para deshacer este palet" : ""}
                              >
                                <span>P{i + 1}</span>
                                {isDone ? <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 font-black" /> : <Package className="w-3.5 h-3.5 opacity-50" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Controles para Pico Noblejas */}
                    {step.id === "nob-pico" && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setNobjelasPicoCompleted(!currentProgress.nobjelasPicoCompleted)}
                          disabled={currentProgress.finished}
                          className={cn(
                            "w-full min-h-[44px] p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none",
                            currentProgress.nobjelasPicoCompleted
                              ? "bg-purple-600/15 border-purple-500/40 text-purple-800 dark:text-purple-200"
                              : "bg-purple-600/5 border-purple-400/40 text-purple-900 dark:text-purple-100 hover:bg-purple-600/10"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={cn("w-5 h-5 rounded-md flex items-center justify-center border text-xs font-black", currentProgress.nobjelasPicoCompleted ? "bg-purple-600 border-purple-600 text-white" : "border-purple-400 bg-white dark:bg-black/20")}>
                              {currentProgress.nobjelasPicoCompleted && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <span className="text-xs font-black">
                              {currentProgress.nobjelasPicoCompleted ? "Pico Noblejas Verificado" : "Marcar Pico Noblejas como completado"}
                            </span>
                          </div>
                          <span className="text-xs font-mono font-black">{nobjelasPicoCajas} cajas</span>
                        </button>
                      </div>
                    )}

                    {/* Controles para Palets Milagro */}
                    {step.id === "mil-pallets" && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-orange-700 dark:text-orange-300">
                          Palets completos de Milagro ({current.boxesPerPallet} cajas/palet):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: calc.pallets }).map((_, i) => {
                            const isDone = i < milagroPalletsDone;
                            const isCurrent = i === milagroPalletsDone && !currentProgress.finished;

                            return (
                              <button
                                key={i}
                                type="button"
                                disabled={currentProgress.finished}
                                onClick={() => {
                                  if (isDone && i === milagroPalletsDone - 1) {
                                    removePallet();
                                  } else if (isCurrent) {
                                    addPallet();
                                  }
                                }}
                                className={cn(
                                  "min-h-[44px] min-w-[72px] px-3 py-2 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all select-none cursor-pointer",
                                  isDone
                                    ? "bg-orange-600/20 border-orange-500/50 text-orange-800 dark:text-orange-300 shadow-sm"
                                    : isCurrent
                                    ? "bg-orange-600/10 border-orange-500 border-dashed text-orange-700 dark:text-orange-300 ring-2 ring-orange-500/30 font-black animate-pulse"
                                    : "bg-white/[0.03] border-white/10 text-white/30 cursor-not-allowed"
                                )}
                                title={isCurrent ? "Haz clic para registrar este palet" : isDone && i === milagroPalletsDone - 1 ? "Haz clic para deshacer este palet" : ""}
                              >
                                <span>P{i + 1}</span>
                                {isDone ? <Check className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 font-black" /> : <Package className="w-3.5 h-3.5 opacity-50" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Controles para Pico Milagro */}
                    {step.id === "mil-pico" && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setPicoCompleted(!currentProgress.picoCompleted)}
                          disabled={currentProgress.finished}
                          className={cn(
                            "w-full min-h-[44px] p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none",
                            currentProgress.picoCompleted
                              ? "bg-orange-600/15 border-orange-500/40 text-orange-800 dark:text-orange-200"
                              : "bg-orange-600/5 border-orange-400/40 text-orange-900 dark:text-orange-100 hover:bg-orange-600/10"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={cn("w-5 h-5 rounded-md flex items-center justify-center border text-xs font-black", currentProgress.picoCompleted ? "bg-[#ea580c] border-[#ea580c] text-white" : "border-orange-400 bg-white dark:bg-black/20")}>
                              {currentProgress.picoCompleted && <Check className="w-3.5 h-3.5" />}
                            </div>
                            <span className="text-xs font-black">
                              {currentProgress.picoCompleted ? "Pico Milagro Verificado" : "Marcar Pico Milagro como completado"}
                            </span>
                          </div>
                          <span className="text-xs font-mono font-black">{calc.pico} cajas</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
