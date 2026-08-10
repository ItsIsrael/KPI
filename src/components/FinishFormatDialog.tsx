"use client";

import { useProductionStore } from "@/store/production-store";
import { calculateFormat, getTransitionType } from "@/types/types";
import type { QueueItem } from "@/types/types";
import { Button } from "@/components/ui/button";

export function FinishFormatDialog() {
  const {
    queue,
    currentQueueIndex,
    currentProgress,
    setPicoCompleted,
    setNobjelasPicoCompleted,
    advanceToNext,
    finishFormat,
    jumpToQueueItem,
    goldMode,
  } = useProductionStore();

  const current: QueueItem | undefined = queue[currentQueueIndex];
  if (!current || !currentProgress || !currentProgress.finished) return null;

  const calc = calculateFormat({
    id: current.formatId,
    boxType: current.boxType,
    quantity: current.quantity,
    noblejas: current.noblejas,
    boxesPerPallet: current.boxesPerPallet,
  });

  const hasNoblejas = current.noblejas > 0;
  const nobjelasPicoCajas = hasNoblejas ? current.noblejas % current.boxesPerPallet : 0;
  const nobjelasTotalPallets = hasNoblejas
    ? Math.floor(current.noblejas / current.boxesPerPallet)
    : 0;

  const canAdvance = true;

  const handleCancel = () => {
    useProductionStore.setState((state) => {
      if (!state.currentProgress) return state;
      return {
        currentProgress: {
          ...state.currentProgress,
          finished: false,
          declinedAutoAdvance: true,
        },
      };
    });
  };

  const next = queue[currentQueueIndex + 1];
  const transition = next ? getTransitionType(current, next) : "same";

  return (
    <div
      className={cn("fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-md p-4", goldMode ? "bg-black/80" : "bg-black/40")}
      onClick={handleCancel}
    >
      <div
        className={cn(
          "border rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-slide-up",
          goldMode ? "glass-card border-white/15" : "bg-white/95 border-emerald-500/30 text-slate-900 shadow-emerald-950/10 backdrop-blur-2xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Título */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3 animate-pulse">
            <span className="text-3xl">🎉</span>
          </div>
          <h3 className={cn("text-2xl font-black", goldMode ? "text-white" : "text-slate-900")}>¡Lote Completado!</h3>
          <p className={cn("mt-1 text-sm", goldMode ? "text-white/40" : "text-slate-500")}>
            Terminó la producción de: <span className={cn("font-bold", goldMode ? "text-white" : "text-slate-900")}>{current.saladName}</span>
          </p>
        </div>

        {/* Resumen */}
        <div className={cn("rounded-2xl p-4 mb-4 space-y-2.5 text-xs border", goldMode ? "glass-card-inner border-white/10" : "bg-slate-50 border-slate-200 shadow-sm")}>
          <div className={cn("flex justify-between items-center", goldMode ? "text-white/50" : "text-slate-500")}>
            <span>Milagro</span>
            <span className={cn("font-bold", goldMode ? "text-white" : "text-slate-900")}>
              {currentProgress.completedPallets} p + {calc.pico} c ({calc.production} cajas)
            </span>
          </div>

          {hasNoblejas && (
            <div className={cn("flex justify-between items-center border-t pt-2", goldMode ? "text-white/50 border-white/5" : "text-slate-500 border-slate-200")}>
              <span>Noblejas</span>
              <span className={cn("font-bold", goldMode ? "text-white" : "text-slate-900")}>
                {currentProgress.noblejasCompletedPallets} p + {nobjelasPicoCajas} c ({current.noblejas} cajas)
              </span>
            </div>
          )}
        </div>

        {/* Vista previa del siguiente formato en la cola */}
        {next ? (
          <div className={cn("mb-6 p-4 rounded-2xl border space-y-3 text-left", goldMode ? "border-indigo-500/20 bg-indigo-950/20" : "border-indigo-200 bg-indigo-50/50")}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className={cn("text-[10px] font-black uppercase tracking-wider", goldMode ? "text-indigo-400" : "text-indigo-600")}>A continuación en la cola:</p>
              
              {transition === "salad-change" && (
                <div className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 border", goldMode ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-red-100 border-red-200 text-red-600")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", goldMode ? "bg-red-400" : "bg-red-500")} />
                  ⚠️ Cambio Ensalada
                </div>
              )}
              {transition === "box-change" && (
                <div className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 border", goldMode ? "bg-orange-500/15 border-orange-500/30 text-orange-400" : "bg-orange-100 border-orange-200 text-orange-600")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", goldMode ? "bg-orange-400" : "bg-orange-500")} />
                  ⚠️ Cambio Caja
                </div>
              )}
            </div>

            <h4 className={cn("text-base font-black leading-tight", goldMode ? "text-white" : "text-slate-900")}>
              {transition === "salad-change" ? (
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn("line-through text-xs", goldMode ? "text-white/30" : "text-slate-400")}>{current.saladName}</span>
                  <span className={goldMode ? "text-white" : "text-slate-900"}>➔</span>
                  <span className={goldMode ? "text-emerald-400" : "text-emerald-600"}>{next.saladName}</span>
                </span>
              ) : (
                next.saladName
              )}
            </h4>

            <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs", goldMode ? "text-white/60" : "text-slate-600")}>
              <div>
                📦 Caja:{" "}
                {transition === "box-change" ? (
                  <span className={cn("font-bold", goldMode ? "text-white" : "text-slate-900")}>
                    <span className={cn("line-through text-xs", goldMode ? "text-white/30" : "text-slate-400")}>{current.boxType}</span> ➔{" "}
                    <span className={goldMode ? "text-emerald-400" : "text-emerald-600"}>{next.boxType}</span>
                  </span>
                ) : (
                  <span className={cn("font-bold", goldMode ? "text-white" : "text-slate-900")}>{next.boxType}</span>
                )}
              </div>
              <div>🔢 Cantidad: <span className={cn("font-bold", goldMode ? "text-white" : "text-slate-900")}>{next.quantity}</span> cajas</div>
              {next.noblejas > 0 && (
                <div>🏢 Noblejas: <span className={cn("font-bold", goldMode ? "text-purple-400" : "text-purple-600")}>{next.noblejas}</span> c</div>
              )}
            </div>
          </div>
        ) : (
          <div className={cn("mb-6 p-4 rounded-2xl border text-center space-y-3", goldMode ? "border-emerald-500/20 bg-emerald-950/20" : "border-emerald-200 bg-emerald-50/50")}>
            <div>
              <p className={cn("text-[10px] font-black uppercase tracking-wider", goldMode ? "text-emerald-400" : "text-emerald-700")}>🏁 ¡Fin de la planificación!</p>
              <p className={cn("text-xs mt-1", goldMode ? "text-white/50" : "text-slate-500")}>¿Quieres añadir otra ensalada o formato para continuar produciendo?</p>
            </div>
            
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  handleCancel();
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("open-add-format-form"));
                  }
                }}
                className={cn("py-2.5 px-3 text-xs font-bold border rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1", goldMode ? "bg-purple-500/10 border-purple-500/25 hover:bg-purple-500/20 text-purple-300" : "bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-700")}
              >
                <span>➕</span>
                <span>Formato</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCancel();
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("open-add-salad-form"));
                  }
                }}
                className={cn("py-2.5 px-3 text-xs font-bold border rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1", goldMode ? "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-300" : "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700")}
              >
                <span>🥗</span>
                <span>Nueva Ensalada</span>
              </button>
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="space-y-3">
          <Button
            onClick={advanceToNext}
            disabled={!canAdvance}
            className="w-full h-16 text-base font-black bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-2xl shadow-lg shadow-emerald-500/30 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
            id="advance-next-btn"
          >
            {next ? "SÍ, PASAR AL SIGUIENTE" : "COMPLETAR Y VOLVER"}
          </Button>

          {currentQueueIndex > 0 && (
            <Button
              onClick={() => {
                handleCancel();
                jumpToQueueItem(currentQueueIndex - 1);
              }}
              variant="outline"
              className={cn("w-full h-12 text-sm font-bold border rounded-xl transition-colors cursor-pointer", goldMode ? "border-purple-500/20 bg-purple-500/5 text-purple-300 hover:bg-purple-500/10 hover:text-purple-200" : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:text-purple-800")}
            >
              ◀ VOLVER AL ANTERIOR (CORREGIR)
            </Button>
          )}

          <Button
            onClick={handleCancel}
            variant="outline"
            className={cn("w-full h-12 text-sm font-bold border rounded-xl transition-colors cursor-pointer", goldMode ? "border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800")}
            id="cancel-finish-btn"
          >
            {next ? "NO, MANTENER AQUÍ POR AHORA" : "MANUALMENTE DESPUÉS"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
