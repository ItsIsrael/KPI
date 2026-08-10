"use client";

import { useEffect, useState } from "react";
import { useProductionStore } from "@/store/production-store";
import { getTransitionType, calculateFormat, getActiveLote } from "@/types/types";
import type { QueueItem } from "@/types/types";
import { cn } from "@/lib/utils";

export function TransitionBanner() {
  const {
    queue,
    currentQueueIndex,
    showTransitionBanner,
    hideTransitionBanner,
    goldMode,
  } = useProductionStore();

  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  const current: QueueItem | undefined = queue[currentQueueIndex];
  const previous: QueueItem | undefined = queue[currentQueueIndex - 1];
  const transition = getTransitionType(previous, current);

  // Calcular datos del NUEVO formato
  const calcNew = current
    ? calculateFormat({
        id: current.formatId,
        boxType: current.boxType,
        quantity: current.quantity,
        noblejas: current.noblejas,
        boxesPerPallet: current.boxesPerPallet,
      })
    : null;

  const [prevShowBanner, setPrevShowBanner] = useState(false);
  if (showTransitionBanner !== prevShowBanner) {
    setPrevShowBanner(showTransitionBanner);
    if (showTransitionBanner && current && previous) {
      setVisible(true);
      setPhase("in");
    }
  }

  useEffect(() => {
    if (visible) {
      setPhase("in");
      // Auto-cerrar a los 2.5s
      const holdTimer = setTimeout(() => setPhase("hold"), 300);
      const outTimer = setTimeout(() => {
        setPhase("out");
      }, 2500);
      const closeTimer = setTimeout(() => {
        setVisible(false);
        hideTransitionBanner();
      }, 3000);

      return () => {
        clearTimeout(holdTimer);
        clearTimeout(outTimer);
        clearTimeout(closeTimer);
      };
    }
  }, [visible, hideTransitionBanner]);

  const handleClose = () => {
    setPhase("out");
    setTimeout(() => {
      setVisible(false);
      hideTransitionBanner();
    }, 400);
  };

  if (!visible || !current || !previous) return null;

  const config = {
    "salad-change": {
      emoji: "🥗",
      label: "CAMBIO DE ENSALADA",
      accent: "from-red-500/40 via-red-600/20 to-transparent",
      border: "border-red-500/50",
      glow: "shadow-red-500/30",
      badgeBg: "bg-red-500/20 border-red-500/40 text-red-300",
      barColor: "bg-red-400",
      dot: "bg-red-400",
    },
    "box-change": {
      emoji: "📦",
      label: "CAMBIO DE CAJA",
      accent: "from-orange-500/40 via-orange-600/20 to-transparent",
      border: "border-orange-500/50",
      glow: "shadow-orange-500/30",
      badgeBg: "bg-orange-500/20 border-orange-500/40 text-orange-300",
      barColor: "bg-orange-400",
      dot: "bg-orange-400",
    },
    "lote-change": {
      emoji: "🔄",
      label: "CAMBIO DE LOTE",
      accent: "from-purple-500/40 via-purple-600/20 to-transparent",
      border: "border-purple-500/50",
      glow: "shadow-purple-500/30",
      badgeBg: "bg-purple-500/20 border-purple-500/40 text-purple-300",
      barColor: "bg-purple-400",
      dot: "bg-purple-400",
    },
    same: {
      emoji: "⏭️",
      label: "SIGUIENTE REFERENCIA",
      accent: "from-emerald-500/40 via-emerald-600/20 to-transparent",
      border: "border-emerald-500/50",
      glow: "shadow-emerald-500/30",
      badgeBg: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
      barColor: "bg-emerald-400",
      dot: "bg-emerald-400",
    },
  };

  const c = config[transition];

  return (
    <div
      className={cn("fixed inset-0 z-[150] flex items-center justify-center backdrop-blur-xl cursor-pointer", goldMode ? "bg-black/85" : "bg-emerald-50/85")}
      onClick={handleClose}
      style={{
        opacity: phase === "out" ? 0 : 1,
        transition: "opacity 0.4s ease",
      }}
    >
      {/* Panel central */}
      <div
        className={cn(
          "relative border-2 rounded-3xl p-8 md:p-12 w-full max-w-2xl mx-4 shadow-2xl overflow-hidden transition-all duration-300",
          goldMode
            ? "bg-[#0c0903]/95 border-amber-500/40 shadow-amber-500/20 shadow-[0_0_50px_rgba(245,158,11,0.15)]"
            : `bg-white/95 border-emerald-200 shadow-[0_0_40px_rgba(16,185,129,0.1)] bg-gradient-to-br ${c.accent} ${c.glow}`
        )}
        style={{
          transform: phase === "in" ? "scale(0.85)" : "scale(1)",
          opacity: phase === "in" ? 0 : 1,
          transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fondo decorativo */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={cn("absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10 blur-2xl", goldMode ? "bg-amber-400" : c.dot)} />
          <div className={cn("absolute -bottom-4 -left-4 w-32 h-32 rounded-full opacity-10 blur-2xl", goldMode ? "bg-amber-400" : c.dot)} />
        </div>

        {/* Badge tipo de cambio */}
        <div className="relative text-center">
          <span className={cn(
            "inline-block text-[10px] font-black uppercase tracking-[0.25em] border rounded-full px-3 py-1 mb-4",
            goldMode
              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
              : c.badgeBg
          )}>
            {c.label}
          </span>


          {/* Nuevo formato — destacado */}
          <div className={cn(
            "border rounded-2xl p-6 mb-5 transition-all space-y-3",
            goldMode
              ? "bg-amber-500/5 border-amber-500/20 max-w-lg mx-auto"
              : "bg-white/10 border-white/15"
          )}>
            {/* Salad Name en Grande */}
            <h2 className={cn("font-black leading-tight text-3xl sm:text-4xl md:text-5xl uppercase tracking-wide", goldMode ? "text-white" : "text-emerald-900")}>
              {current.saladName}
            </h2>
            
            {/* Box Type en Grande */}
            <p className={cn("font-black text-2xl sm:text-3xl md:text-4xl uppercase tracking-wide", goldMode ? "text-amber-400" : "text-emerald-400")}>
              📦 {current.boxType}
            </p>

            {/* Quantity en Grande */}
            <p className="font-black text-amber-400 text-3xl sm:text-4xl md:text-5xl font-mono tracking-wide">
              {current.quantity} CAJAS
            </p>

            {getActiveLote(queue, currentQueueIndex) && (
              <p className={cn("font-bold mt-1", goldMode ? "text-purple-300 text-base md:text-lg" : "text-purple-300 text-sm")}>
                🔄 Lote: {getActiveLote(queue, currentQueueIndex)}
              </p>
            )}
            
            {calcNew && (
              <div className={cn("flex justify-center gap-4 mt-2", goldMode ? "text-base" : "text-sm")}>
                <span className={cn(goldMode ? "text-white/50" : "text-emerald-700/60")}>
                  <span className={cn("font-bold", goldMode ? "text-amber-400" : "text-emerald-600")}>{calcNew.pallets}</span>p
                </span>
                <span className={cn(goldMode ? "text-white/20" : "text-emerald-700/30")}>·</span>
                <span className={cn(goldMode ? "text-white/50" : "text-emerald-700/60")}>
                  <span className="text-orange-400 font-bold">{calcNew.pico}</span>c pico
                </span>
                {current.noblejas > 0 && (
                  <>
                    <span className={cn(goldMode ? "text-white/20" : "text-emerald-700/30")}>·</span>
                    <span className={cn(goldMode ? "text-white/50" : "text-emerald-700/60")}>
                      <span className="text-purple-400 font-bold">{current.noblejas}</span>c Nob
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Barra de progreso countdown */}
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full", goldMode ? "bg-amber-500" : c.barColor)}
              style={{ animation: "progress-load 2.5s linear forwards" }}
            />
          </div>

          <p className={cn("text-[10px] uppercase tracking-wider mt-3 font-semibold animate-pulse", goldMode ? "text-white/25" : "text-emerald-700/50")}>Iniciando automáticamente...</p>
        </div>
      </div>
    </div>
  );
}
