"use client";

import { useProductionStore } from "@/store/production-store";
import { getTransitionType, calculateFormat, getTodayLabelColor, getActiveLote } from "@/types/types";
import type { QueueItem } from "@/types/types";
import { Clock } from "./Clock";
import { Calculator, Sun, Moon, Maximize, Minimize, Globe, Tv, LogOut, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface ProductionHeaderProps {
  onOpenLabelsModal: () => void;
}

export function ProductionHeader({ onOpenLabelsModal }: ProductionHeaderProps) {
  const {
    queue,
    currentQueueIndex,
    showSplitView,
    toggleSplitView,
    toggleCalculator,
    highContrastMode,
    toggleHighContrastMode,
    goldMode,
    toggleGoldMode,
    ambientMode,
    toggleAmbientMode,
    jumpToQueueItem,
    logout,
    toggleScreenLock,
    customDayLabelIndex,
    activeLineCode,
    setActiveLineCode,
  } = useProductionStore();

  const current: QueueItem | undefined = queue[currentQueueIndex];
  const next: QueueItem | undefined = queue[currentQueueIndex + 1];
  const transition = getTransitionType(current, next);

  const todayLabel = getTodayLabelColor(customDayLabelIndex);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (!current) return null;

  // Calcular math del formato siguiente
  const calcNext = next
    ? calculateFormat({
        id: next.formatId,
        boxType: next.boxType,
        quantity: next.quantity,
        noblejas: next.noblejas,
        boxesPerPallet: next.boxesPerPallet,
      })
    : null;

  // Colores de la barra según transición
  const transitionColors = {
    same: "bg-black/40 border-white/10",
    "box-change": "bg-orange-500/10 border-orange-500/20",
    "salad-change": "bg-red-500/10 border-red-500/20",
    "lote-change": "bg-purple-500/10 border-purple-500/20",
  };

  const transitionDot = {
    same: "bg-emerald-400",
    "box-change": "bg-orange-400",
    "salad-change": "bg-red-400",
    "lote-change": "bg-purple-400",
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl transition-all duration-300",
        goldMode ? "border-amber-500/25 bg-[#141006]/85" : transitionColors[transition]
      )}
    >
      <div className="max-w-5xl mx-auto px-4 py-2">
        {/* Fila principal */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          
          {/* Fila Superior (Mobile): Info Ensalada y Reloj */}
          <div className="flex items-center justify-between w-full md:w-auto gap-2.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div
                className={cn("w-2.5 h-2.5 rounded-full animate-pulse shrink-0", transitionDot[transition])}
              />
              {/* Logo KPI clickable para alternar temas (Florette / Premium Gold) */}
              <button
                onClick={toggleGoldMode}
                className="w-7 h-7 rounded-lg overflow-hidden border border-emerald-500/30 bg-black/40 shrink-0 cursor-pointer hover:scale-110 active:scale-95 transition-all relative shadow-sm"
                title="Cambiar tema de la aplicación (Florette / Premium Gold)"
                type="button"
              >
                {goldMode && (
                  <span className="absolute inset-0 bg-amber-500/30 animate-pulse pointer-events-none" />
                )}
                <img src="/images/logo.png" className="w-full h-full object-cover" alt="KPI logo" />
              </button>
              
              <h1 className="text-base sm:text-lg md:text-xl font-black tracking-wide flex items-center gap-1.5 flex-wrap text-foreground">
                <span className="shrink-0">🥗</span>
                <span className={cn("truncate max-w-[100px] xs:max-w-[160px] sm:max-w-none shrink-0", goldMode && "text-gold-gradient")}>
                  {current.saladName}
                </span>
                <span className="opacity-30 font-normal shrink-0">|</span>
                <span className="shrink-0">📦</span>
                <span className={cn("font-bold truncate max-w-[70px] xs:max-w-[110px] sm:max-w-none shrink-0", goldMode ? "text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {current.boxType}
                </span>
                {goldMode && getActiveLote(queue, currentQueueIndex) && (
                  <span className="text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/35 px-1.5 py-0.5 rounded-lg shrink-0">
                    🏷️ Lote: {getActiveLote(queue, currentQueueIndex)}
                  </span>
                )}
                {goldMode ? (
                  <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)] tracking-wider uppercase shrink-0">
                    👑 GOLD
                  </span>
                ) : (
                  <span className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm tracking-wider uppercase shrink-0">
                    🌿 FLORETTE
                  </span>
                )}
              </h1>

              {/* Etiqueta de Hoy compacta en Producción */}
              <button
                onClick={onOpenLabelsModal}
                className={cn(
                  "ml-auto sm:ml-2 px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-black border uppercase flex items-center gap-1 transition-all shadow-md cursor-pointer shrink-0",
                  todayLabel.bgClass,
                  todayLabel.textClass,
                  todayLabel.borderClass
                )}
                title="Ver colores de etiquetas semanales"
              >
                <div className={cn("w-1.5 h-1.5 rounded-full border border-black/95 shadow-[0_0_2px_rgba(0,0,0,0.6)]", todayLabel.dotClass, "animate-pulse")} />
                <span className="opacity-75">Hoy:</span>
                <span>{todayLabel.colorName}</span>
              </button>
            </div>

            {/* Reloj visible en móviles */}
            <div className="md:hidden shrink-0">
              <Clock />
            </div>
          </div>

          {/* Fila Inferior (Mobile) / Fila Derecha (Desktop): Botones de control y Navegación */}
          <div className="flex items-center justify-between md:justify-end gap-2.5 w-full md:w-auto border-t border-black/5 dark:border-white/5 pt-1.5 md:border-t-0 md:pt-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Selector Rápido de Línea (K00, K01, K02, K03, Fábrica) */}
              <div className="flex items-center bg-black/40 border border-white/10 rounded-lg p-0.5 shrink-0 gap-0.5">
                {(["K00", "K01", "K02", "K03"] as const).map((code) => (
                  <button
                    key={code}
                    onClick={() => setActiveLineCode(code)}
                    className={cn(
                      "px-1.5 py-0.5 rounded-md text-[10px] font-black transition-all cursor-pointer",
                      activeLineCode === code
                        ? goldMode 
                          ? "bg-amber-500 text-black shadow-sm" 
                          : "bg-emerald-500 text-white shadow-sm"
                        : "text-white/40 hover:text-white hover:bg-white/5"
                    )}
                    title={`Cambiar a Línea ${code}`}
                    type="button"
                  >
                    {code}
                  </button>
                ))}
                <button
                  onClick={() => setActiveLineCode("ALL")}
                  className={cn(
                    "px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-0.5",
                    activeLineCode === "ALL"
                      ? "bg-purple-500 text-white shadow-sm"
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  )}
                  title="Ver Monitor Multilínea (Dashboard)"
                  type="button"
                >
                  Dashboard
                </button>
              </div>

              {/* Botón Selector de Tema (Florette / Premium) */}
              <button
                onClick={toggleGoldMode}
                className={cn(
                  "h-8 px-2 border rounded-lg cursor-pointer transition-all active:scale-95 flex items-center gap-1 text-[10px] font-black shrink-0 shadow-sm",
                  goldMode
                    ? "border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                    : "border-emerald-600/30 bg-emerald-600 text-white hover:bg-emerald-700"
                )}
                title="Haz clic para alternar entre el modo Florette y Premium Gold"
                type="button"
              >
                {goldMode ? "Gold" : "Florette"}
              </button>

              {/* Calculadora (Icono Profesional) */}
              <button
                onClick={toggleCalculator}
                className="h-8 w-8 border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white rounded-lg cursor-pointer transition-all active:scale-95 flex items-center justify-center shrink-0"
                id="calc-toggle-btn-prod"
                title="Calculadora"
                type="button"
              >
                <Calculator className="w-3.5 h-3.5" />
              </button>

              {/* Modo Ambiente (Pantalla Completa TV) - Disponible en Florette y Gold */}
              <button
                onClick={toggleAmbientMode}
                className={cn(
                  "h-8 w-8 border backdrop-blur-sm rounded-lg cursor-pointer transition-all active:scale-95 flex items-center justify-center shrink-0 shadow-sm",
                  ambientMode
                    ? goldMode
                      ? "bg-amber-500 text-black border-amber-400 font-bold"
                      : "bg-emerald-600 text-white border-emerald-500 font-bold"
                    : goldMode
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                    : "border-emerald-600/30 bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/20"
                )}
                title="Modo Ambientador / Pantalla de Fábrica"
                type="button"
              >
                <Tv className="w-3.5 h-3.5" />
              </button>

              {/* Pantalla Completa - Oculto en móviles */}
              <button
                onClick={toggleFullscreen}
                className="hidden sm:flex h-8 w-8 border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white rounded-lg cursor-pointer transition-all active:scale-95 items-center justify-center shrink-0"
                title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                type="button"
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              </button>

              {/* Cerrar Sesión */}
              <button
                onClick={logout}
                className="h-8 w-8 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 backdrop-blur-sm text-red-400 rounded-lg cursor-pointer transition-all active:scale-95 flex items-center justify-center shrink-0"
                title="Cerrar sesión"
                type="button"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {currentQueueIndex > 0 && (
                <button
                  type="button"
                  onClick={() => jumpToQueueItem(currentQueueIndex - 1)}
                  className="h-8 px-2 border border-white/10 bg-white/5 hover:bg-white/10 hover:text-emerald-400 text-white rounded-lg cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1 text-[10px] font-bold shrink-0"
                  title="Volver al formato anterior"
                >
                  Ant.
                </button>
              )}
              {currentQueueIndex < queue.length - 1 && (
                <button
                  type="button"
                  onClick={() => jumpToQueueItem(currentQueueIndex + 1)}
                  className="h-8 px-2 border border-white/10 bg-white/5 hover:bg-white/10 hover:text-emerald-400 text-white rounded-lg cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1 text-[10px] font-bold shrink-0"
                  title="Avanzar al siguiente formato"
                >
                  Sig.
                </button>
              )}
              <span className="text-[10px] text-white/35 font-mono bg-white/5 px-2 py-0.5 rounded-md shrink-0">
                {currentQueueIndex + 1}/{queue.length}
              </span>
              
              {/* Reloj visible en desktop */}
              <div className="hidden md:block">
                <Clock />
              </div>
            </div>
          </div>
        </div>

        {/* Siguiente formato — usando calcNext (datos del SIGUIENTE) */}
        {next && calcNext && (() => {
          const nextNobPallets = Math.floor(next.noblejas / next.boxesPerPallet);
          const nextNobPico = next.noblejas % next.boxesPerPallet;
          return (
            <div className="mt-2 flex items-center gap-2 text-xs flex-wrap font-medium">
              <span className="text-white/35 uppercase tracking-wider">SIGUIENTE:</span>
              <span
                className={cn(
                  "font-bold flex items-center gap-1.5 flex-wrap",
                  transition === "salad-change"
                    ? "text-red-400"
                    : transition === "box-change"
                    ? "text-orange-400"
                    : "text-emerald-400"
                )}
              >
                {transition === "salad-change" && (
                  <span>{next.saladName} |</span>
                )}
                <span>{next.boxType}</span>
                <span className="text-white/70">· {next.quantity} cajas</span>
                <span className="text-white/40 font-normal font-mono">
                  ({calcNext.pallets}p + {calcNext.pico}c)
                </span>
                {next.noblejas > 0 && (
                  <span className="flex items-center gap-1 text-purple-400 font-bold bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-lg ml-1">
                    Nob: {next.noblejas} cajas ({nextNobPallets}p + {nextNobPico}c)
                  </span>
                )}
                {goldMode && getActiveLote(queue, currentQueueIndex + 1) && (
                  <span className="flex items-center gap-1 text-purple-400 font-bold bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-lg ml-1">
                    Lote: {getActiveLote(queue, currentQueueIndex + 1)}
                  </span>
                )}
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
