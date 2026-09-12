"use client";

import { useState } from "react";
import { useProductionStore } from "@/store/production-store";
import { calculateFormat, getActiveLote } from "@/types/types";
import type { QueueItem } from "@/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";
import { notifyWithUndo } from "@/lib/notifications";
import { syncQueueItems } from "@/lib/supabase-service";

interface ProductionQueueProps {
  editable?: boolean;
}

export function ProductionQueue({ editable = false }: ProductionQueueProps) {
  const {
    queue,
    currentQueueIndex,
    isProducing,
    reorderQueue,
    removeFromQueue,
    currentProgress,
    setEditingQueueItemId,
    goldMode,
    jumpToQueueItem,
  } = useProductionStore();

  const totalQueueBoxes = queue.reduce((sum, item) => sum + item.quantity, 0);

  const handleRemoveItem = async (index: number) => {
    const itemToRemove = queue[index];
    if (!itemToRemove) return;

    await removeFromQueue(index);

    notifyWithUndo(
      "Formato eliminado",
      `${itemToRemove.saladName} (${itemToRemove.boxType}) - ${itemToRemove.quantity} cajas`,
      async () => {
        const state = useProductionStore.getState();
        const currentQueue = [...state.queue];
        const targetIndex = Math.min(index, currentQueue.length);
        currentQueue.splice(targetIndex, 0, itemToRemove);

        const lineCode = state.activeLineCode;
        useProductionStore.setState({
          queue: currentQueue,
          lineStorage: {
            ...state.lineStorage,
            ...(lineCode && lineCode !== "ALL" ? {
              [lineCode]: {
                ...(state.lineStorage[lineCode] || {}),
                queue: currentQueue,
              }
            } : {})
          }
        });

        if (state.activeLineId) {
          await syncQueueItems(state.activeLineId, currentQueue);
        }
      }
    );
  };

  // Acordeón: colapsado por defecto durante producción, expandido en preparación
  const [isExpanded, setIsExpanded] = useState(!isProducing);

  // Reordenación con flechas para pantallas táctiles y ratón

  if (queue.length === 0) {
    return (
      <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-8 text-center">
        <p className="text-white/30 text-lg">
          No hay formatos en la cola
        </p>
        <p className="text-white/20 text-sm mt-1">
          Añade ensaladas para generar la cola
        </p>
      </div>
    );
  }

  const moveUp = (index: number) => {
    const minIndex = isProducing ? currentQueueIndex + 1 : 0;
    if (index > minIndex) {
      reorderQueue(index, index - 1);
    }
  };

  const moveDown = (index: number) => {
    const minIndex = isProducing ? currentQueueIndex + 1 : 0;
    if (index >= minIndex && index < queue.length - 1) {
      reorderQueue(index, index + 1);
    }
  };

  const pendingCount = isProducing
    ? queue.length - currentQueueIndex - 1
    : queue.length;
  const doneCount = isProducing ? currentQueueIndex : 0;

  return (
    <div className="space-y-2">
      {/* Cabecera clickable — acordeón */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-left group cursor-pointer select-none"
        id="queue-accordion-toggle"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider">
            Cola de producción ({queue.length})
          </h3>
          {isProducing && doneCount > 0 && (
            <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              {doneCount} hechos
            </span>
          )}
          {isProducing && pendingCount > 0 && (
            <span className="text-[10px] font-bold bg-white/5 text-white/30 border border-white/10 px-2 py-0.5 rounded-full">
              {pendingCount} pendientes
            </span>
          )}
        </div>
        <div
          className={cn(
            "w-7 h-7 rounded-lg border border-white/10 bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-200",
            isExpanded && "rotate-180"
          )}
          style={{ transition: "transform 0.25s ease, background 0.15s, color 0.15s" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {/* Lista colapsable */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isExpanded ? "opacity-100" : "max-h-0 opacity-0 pointer-events-none"
        )}
        style={isExpanded ? { maxHeight: "9999px" } : { maxHeight: "0px" }}
      >
        <div className="space-y-2 pt-1">
          {queue.map((item: QueueItem, index: number) => {
            const calc = calculateFormat({
              id: item.formatId,
              boxType: item.boxType,
              quantity: item.quantity,
              noblejas: item.noblejas,
              boxesPerPallet: item.boxesPerPallet,
            });

            const isActive = isProducing && index === currentQueueIndex;
            const isDone =
              isProducing &&
              (index < currentQueueIndex ||
                (index === currentQueueIndex && currentProgress?.finished));
            const isPending = isProducing && index > currentQueueIndex;

            // Detectar cambio respecto al anterior
            const prevItem = queue[index - 1];
            const activeLote = getActiveLote(queue, index);
            const isSaladChange =
              prevItem && prevItem.saladId !== item.saladId;
            const isBoxChange =
              prevItem &&
              prevItem.saladId === item.saladId &&
              prevItem.boxType !== item.boxType;
            const isLoteChange =
              prevItem &&
              (item.cambioLote || (item.lote && prevItem.lote !== item.lote));

            return (
              <div key={item.id}>
                {/* Indicador de cambio */}
                {index > 0 && (isSaladChange || isBoxChange || isLoteChange) && (
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 mb-1 text-xs font-semibold rounded-lg ${
                      isSaladChange
                        ? "bg-red-500/10 text-red-400 border border-red-500/20"
                        : isBoxChange
                        ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                        : "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    }`}
                  >
                    <span className={cn("w-2 h-2 rounded-full", isSaladChange ? "bg-red-400" : isBoxChange ? "bg-orange-400" : "bg-purple-400")} />
                    <span>
                      {isSaladChange
                        ? `Cambio: ${prevItem.saladName} → ${item.saladName}`
                        : isBoxChange
                        ? `Cambio: ${prevItem.boxType} → ${item.boxType}`
                        : `Cambio Lote: ${getActiveLote(queue, index - 1) || "Sin lote"} → ${activeLote}`}
                    </span>
                  </div>
                )}

                <div
                  onClick={() => {
                    if (isProducing && index !== currentQueueIndex) {
                      jumpToQueueItem(index);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 p-3 md:p-4 rounded-xl border transition-all select-none relative overflow-hidden",
                    isActive
                      ? "bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20"
                      : isDone
                      ? "bg-white/[0.01] border-white/5 opacity-60 hover:opacity-100 hover:bg-white/[0.03] cursor-pointer"
                      : item.saladName.toUpperCase().includes("PROMO")
                      ? "bg-amber-500/5 border-amber-500/25 shadow-[0_0_10px_rgba(245,158,11,0.05)] hover:border-amber-500/40 cursor-pointer"
                      : "bg-white/[0.02] border-white/10 hover:bg-white/[0.04] cursor-pointer"
                  )}
                >
                  {/* Flechas de reordenación */}
                  {editable && (!isProducing || isPending) && (
                    <div className="flex flex-col gap-1 mr-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => moveUp(index)}
                        disabled={index <= (isProducing ? currentQueueIndex + 1 : 0)}
                        className={cn(
                          "p-2 sm:p-3 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                        )}
                        title="Subir"
                      >
                        <ChevronUp className="w-6 h-6 sm:w-7 sm:h-7" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(index)}
                        disabled={index >= queue.length - 1}
                        className={cn(
                          "p-2 sm:p-3 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
                        )}
                        title="Bajar"
                      >
                        <ChevronDown className="w-6 h-6 sm:w-7 sm:h-7" />
                      </button>
                    </div>
                  )}

                  {/* Número */}
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isActive
                        ? "bg-emerald-500 text-white"
                        : isDone
                        ? "bg-white/10 text-white/30 line-through"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {isDone ? "OK" : index + 1}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-bold truncate flex items-center gap-1.5 flex-wrap ${
                        isDone
                          ? "text-white/30 line-through"
                          : isActive
                          ? "text-emerald-400"
                          : "text-white"
                      }`}
                    >
                      <span>🥗 {item.saladName}</span>
                      {item.saladName.toUpperCase().includes("PROMO") && !isDone && (
                        <span className="inline-flex items-center bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse shrink-0">
                          FILM PROMO
                        </span>
                      )}
                      <span className="text-white/30 mx-0.5">—</span>
                      <span
                        className={
                          isDone ? "text-white/20" : "text-white/60"
                        }
                      >
                        📦 {item.boxType}
                      </span>
                      {item.codigo10e && (
                        <span className={cn(
                          "ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1",
                          item.noblejas > 0 
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" 
                            : "bg-white/5 text-white/40 border border-white/10"
                        )}>
                          🏷️ {item.codigo10e} {item.noblejas > 0 && "· 💜 Noblejas"}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-white/30 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>
                        <span className={cn("font-black", isDone ? "text-white/20" : "text-white/50")}>📦 {item.quantity} cajas</span> ({calc.pallets}p + {calc.pico}c)
                        {item.noblejas > 0 && ` | Nob: ${item.noblejas}c`}
                      </span>
                      {activeLote && (
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-md",
                          item.cambioLote
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/35 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                            : "bg-white/5 text-white/40 border border-white/5"
                        )}>
                          🏷️ Lote: {activeLote}
                        </span>
                      )}
                    </p>
                    {goldMode && item.note && (
                      <p className="text-[11px] text-amber-300/80 mt-1 font-semibold flex items-center gap-1">
                        <span>Alerta:</span>
                        <span>{item.note}</span>
                      </p>
                    )}
                  </div>

                  {/* Controles de edición */}
                  {editable && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* Editar - disponible si no está completado */}
                      {(!isProducing || !isDone) && (
                        <button
                          type="button"
                          onClick={() => setEditingQueueItemId(item.id)}
                          className="h-8 px-2 flex items-center justify-center text-xs font-bold text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                          id={`queue-edit-${index}`}
                          title="Editar formato"
                        >
                          ✏️ Editar
                        </button>
                      )}

                      {/* Eliminación */}
                      {(!isProducing || isPending) && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="h-8 w-8 flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                          id={`queue-remove-${index}`}
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}

                  {/* Indicador activo */}
                  {isActive && !currentProgress?.finished && (
                    <div className="flex-shrink-0">
                      <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Total de cajas planificadas al fondo de la cola */}
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-bold text-white/40 px-2 select-none uppercase tracking-wider">
            <span>Total Planificado:</span>
            <span className="text-sm font-black text-emerald-400 font-mono">
              {totalQueueBoxes.toLocaleString()} cajas
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
