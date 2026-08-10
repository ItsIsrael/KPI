"use client";

import { useState, useEffect, useRef } from "react";
import { useProductionStore } from "@/store/production-store";
import { calculateFormat, DAY_LABEL_COLORS, getTodayLabelColor, getSaladsPerBox, getActiveLote, getTransitionType } from "@/types/types";
import type { Salad } from "@/types/types";
import { Button } from "@/components/ui/button";
import { Clock } from "@/components/Clock";
import { Calculator } from "@/components/Calculator";
import { SaladForm } from "@/components/SaladForm";
import { ProductionHeader } from "@/components/ProductionHeader";
import { ProductionCard } from "@/components/ProductionCard";
import { ProductionControls } from "@/components/ProductionControls";
import { FinishFormatDialog } from "@/components/FinishFormatDialog";
import { ProductionQueue } from "@/components/ProductionQueue";
import { EditQueueItemDialog } from "@/components/EditQueueItemDialog";
import { TransitionBanner } from "@/components/TransitionBanner";
import { cn } from "@/lib/utils";
import { Calculator as CalcIcon, Maximize, Minimize, Trash2, Play, History, LogOut } from "lucide-react";
import { LoginScreen } from "@/components/LoginScreen";
import { ScreenLockOverlay } from "@/components/ScreenLockOverlay";
import { MultiLineDashboard } from "@/components/MultiLineDashboard";
import { QuickQueueBuilder } from "@/components/QuickQueueBuilder";
import { subscribeToLineChanges } from "@/lib/supabase-service";
import { useTabClock } from "@/hooks/useTabClock";

export default function Home() {
  useTabClock();
  const {
    salads,
    queue,
    currentQueueIndex,
    isProducing,
    currentProgress,
    removeSalad,
    buildQueue,
    resetProduction,
    showSplitView,
    iframeUrl,
    toggleSplitView,
    setIframeUrl,
    toggleCalculator,
    highContrastMode,
    toggleHighContrastMode,
    goldMode,
    toggleGoldMode,
    ambientMode,
    toggleAmbientMode,
    history,
    clearHistory,
    templates,
    addTemplate,
    removeTemplate,
    loadTemplate,
    reproduceFromHistory,
    wipeAllData,
    clearQueueAndSalads,
    isLoggedIn,
    logout,
    advanceToNext,
    customDayLabelIndex,
    setCustomDayLabelIndex,
    activeLineCode,
    activeLineId,
    setActiveLineCode,
    loadActiveLineData,
  } = useProductionStore();

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"standard" | "add-format" | "add-salad">("standard");
  const [editingSalad, setEditingSalad] = useState<Salad | null>(null);
  const [urlInput, setUrlInput] = useState(iframeUrl);
  const [showWipeModal, setShowWipeModal] = useState(false);

  // Modal de colores de etiquetas semanales
  const [showLabelsModal, setShowLabelsModal] = useState(false);

  // Estados para la pantalla de carga (evitar flash en hidratación)
  const [isLoading, setIsLoading] = useState(true);
  const [goldLoading, setGoldLoading] = useState(false);

  // Ancho del panel izquierdo en porcentaje
  const [splitWidthPercent, setSplitWidthPercent] = useState(50);
  const resizing = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const todayLabel = getTodayLabelColor(customDayLabelIndex);

  // Sincronizar urlInput en render (React 19)
  const [prevIframeUrl, setPrevIframeUrl] = useState(iframeUrl);
  if (iframeUrl !== prevIframeUrl) {
    setPrevIframeUrl(iframeUrl);
    setUrlInput(iframeUrl);
  }

  // Efecto para controlar la pantalla de carga inicial y detectar Gold Mode persistido
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("salad-production-storage");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.state?.goldMode) {
            setTimeout(() => {
              setGoldLoading(true);
            }, 0);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  // Efecto para sincronizar datos de la línea activa y suscripción Realtime
  useEffect(() => {
    loadActiveLineData();
  }, [activeLineCode, loadActiveLineData]);

  useEffect(() => {
    if (!activeLineId || activeLineCode === "ALL") return;
    const unsubscribe = subscribeToLineChanges(activeLineId, () => {
      loadActiveLineData();
    });
    return () => unsubscribe();
  }, [activeLineId, activeLineCode, loadActiveLineData]);

  // Escuchar cambios de fullscreen
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Escuchar eventos globales para abrir formularios durante producción
  useEffect(() => {
    const handleOpenAddFormat = () => {
      setFormMode("add-format");
      setShowForm(true);
    };
    const handleOpenAddSalad = () => {
      setFormMode("add-salad");
      setShowForm(true);
    };

    window.addEventListener("open-add-format-form", handleOpenAddFormat);
    window.addEventListener("open-add-salad-form", handleOpenAddSalad);
    return () => {
      window.removeEventListener("open-add-format-form", handleOpenAddFormat);
      window.removeEventListener("open-add-salad-form", handleOpenAddSalad);
    };
  }, []);

  // Gestores de cambio de tamaño del Split View
  useEffect(() => {
    const handleMove = (clientX: number) => {
      if (!resizing.current) return;
      const pct = (clientX / window.innerWidth) * 100;
      if (pct > 25 && pct < 75) {
        setSplitWidthPercent(pct);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };

    const stopResize = () => {
      resizing.current = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", stopResize);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stopResize);
    };
  }, []);

  const handleStartResize = (e: React.MouseEvent | React.TouchEvent) => {
    resizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleNewSalad = () => {
    setEditingSalad(null);
    setShowForm(true);
  };

  const handleEditSalad = (salad: Salad) => {
    setEditingSalad(salad);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingSalad(null);
    setFormMode("standard");
  };

  const handleBuildAndStart = () => {
    buildQueue();
    setTimeout(() => {
      useProductionStore.getState().startProduction();
    }, 50);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let formattedUrl = urlInput.trim();
    if (!formattedUrl) return;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }
    setIframeUrl(formattedUrl);
    setUrlInput(formattedUrl);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Efecto global para auto-avanzar cuando el formato en producción se completa
  const activeFormat = queue[currentQueueIndex];
  const activeCalc = activeFormat ? calculateFormat({
    id: activeFormat.formatId,
    boxType: activeFormat.boxType,
    quantity: activeFormat.quantity,
    noblejas: activeFormat.noblejas,
    boxesPerPallet: activeFormat.boxesPerPallet,
  }) : null;

  const activeNoblejasComplete = activeFormat && currentProgress
    ? (!activeFormat.noblejas || currentProgress.noblejasCompleted)
    : false;

  const activeMilagroComplete = activeFormat && currentProgress && activeCalc
    ? (currentProgress.completedPallets >= activeCalc.pallets && (activeCalc.pico === 0 || currentProgress.picoCompleted))
    : false;

  const activeCanFinalize = activeNoblejasComplete && activeMilagroComplete;

  useEffect(() => {
    if (isProducing && currentProgress && activeCanFinalize && !currentProgress.finished && !currentProgress.declinedAutoAdvance) {
      advanceToNext();
    }
  }, [isProducing, activeCanFinalize, currentProgress, advanceToNext]);

  // Calcular KPIs globales
  const totalBoxes = salads.reduce(
    (sum, s) => sum + s.formats.reduce((fs, f) => fs + f.quantity, 0),
    0
  );
  const totalPallets = salads.reduce(
    (sum, s) =>
      sum + s.formats.reduce((fs, f) => fs + calculateFormat(f).pallets, 0),
    0
  );
  const totalFormats = salads.reduce((sum, s) => sum + s.formats.length, 0);

  // ===== MODO PRODUCCIÓN =====
  const renderProductionContent = () => (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <ProductionHeader onOpenLabelsModal={() => setShowLabelsModal(true)} />
      <div className="flex-1 max-w-2xl mx-auto w-full px-3 py-2 space-y-2 overflow-y-auto">

        <ProductionCard />
        <ProductionControls />
        
        {/* Acciones rápidas para la cola activa */}
        <div className="grid grid-cols-2 gap-2 pb-1 pt-0.5">
          <Button
            onClick={() => {
              setFormMode("add-format");
              setShowForm(true);
            }}
            className={cn("h-11 text-xs font-black border rounded-xl transition-all active:scale-[0.98] cursor-pointer", goldMode ? "bg-purple-500/10 border-purple-500/25 hover:bg-purple-500/20 text-purple-300" : "bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-700")}
          >
            ➕ Añadir Formato
          </Button>
          <Button
            onClick={() => {
              setFormMode("add-salad");
              setShowForm(true);
            }}
            className={cn("h-11 text-xs font-black border rounded-xl transition-all active:scale-[0.98] cursor-pointer", goldMode ? "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20 text-emerald-300" : "bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-700")}
          >
            🥗 Nueva Ensalada
          </Button>
        </div>

        <ProductionQueue editable />
        {/* Botón de emergencia */}
        <div className="pb-2">
          <Button
            onClick={resetProduction}
            className="w-full h-12 text-sm font-bold bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white shadow-lg shadow-red-500/20 rounded-xl transition-all active:scale-[0.98]"
            id="reset-production-btn"
          >
            ⏹ Detener producción
          </Button>
        </div>
      </div>
      <FinishFormatDialog />
    </div>
  );

  // ===== MODO PREPARACIÓN =====
  const renderPreparationContent = () => (
    <div className="flex-1 flex flex-col min-h-screen overflow-y-auto">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/20 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Logo Custom Generado clickable for Gold Mode EE */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={toggleGoldMode}
                className="w-9 h-9 rounded-xl overflow-hidden border border-emerald-500/30 bg-black/40 cursor-pointer hover:scale-110 active:scale-95 transition-all relative group shadow-sm"
                title="Cambiar tema de la aplicación (Florette / Premium Gold)"
                type="button"
              >
                {goldMode && (
                  <span className="absolute inset-0 bg-amber-500/30 animate-pulse pointer-events-none" />
                )}
                <img src="/images/logo.png" className="w-full h-full object-cover" alt="KPI logo" />
              </button>
              <div>
                <h1 className="text-xl font-black tracking-tight leading-none flex items-center gap-1.5 text-foreground">
                  <span className={cn(goldMode && "text-gold-gradient")}>KPI</span>
                  {goldMode ? (
                    <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.4)] tracking-wide uppercase shrink-0">
                      GOLD
                    </span>
                  ) : (
                    <span className="bg-emerald-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-sm tracking-wide uppercase shrink-0">
                      FLORETTE
                    </span>
                  )}
                </h1>
                <p className={cn("text-[9px] font-bold uppercase tracking-[0.12em] leading-none mt-1 animate-pulse", goldMode ? "text-amber-400/80" : "text-emerald-700 dark:text-emerald-400")}>
                  {goldMode ? "EDICION PREMIUM" : "CONTROL DE PRODUCCION"}
                </p>
              </div>
            </div>

            {/* Etiqueta de Hoy compacta */}
            <button
              onClick={() => setShowLabelsModal(true)}
              className={cn(
                "ml-1.5 md:ml-3 px-2.5 py-1 rounded-xl text-[10px] md:text-xs font-black border uppercase flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer",
                todayLabel.bgClass,
                todayLabel.textClass,
                todayLabel.borderClass
              )}
              title="Ver colores de etiquetas semanales"
            >
              <div className={cn("w-2 h-2 rounded-full border border-black/95 shadow-[0_0_2px_rgba(0,0,0,0.6)]", todayLabel.dotClass, "animate-pulse")} />
              <span className="opacity-75 font-bold">Hoy:</span>
              <span>{todayLabel.colorName}</span>
            </button>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Selector Rápido de Línea (K00, K01, K02, K03, Fábrica) */}
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-1 gap-1 shrink-0">
              {(["K00", "K01", "K02", "K03"] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => setActiveLineCode(code)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-xs font-black transition-all cursor-pointer",
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
                  "px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                  activeLineCode === "ALL"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-white/40 hover:text-white hover:bg-white/5"
                )}
                title="Ver todas las líneas (Vista Fábrica)"
                type="button"
              >
                <span>Fábrica</span>
              </button>
            </div>

            {/* Selector de Tema (Florette / Gold) */}
            <button
              onClick={toggleGoldMode}
              className={cn(
                "h-10 px-3 border rounded-xl cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 text-xs font-black shrink-0 shadow-sm",
                goldMode
                  ? "border-amber-500/40 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                  : "border-emerald-600/30 bg-emerald-600 text-white hover:bg-emerald-700"
              )}
              title="Haz clic para cambiar entre el tema Florette y Premium Gold"
              type="button"
            >
              {goldMode ? "Gold" : "Florette"}
            </button>

            {/* Pantalla completa */}
            <button
              onClick={toggleFullscreen}
              className="h-10 w-10 border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center"
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              type="button"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            {/* Calculadora */}
            <button
              onClick={toggleCalculator}
              className="h-10 w-10 border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-sm text-white rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center"
              id="calc-toggle-btn-prep"
              title="Calculadora"
              type="button"
            >
              <CalcIcon className="w-4 h-4" />
            </button>

            {/* Cerrar Sesión */}
            <button
              onClick={logout}
              className="h-10 w-10 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 backdrop-blur-sm text-red-400 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center animate-fade-in"
              title="Cerrar sesión"
              type="button"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <Clock />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-6 flex-1">

        {/* KPI Dashboard */}
        {salads.length > 0 && (
          <section className="grid grid-cols-3 gap-3">
            <div className="glass-card rounded-2xl p-4 text-center">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-1">Ensaladas</p>
              <p className="text-3xl font-black text-white">{salads.length}</p>
              <p className="text-[10px] text-white/20 mt-0.5">{totalFormats} formatos</p>
            </div>
            <div className="glass-card rounded-2xl p-4 text-center">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-1">Total Cajas</p>
              <p className="text-3xl font-black text-emerald-400">{totalBoxes.toLocaleString()}</p>
              <p className="text-[10px] text-emerald-400/30 mt-0.5">unidades</p>
            </div>
            <div className="glass-card rounded-2xl p-4 text-center">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-1">Total Palets</p>
              <p className="text-3xl font-black text-teal-400">{totalPallets}</p>
              <p className="text-[10px] text-teal-400/30 mt-0.5">estimados</p>
            </div>
          </section>
        )}



        {/* Formulario Rápido de Cola para Operarios */}
        <QuickQueueBuilder goldMode={goldMode} />

        {/* Botón nueva ensalada completa / avanzada */}
        <div className="flex justify-between items-center pt-1">
          <span className="text-xs text-white/40 font-semibold">O crear lote complejo con múltiples formatos:</span>
          <Button
            onClick={handleNewSalad}
            variant="outline"
            className="h-10 px-4 text-xs font-bold border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all cursor-pointer"
            id="new-salad-btn"
          >
            + Formato Completo
          </Button>
        </div>

        {/* Lista de ensaladas */}
        {salads.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-white/30 uppercase tracking-wider">
              Ensaladas en {activeLineCode} ({salads.length})
            </h2>

            {salads.map((salad) => {
              const saladTotalBoxes = salad.formats.reduce((s, f) => s + f.quantity, 0);
              const saladTotalPallets = salad.formats.reduce(
                (s, f) => s + calculateFormat(f).pallets, 0
              );
              const hasNoblejas = salad.formats.some((f) => f.noblejas > 0);

              return (
                <div
                  key={salad.id}
                  className="glass-card rounded-2xl p-4 md:p-5 hover:border-white/20 transition-all duration-200"
                >
                  <div className="flex items-center gap-4 flex-col sm:flex-row">
                    {/* Contenido (Sin imagen, ancho completo) */}
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="text-xl font-black text-white leading-tight">
                          {salad.name}
                        </h3>
                        {hasNoblejas && (
                          <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full uppercase tracking-wide">
                            Noblejas
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3 max-w-md">
                        <div className="bg-white/[0.03] rounded-xl p-2 text-center border border-white/5">
                          <p className="text-[9px] text-white/30 uppercase tracking-wider leading-none">Cajas</p>
                          <p className="text-base font-black text-white mt-1 leading-none">{saladTotalBoxes.toLocaleString()}</p>
                        </div>
                        <div className="bg-white/[0.03] rounded-xl p-2 text-center border border-emerald-500/10">
                          <p className="text-[9px] text-emerald-400/40 uppercase tracking-wider leading-none">Palets</p>
                          <p className="text-base font-black text-emerald-400 mt-1 leading-none">{saladTotalPallets}</p>
                        </div>
                        <div className="bg-white/[0.03] rounded-xl p-2 text-center border border-white/5">
                          <p className="text-[9px] text-white/30 uppercase tracking-wider leading-none">Formatos</p>
                          <p className="text-base font-black text-white mt-1 leading-none">{salad.formats.length}</p>
                        </div>
                      </div>

                      {/* Chips de formatos con wrap limpio */}
                      <div className="flex flex-wrap gap-1.5 max-w-full">
                        {salad.formats.map((f) => {
                          const fc = calculateFormat(f);
                          return (
                            <div
                              key={f.id}
                              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs shrink-0"
                            >
                              <span className="text-white/70 font-semibold">📦 {f.boxType}</span>
                              <span className="text-white/30 ml-1.5">
                                {fc.pallets}p + {fc.pico}c
                                {f.noblejas > 0 && (
                                  <span className="text-purple-400/60 ml-1">
                                    · Nob {f.noblejas}
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex sm:flex-col gap-2 shrink-0 w-full sm:w-auto justify-end border-t border-white/5 sm:border-t-0 pt-3 sm:pt-0 mt-2 sm:mt-0">
                      <Button
                        onClick={() => handleEditSalad(salad)}
                        variant="outline"
                        size="sm"
                        className="h-10 px-4 sm:px-0 sm:w-10 border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 rounded-xl"
                        id={`edit-salad-${salad.id}`}
                      >
                        Editar
                      </Button>
                      <Button
                        onClick={() => removeSalad(salad.id)}
                        variant="outline"
                        size="sm"
                        className="h-10 px-4 sm:px-0 sm:w-10 border-red-500/20 bg-red-500/5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl"
                        id={`remove-salad-${salad.id}`}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Cola de producción */}
        {salads.length > 0 && (
          <section className="space-y-3">
            {/* Rebuild queue button removed */}

            <ProductionQueue editable />

            {queue.length > 0 && (
              <div className="flex gap-2.5 mt-2">
                <Button
                  onClick={clearQueueAndSalads}
                  variant="outline"
                  className="h-20 px-6 border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shrink-0 flex flex-col items-center justify-center gap-1 cursor-pointer"
                  title="Vaciar planificación actual"
                >
                  <Trash2 className="w-5 h-5 text-red-500/80" />
                  <span>Limpiar</span>
                </Button>
                <Button
                  onClick={handleBuildAndStart}
                  className="flex-1 h-20 text-2xl font-black bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 hover:from-emerald-400 hover:via-green-400 hover:to-teal-400 text-white rounded-2xl shadow-xl shadow-emerald-500/30 transition-all active:scale-[0.98]"
                  id="start-production-btn"
                >
                  ▶ INICIAR PRODUCCIÓN
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Empty state & History */}
        {salads.length === 0 && (
          <div className="space-y-6 py-12 max-w-md mx-auto w-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl mx-auto mb-3 shadow-xl shadow-emerald-500/10">
                🥗
              </div>
              <h2 className="text-xl font-bold text-white/30 mb-1">Sin ensaladas</h2>
              <p className="text-white/20 text-xs">Crea tu primera ensalada para comenzar</p>
            </div>

            {history && history.length > 0 && (
              <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Historial Reciente ({history.length})
                  </h3>
                  <button
                    onClick={clearHistory}
                    className="text-[10px] font-bold text-red-400/60 hover:text-red-400 hover:bg-red-500/10 px-2 py-0.5 rounded transition-all cursor-pointer"
                  >
                    Limpiar
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-0.5">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-xs hover:bg-white/[0.04] transition-all">
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="font-bold text-white/80 truncate">{h.saladName}</p>
                        <p className="text-[10px] text-white/40 truncate">
                          {h.boxType} · {h.quantity}c {h.noblejas > 0 ? `· ${h.noblejas} Nob` : ""}
                        </p>
                        {h.duration && (
                          <p className="text-[9px] text-white/30 mt-0.5 flex items-center gap-1 font-mono">
                            ⏱️ {h.duration}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => reproduceFromHistory(h)}
                        className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-all cursor-pointer active:scale-95 shrink-0"
                        title="Volver a producir inmediatamente"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-4 px-4 text-center space-y-2">
        <p className="text-xs text-white/20">
          Desarrollado por{" "}
          <a
            href="https://isra.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400/50 hover:text-emerald-400 transition-colors font-semibold"
          >
            isra.dev
          </a>
        </p>
        <div>
          <button
            onClick={() => setShowWipeModal(true)}
            className="text-[9px] uppercase tracking-wider font-bold text-red-500/20 hover:text-red-400 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-all cursor-pointer"
            type="button"
          >
            ⚠️ Borrado de datos
          </button>
        </div>
      </footer>

      {/* Modal Confirmación Borrado de Datos */}
      {showWipeModal && (
        <div
          onClick={() => setShowWipeModal(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#181010]/95 backdrop-blur-2xl border border-red-500/20 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl text-center space-y-5 my-auto"
          >
            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl mx-auto shadow-xl shadow-red-500/5">
              🚨
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">¿Borrar todos los datos?</h2>
              <p className="text-white/60 text-xs leading-relaxed">
                Esta acción es permanente y no se puede deshacer. Se borrarán todas las ensaladas preparadas, la cola de producción y el historial por completo.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => setShowWipeModal(false)}
                variant="outline"
                className="flex-1 h-12 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 rounded-xl font-bold text-sm"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  wipeAllData();
                  setShowWipeModal(false);
                }}
                className="flex-1 h-12 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-400 hover:to-orange-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-500/20"
              >
                Sí, borrar todo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center min-h-screen w-full bg-[#05050a] text-white relative overflow-hidden transition-colors duration-300",
          goldLoading ? "gold-mode" : ""
        )}
      >
        {/* Background ambient glows */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none opacity-80 glass-bg-blobs">
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-purple-500/20 blur-[130px] animate-pulse" style={{ animationDuration: "8s" }} />
          <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-orange-500/12 blur-[130px] animate-pulse" style={{ animationDuration: "12s" }} />
          <div className="absolute top-1/4 right-[5%] w-[400px] h-[400px] rounded-full bg-emerald-500/8 blur-[110px]" />
        </div>

        {/* Loading Card */}
        <div className="relative z-10 w-full max-w-sm px-4 animate-fade-in">
          <div className="glass-card rounded-3xl p-8 text-center space-y-6 animate-slide-up">
            {/* Logo Container */}
            <div className="relative w-20 h-20 mx-auto rounded-2xl overflow-hidden border border-white/15 bg-black/40 flex items-center justify-center shadow-lg shadow-black/40">
              {goldLoading && (
                <span className="absolute inset-0 bg-amber-500/30 animate-pulse pointer-events-none" />
              )}
              <img src="/images/logo.png" className="w-16 h-16 object-cover" alt="KPI logo" />
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <h2 className="text-2xl font-black tracking-wide leading-none flex items-center justify-center gap-1.5">
                <span className={cn(goldLoading && "text-gold-gradient")}>KPI</span>
                {goldLoading && (
                  <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.4)] tracking-wide uppercase shrink-0 animate-bounce">
                    👑 GOLD
                  </span>
                )}
              </h2>
              <p className={cn("text-[10px] font-bold uppercase tracking-[0.15em] leading-none animate-pulse", goldLoading ? "text-amber-400/80" : "text-emerald-400/80")}>
                {goldLoading ? "EDICIÓN PREMIUM" : "CONTROL DE PRODUCCIÓN"}
              </p>
            </div>

            {/* Progress line */}
            <div className="space-y-3 pt-2">
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                <div 
                  className={cn(
                    "absolute top-0 bottom-0 left-0 bg-gradient-to-r rounded-full",
                    goldLoading ? "from-amber-400 to-yellow-500" : "from-emerald-500 to-teal-500"
                  )}
                  style={{ animation: "progress-load 0.6s ease-out forwards" }}
                />
              </div>
              <p className="text-[11px] text-white/35 font-medium">
                Iniciando sistema...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  if (goldMode && ambientMode && isProducing) {
    return <AmbientMode />;
  }

  return (
    <div
      className={cn(
        "flex min-h-screen w-full transition-colors duration-300 relative overflow-hidden",
        highContrastMode ? "high-contrast" : goldMode ? "gold-mode" : "florette-mode"
      )}
    >
      {goldMode && isProducing && currentProgress?.finished && <GoldConfetti />}
      {/* Background ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none opacity-80 glass-bg-blobs">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-purple-500/20 blur-[130px] animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-orange-500/12 blur-[130px] animate-pulse" style={{ animationDuration: "12s" }} />
        <div className="absolute top-1/4 right-[5%] w-[400px] h-[400px] rounded-full bg-emerald-500/8 blur-[110px]" />
      </div>

      {/* App Container */}
      <div className="flex flex-col min-h-screen w-full relative z-10">
        {activeLineCode === "ALL" ? (
          <div className="flex-1 flex flex-col min-h-screen overflow-y-auto">
            <header className="sticky top-0 z-40 bg-black/40 backdrop-blur-xl border-b border-white/10 p-3">
              <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-xs font-black text-purple-300">
                    KPI
                  </div>
                  <div>
                    <h1 className="text-base sm:text-lg font-black text-white leading-tight">
                      L.I.A.R KPI · Monitor de Fábrica
                    </h1>
                    <p className="text-[10px] text-white/50">Visión simultánea de todas las líneas en planta</p>
                  </div>
                </div>
                <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-1 gap-1">
                  {(["K00", "K01", "K02", "K03"] as const).map((code) => (
                    <button
                      key={code}
                      onClick={() => setActiveLineCode(code)}
                      className="px-2.5 py-1 rounded-lg text-xs font-black text-white/60 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                    >
                      {code}
                    </button>
                  ))}
                  <button className="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-600 text-white shadow-sm cursor-default">
                    Fábrica
                  </button>
                </div>
              </div>
            </header>
            <MultiLineDashboard onSelectLine={(code) => setActiveLineCode(code)} goldMode={goldMode} />
          </div>
        ) : isProducing ? (
          renderProductionContent()
        ) : (
          renderPreparationContent()
        )}
      </div>

      {/* Modal de Colores de Etiquetas Semanales & Selector Manual */}
      {showLabelsModal && (
        <div
          onClick={() => setShowLabelsModal(false)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "backdrop-blur-2xl border rounded-3xl p-6 w-full max-w-md shadow-2xl animate-slide-up my-auto",
              goldMode
                ? "bg-[#12121e]/95 border-amber-500/30"
                : "bg-white/95 border-emerald-500/30 shadow-emerald-950/10"
            )}
          >
            <div className="text-center mb-4">
              <span className="text-3xl">🗓️</span>
              <h3 className={cn("text-xl font-black mt-2 flex items-center justify-center gap-2", goldMode ? "text-white" : "text-slate-900")}>
                <span>Etiquetas de Trazabilidad</span>
                {goldMode && (
                  <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded tracking-wide uppercase shrink-0">
                    👑 GOLD
                  </span>
                )}
              </h3>
              <p className={cn("text-xs mt-1", goldMode ? "text-white/40" : "text-slate-500")}>
                Toca cualquier día para cambiar manualmente el color de etiqueta de la línea
              </p>
            </div>

            {/* Restablecer auto si está personalizado */}
            {customDayLabelIndex !== null && (
              <button
                type="button"
                onClick={() => {
                  setCustomDayLabelIndex(null);
                }}
                className="w-full mb-3 py-2 px-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center gap-2 hover:bg-amber-500/25 transition-all cursor-pointer"
              >
                <span>⚡ Restablecer a Fecha del Sistema (Auto-Detectar)</span>
              </button>
            )}

            {/* Lista de colores semanales seleccionable */}
            <div className="space-y-2 mb-5 max-h-[350px] overflow-y-auto pr-1">
              {DAY_LABEL_COLORS.map((dl, index) => {
                const isRealToday = new Date().getDay() === index;
                const isSelected = customDayLabelIndex !== null
                  ? customDayLabelIndex === index
                  : isRealToday;

                return (
                  <div
                    key={dl.day}
                    onClick={() => {
                      setCustomDayLabelIndex(index);
                      setShowLabelsModal(false);
                    }}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-2xl border cursor-pointer select-none transition-all active:scale-[0.98]",
                      isSelected
                        ? goldMode
                          ? "bg-amber-500/15 border-amber-400/60 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
                          : "bg-emerald-500/15 border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-white">{dl.day}</span>
                      {isRealToday && (
                        <span className="text-[9px] font-black bg-white/10 text-white/70 border border-white/10 px-2 py-0.5 rounded-full uppercase">
                          Hoy Real
                        </span>
                      )}
                      {isSelected && (
                        <span className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded-full uppercase border animate-pulse",
                          goldMode ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        )}>
                          Activo
                        </span>
                      )}
                    </div>
                    <div className={cn("px-3 py-1.5 rounded-xl text-xs font-black border uppercase flex items-center gap-1.5 min-w-[100px] justify-center", dl.bgClass, dl.textClass, dl.borderClass)}>
                      <div className={cn("w-2 h-2 rounded-full", dl.dotClass)} />
                      {dl.colorName}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={() => setShowLabelsModal(false)}
              className="w-full h-12 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl font-bold"
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}

      {/* Bloqueo táctil de pantalla en fábrica */}
      <ScreenLockOverlay />

      {/* Calculadora */}
      <Calculator />
      
      {/* Diálogo de Edición de Formato de Cola */}
      <EditQueueItemDialog />

      {/* Banner de transición entre formatos */}
      <TransitionBanner />

      {/* Modal formulario — No se cierra al hacer clic fuera */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "backdrop-blur-2xl border rounded-3xl p-6 md:p-8 w-full max-w-lg my-auto shadow-2xl",
              goldMode
                ? "bg-[#12121e]/95 border-amber-500/30"
                : "bg-white/95 border-emerald-500/30 shadow-emerald-950/10"
            )}
          >
            <h2 className={cn("text-xl font-black mb-5", goldMode ? "text-white" : "text-slate-900")}>
              {formMode === "add-format"
                ? `➕ Añadir Formato a ${queue[currentQueueIndex]?.saladName}`
                : formMode === "add-salad"
                ? "🥗 Añadir Nueva Ensalada a la Cola"
                : editingSalad
                ? "✏️ Editar Ensalada"
                : "🥗 Nueva Ensalada"}
            </h2>
            <SaladForm
              editingSalad={editingSalad}
              formMode={formMode}
              currentSaladInfo={
                formMode === "add-format" && queue[currentQueueIndex]
                  ? { id: queue[currentQueueIndex].saladId, name: queue[currentQueueIndex].saladName }
                  : undefined
              }
              onClose={handleCloseForm}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ===== COMPONENTS AUXILIARES DE EDICIÓN PREMIUM =====

// 1. MODO AMBIENTE - RELOJ GIGANTE Y DETALLES A 10 METROS
function AmbientMode() {
  const {
    queue,
    currentQueueIndex,
    currentProgress,
    toggleAmbientMode,
    goldMode,
    addPallet,
    removePallet,
    addNobjelasPallet,
    removeNobjelasPallet,
    setNobjelasPicoCompleted,
    setPicoCompleted,
    advanceToNext,
    jumpToQueueItem,
  } = useProductionStore();

  const [time, setTime] = useState("");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    const timer = setTimeout(() => {
      updateTime();
      setNow(Date.now());
    }, 0);
    const interval = setInterval(() => {
      updateTime();
      setNow(Date.now());
    }, 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const current = queue[currentQueueIndex];
  if (!current || !currentProgress) return null;

  const calc = calculateFormat({
    id: current.formatId,
    boxType: current.boxType,
    quantity: current.quantity,
    noblejas: current.noblejas,
    boxesPerPallet: current.boxesPerPallet,
  });

  const totalCajasObjetivo = calc.production + current.noblejas;
  const noblejasDoneCajas = currentProgress.noblejasCompletedPallets * current.boxesPerPallet +
    (currentProgress.nobjelasPicoCompleted ? (current.noblejas % current.boxesPerPallet) : 0);
  const milagroDoneCajas = currentProgress.completedPallets * current.boxesPerPallet +
    (currentProgress.picoCompleted ? calc.pico : 0);
  const currentDone = noblejasDoneCajas + milagroDoneCajas;
  
  const hasNoblejas = current.noblejas > 0;
  const nobPalletsTotal = hasNoblejas ? Math.floor(current.noblejas / current.boxesPerPallet) : 0;
  const nobPico = hasNoblejas ? current.noblejas % current.boxesPerPallet : 0;
  const nobPalletsDone = currentProgress.noblejasCompletedPallets;
  const nobPicoDone = currentProgress.nobjelasPicoCompleted;

  const milCajasTotal = current.quantity - current.noblejas;
  const milPalletsTotal = Math.floor(milCajasTotal / current.boxesPerPallet);
  const milPico = milCajasTotal % current.boxesPerPallet;
  const milPalletsDone = currentProgress.completedPallets;
  const milPicoDone = currentProgress.picoCompleted;

  const percent = Math.round(Math.min((currentDone / totalCajasObjetivo) * 100, 100));

  const isNoblejasActive = hasNoblejas && !currentProgress.noblejasCompleted;
  const isMilagroActive = !hasNoblejas || currentProgress.noblejasCompleted;

  const handleRingClick = () => {
    if (hasNoblejas && nobPalletsDone < nobPalletsTotal) {
      addNobjelasPallet();
    } else if (hasNoblejas && !nobPicoDone && nobPico > 0) {
      setNobjelasPicoCompleted(true);
    } else if (milPalletsDone < milPalletsTotal) {
      addPallet();
    } else if (!milPicoDone && milPico > 0) {
      setPicoCompleted(true);
    }
  };

  return (
    <div
      onClick={toggleAmbientMode}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col justify-between p-6 sm:p-8 md:p-12 select-none cursor-pointer transition-colors duration-500 overflow-y-auto scrollbar-none pb-[env(safe-area-inset-bottom,24px)]",
        isNoblejasActive
          ? "bg-[#09060c] bg-radial-gradient(circle at center, #1b0c29, #07030a)"
          : (goldMode 
              ? "bg-[#0c0903] bg-radial-gradient(circle at center, #1b1406, #070501)" 
              : "bg-[#05050a] bg-radial-gradient(circle at center, #0f0f1c, #030306)")
      )}
    >
      {/* Background ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-85 glass-bg-blobs">
        <div className={cn(
          "absolute top-[10%] left-[10%] w-[500px] h-[500px] rounded-full blur-[130px] animate-pulse transition-colors duration-1000",
          isNoblejasActive
            ? "bg-purple-500/15"
            : (goldMode ? "bg-amber-500/10" : "bg-emerald-500/5")
        )} style={{ animationDuration: "8s" }} />
        <div className={cn(
          "absolute bottom-[10%] right-[10%] w-[500px] h-[500px] rounded-full blur-[130px] transition-colors duration-1000",
          isNoblejasActive
            ? "bg-indigo-500/10"
            : (goldMode ? "bg-orange-500/5" : "bg-teal-500/3")
        )} />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between flex-wrap gap-2 mb-4 lg:mb-0">
        <div className="flex items-center gap-3">
          <span className={cn(
            "text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full transition-colors", 
            isNoblejasActive
              ? "bg-purple-500/15 text-purple-400 border border-purple-500/20"
              : (goldMode 
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/20" 
                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20")
          )}>
            🏭 Panel Ambientador
          </span>
          {goldMode && (
            <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full tracking-wider uppercase animate-bounce">
              👑 GOLD
            </span>
          )}
        </div>
        <div className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">
          Toca el fondo para salir
        </div>
      </div>

      {/* Grid central responsivo */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 lg:gap-14 items-center justify-center max-w-5xl mx-auto my-auto w-full px-2 sm:px-4">
        
        {/* Columna Izquierda: Anillo de Progreso Gigante Neón */}
        <div className="flex justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleRingClick}
            className="relative w-48 h-48 sm:w-64 md:w-80 sm:h-64 md:h-80 mx-auto flex items-center justify-center shrink-0 hover:scale-[1.03] active:scale-[0.97] transition-all bg-transparent border-0 cursor-pointer outline-none group"
            title="Haz clic para registrar el siguiente palet/pico"
          >
            {/* SVG Progress Ring */}
            <svg className="w-full h-full transform -rotate-90 animate-fade-in" viewBox="0 0 320 320">
              {/* Outer Track */}
              <circle
                cx="160"
                cy="160"
                r="135"
                className="stroke-white/5"
                strokeWidth="10"
                fill="transparent"
              />
              {/* Outer glowing progress Circle (Milagro / General progress) */}
              <circle
                cx="160"
                cy="160"
                r="135"
                className={cn(
                  "transition-all duration-1000 ease-out",
                  goldMode ? "stroke-amber-500" : "stroke-emerald-500"
                )}
                strokeWidth="12"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 135}
                strokeDashoffset={2 * Math.PI * 135 * (1 - (hasNoblejas ? (milCajasTotal > 0 ? Math.min((milagroDoneCajas / milCajasTotal) * 100, 100) : 100) : percent) / 100)}
                strokeLinecap="round"
                style={{
                  filter: goldMode
                    ? "drop-shadow(0 0 10px rgba(245, 158, 11, 0.6))"
                    : "drop-shadow(0 0 10px rgba(16, 185, 129, 0.6))"
                }}
              />

              {/* Inner Track and Circle for Noblejas (if applies) */}
              {hasNoblejas && (
                <>
                  <circle
                    cx="160"
                    cy="160"
                    r="105"
                    className="stroke-white/5"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="160"
                    cy="160"
                    r="105"
                    className="transition-all duration-1000 ease-out stroke-purple-500"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 105}
                    strokeDashoffset={2 * Math.PI * 105 * (1 - (current.noblejas > 0 ? Math.min((noblejasDoneCajas / current.noblejas) * 100, 100) : 100) / 100)}
                    strokeLinecap="round"
                    style={{
                      filter: "drop-shadow(0 0 8px rgba(168, 85, 247, 0.6))"
                    }}
                  />
                </>
              )}
            </svg>
            
            {/* Content inside Progress Ring */}
            <div className="absolute flex flex-col items-center justify-center text-center select-none pointer-events-none">
              <span className="text-[10px] sm:text-xs text-white/40 uppercase tracking-[0.25em] font-bold mb-1">Hora de Fábrica</span>
              <span className="text-2xl sm:text-4xl md:text-5xl font-black font-mono tracking-tight text-white mb-2 leading-none">
                {time}
              </span>
              <div className={cn("h-px w-10 sm:w-14 my-1.5", isNoblejasActive ? "bg-purple-500/20" : (goldMode ? "bg-amber-500/20" : "bg-emerald-500/20"))} />
              <span className={cn(
                "text-3xl sm:text-5xl md:text-6xl font-black font-mono leading-none mt-1 sm:mt-1.5", 
                isNoblejasActive 
                  ? "text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.4)]" 
                  : (goldMode ? "text-amber-400 drop-shadow-[0_0_10px_rgba(245, 158, 11, 0.4)]" : "text-emerald-400 drop-shadow-[0_0_10px_rgba(16, 185, 129, 0.4)]")
              )}>
                {percent}%
              </span>

              {/* Active phase badge inside ring */}
              {hasNoblejas && (
                <span className={cn(
                  "text-[9px] uppercase tracking-widest font-black px-2 py-0.5 rounded-md mt-2 animate-pulse",
                  isNoblejasActive
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                )}>
                  {isNoblejasActive ? "Fase Noblejas" : "Fase Milagro"}
                </span>
              )}

              <span className="text-[9px] sm:text-[10px] text-white/50 uppercase tracking-widest font-black mt-1 group-hover:text-emerald-400 group-hover:scale-110 transition-all duration-200">
                {percent === 100 ? "Completado" : "Toca para +1"}
              </span>
            </div>
          </button>
        </div>

        {/* Columna Derecha: Información del Formato y Cuadrícula de Palets */}
        <div className="text-center lg:text-left space-y-4 sm:space-y-6 flex flex-col justify-center max-w-lg w-full">
          
          {/* Nombre y datos del formato */}
          <div className="space-y-2 sm:space-y-3">
            <h2 className={cn("text-3xl sm:text-4xl md:text-6xl font-black tracking-wide leading-tight", isNoblejasActive ? "text-purple-400" : (goldMode ? "text-gold-gradient" : "text-white"))}>
              {current.saladName}
            </h2>
            
            <div className="flex items-center justify-center lg:justify-start gap-1.5 sm:gap-2 flex-wrap">
              <span className={cn(
                "text-xs sm:text-sm md:text-base font-black px-2.5 py-0.5 sm:py-1 rounded-xl bg-white/5 border border-white/10 tracking-wide uppercase", 
                isNoblejasActive ? "text-purple-400" : (goldMode ? "text-amber-400" : "text-emerald-400")
              )}>
                📦 {current.boxType}
              </span>
              
              {getActiveLote(queue, currentQueueIndex) && (
                <span className={cn(
                  "text-[10px] sm:text-xs md:text-sm font-mono font-bold border px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-xl shrink-0",
                  current.cambioLote
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.2)] animate-pulse"
                    : "bg-purple-500/10 text-purple-300 border-purple-500/20"
                )}>
                  Lote: {getActiveLote(queue, currentQueueIndex)}
                </span>
              )}
              {current.cambioLote && (
                <span className="bg-purple-500 text-white text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider shadow-[0_0_8px_rgba(168,85,247,0.4)] animate-bounce shrink-0">
                  🔄 CAMBIO DE LOTE
                </span>
              )}
            </div>
            
            {current.note && (
              <div className="mx-auto lg:mx-0 max-w-md px-3.5 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] sm:text-xs font-bold flex items-center justify-center lg:justify-start gap-1.5 rounded-xl animate-pulse">
                <span>⚠️ ALERTA:</span>
                <span>{current.note}</span>
              </div>
            )}

            {current.saladName.toUpperCase().includes("PROMO") && (
              <div className="mx-auto lg:mx-0 max-w-md px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[10px] sm:text-xs font-bold flex items-center justify-center lg:justify-start gap-1.5 rounded-xl animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.2)] border-dashed border-amber-400/40">
                <span>✨ ALERTA PROMO:</span>
                <span>LLEVAR FILM PROMO</span>
              </div>
            )}
          </div>

          {/* Cuadrícula de Palets Interactiva */}
          <div className="space-y-4 w-full" onClick={(e) => e.stopPropagation()}>
            {/* Sección Noblejas (si aplica) */}
            {hasNoblejas && (
              <div className={cn(
                "space-y-1.5 sm:space-y-2 border rounded-2xl p-4 transition-all duration-500",
                isNoblejasActive
                  ? "border-purple-500 bg-purple-950/20 shadow-[0_0_20px_rgba(168,85,247,0.35)] active-pulse-purple"
                  : "border-purple-500/10 bg-purple-950/[0.02] opacity-45"
              )}>
                <p className="text-[10px] text-purple-400 uppercase tracking-[0.18em] font-black text-center lg:text-left flex items-center justify-center lg:justify-start gap-1.5">
                  🏢 Noblejas ({nobPalletsDone} / {nobPalletsTotal} palets)
                  {isNoblejasActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                  )}
                  {currentProgress.noblejasCompleted && (
                    <span className="text-[10px]" title="Completado">✅</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center lg:justify-start max-w-sm mx-auto lg:mx-0">
                  {Array.from({ length: nobPalletsTotal }).map((_, idx) => {
                    const isCompleted = idx < nobPalletsDone;
                    return (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCompleted) {
                            removeNobjelasPallet();
                          } else {
                            addNobjelasPallet();
                          }
                        }}
                        className={cn(
                          "w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl border flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden active:scale-95 cursor-pointer",
                          isCompleted
                            ? "bg-purple-500/20 border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.25)] text-purple-300 font-bold"
                            : "bg-white/5 border-white/10 text-white/20 hover:bg-white/10"
                        )}
                      >
                        <span className="text-[8px] sm:text-[9px] font-bold font-mono">P{idx + 1}</span>
                        {isCompleted && (
                          <span className="absolute bottom-0.5 right-0.5 text-[6px] sm:text-[8px] leading-none">
                            👑
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {nobPico > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNobjelasPicoCompleted(!nobPicoDone);
                      }}
                      className={cn(
                        "w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl border flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden active:scale-95 cursor-pointer",
                        nobPicoDone
                          ? "bg-purple-500/20 border-purple-400 text-purple-300 font-bold shadow-[0_0_10px_rgba(168,85,247,0.25)]"
                          : "bg-white/5 border-white/10 border-dashed text-white/25 hover:bg-white/10"
                      )}
                    >
                      <span className="text-[8px] sm:text-[9px] font-bold font-mono leading-none">PICO</span>
                      <span className="text-[6.5px] sm:text-[7.5px] text-white/40 font-semibold mt-0.5">{nobPico}c</span>
                      {nobPicoDone && (
                        <span className="absolute bottom-0.5 right-0.5 text-[6px] sm:text-[8px] leading-none">
                          👑
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Sección Milagro */}
            <div className={cn(
              "space-y-1.5 sm:space-y-2 border rounded-2xl p-4 transition-all duration-500",
              isMilagroActive
                ? goldMode
                  ? "border-amber-500 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.35)] active-pulse-gold"
                  : "border-emerald-500 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.35)] active-pulse-emerald"
                : goldMode
                  ? "border-amber-500/10 bg-amber-950/[0.02] opacity-45"
                  : "border-emerald-500/10 bg-emerald-950/[0.02] opacity-45"
            )}>
              <p className={cn(
                "text-[10px] uppercase tracking-[0.18em] font-black text-center lg:text-left flex items-center justify-center lg:justify-start gap-1.5",
                goldMode ? "text-amber-400" : "text-emerald-400"
              )}>
                {hasNoblejas ? "😇 Milagro" : "📦 Producción Milagro"} ({milPalletsDone} / {milPalletsTotal} palets)
                {isMilagroActive && (
                  <span className={cn("w-1.5 h-1.5 rounded-full animate-ping", goldMode ? "bg-amber-400" : "bg-emerald-400")} />
                )}
                {milPalletsDone >= milPalletsTotal && (!milPico || milPicoDone) && (
                  <span className="text-[10px]" title="Completado">✅</span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center lg:justify-start max-w-sm mx-auto lg:mx-0">
                {Array.from({ length: milPalletsTotal }).map((_, idx) => {
                  const isCompleted = idx < milPalletsDone;
                  return (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCompleted) {
                          removePallet();
                        } else {
                          addPallet();
                        }
                      }}
                      className={cn(
                        "w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl border flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden active:scale-95 cursor-pointer",
                        isCompleted
                          ? goldMode
                            ? "bg-amber-500/20 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.25)] text-amber-300 font-bold"
                            : "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold"
                          : "bg-white/5 border-white/10 text-white/20 hover:bg-white/10"
                      )}
                    >
                      <span className="text-[8px] sm:text-[9px] font-bold font-mono">P{idx + 1}</span>
                      {isCompleted && (
                        <span className="absolute bottom-0.5 right-0.5 text-[6px] sm:text-[8px] leading-none">
                          {goldMode ? "👑" : "✔"}
                        </span>
                      )}
                    </button>
                  );
                })}
                {milPico > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPicoCompleted(!milPicoDone);
                    }}
                    className={cn(
                      "w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl border flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden active:scale-95 cursor-pointer",
                      milPicoDone
                        ? goldMode
                          ? "bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                          : "bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold"
                        : "bg-white/5 border-white/10 border-dashed text-white/25 hover:bg-white/10"
                    )}
                  >
                    <span className="text-[8px] sm:text-[9px] font-bold font-mono leading-none">PICO</span>
                    <span className="text-[6.5px] sm:text-[7.5px] text-white/40 font-semibold mt-0.5">{milPico}c</span>
                    {milPicoDone && (
                      <span className="absolute bottom-0.5 right-0.5 text-[6px] sm:text-[8px] leading-none">
                        {goldMode ? "👑" : "✔"}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Estadísticas de cajas */}
          <div className="flex flex-col gap-3 max-w-sm mx-auto lg:mx-0 w-full border-t border-white/5 pt-3">
            <div className="flex justify-center lg:justify-start items-center text-xs font-bold text-white/60">
              <span>Cajas: {currentDone} / {totalCajasObjetivo} <span className="text-white/30 font-medium">({totalCajasObjetivo - currentDone} rest.)</span></span>
            </div>

            {/* Botones Anterior y Siguiente */}
            <div className="flex gap-2 w-full">
              {currentQueueIndex > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpToQueueItem(currentQueueIndex - 1);
                  }}
                  className="flex-1 py-3 px-4 text-xs font-black rounded-2xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-md shrink-0"
                  title="Volver al formato anterior"
                >
                  ◀ ANT.
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  advanceToNext();
                }}
                className={cn(
                  "py-3 px-4 text-xs font-black rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow-lg",
                  currentQueueIndex > 0 ? "flex-[2]" : "w-full",
                  percent === 100
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-emerald-500/25 animate-pulse"
                    : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <span>{queue[currentQueueIndex + 1] ? "SIGUIENTE ➔" : "FINALIZAR ➔"}</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex items-center justify-between border-t border-white/5 pt-4 mt-6 text-[9px] sm:text-xs font-semibold uppercase tracking-wider text-white/30 flex-wrap gap-2">
        <div>
          Formato {currentQueueIndex + 1} de {queue.length} en Cola
        </div>
        {queue[currentQueueIndex + 1] ? (() => {
          const nextItem = queue[currentQueueIndex + 1];
          const transition = getTransitionType(current, nextItem);
          return (
            <div className="flex items-center gap-2 bg-white/[0.02] border border-white/5 rounded-xl px-3 py-1.5 text-[9px] sm:text-[10px] text-white/55 backdrop-blur-sm transition-all hover:border-white/10 select-none animate-fade-in shrink-0">
              <span className="text-white/20 font-black">SIGUIENTE:</span>
              <span className="font-extrabold text-white/80 truncate max-w-[120px]">{nextItem.saladName}</span>
              <span className="text-white/40 font-bold">({nextItem.boxType})</span>
              
              {/* Mini transition chips */}
              {transition === "salad-change" && (
                <span className="bg-red-500/15 border border-red-500/30 text-red-400 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-lg flex items-center gap-1 shadow-[0_0_8px_rgba(239,68,68,0.15)] animate-pulse">
                  🥗 CAMBIO
                </span>
              )}
              {transition === "box-change" && (
                <span className="bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-lg flex items-center gap-1 shadow-[0_0_8px_rgba(249,115,22,0.15)]">
                  📦 CAJA
                </span>
              )}
              {transition === "lote-change" && (
                <span className="bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-lg flex items-center gap-1 shadow-[0_0_8px_rgba(168,85,247,0.15)]">
                  🔄 LOTE
                </span>
              )}
            </div>
          );
        })() : (
          <span className="text-[9px] sm:text-[10px] font-bold text-white/20 bg-white/[0.01] border border-white/5 rounded-xl px-3 py-1.5 select-none shrink-0 uppercase tracking-widest">
            🏁 Fin de Cola
          </span>
        )}
      </div>

      {/* AmbientMode Specific Styles */}
      <style jsx>{`
        @keyframes pulse-subtle {
          0%, 100% { box-shadow: 0 0 12px var(--pulse-color); border-color: var(--pulse-border); }
          50% { box-shadow: 0 0 24px var(--pulse-color); border-color: var(--pulse-border-bright); }
        }
        .active-pulse-purple {
          --pulse-color: rgba(168, 85, 247, 0.25);
          --pulse-border: rgba(168, 85, 247, 0.5);
          --pulse-border-bright: rgba(192, 132, 252, 0.8);
          animation: pulse-subtle 2s infinite ease-in-out;
        }
        .active-pulse-gold {
          --pulse-color: rgba(245, 158, 11, 0.25);
          --pulse-border: rgba(245, 158, 11, 0.5);
          --pulse-border-bright: rgba(251, 191, 36, 0.8);
          animation: pulse-subtle 2s infinite ease-in-out;
        }
        .active-pulse-emerald {
          --pulse-color: rgba(16, 185, 129, 0.25);
          --pulse-border: rgba(16, 185, 129, 0.5);
          --pulse-border-bright: rgba(52, 211, 153, 0.8);
          animation: pulse-subtle 2s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}

// 2. CONFETI DE ESTRELLAS DE ORO EN COMPLETADO
function GoldConfetti() {
  const [stars] = useState(() => Array.from({ length: 30 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 2,
    scale: 0.5 + Math.random() * 1,
    speed: 2 + Math.random() * 3,
  })));

  return (
    <div className="fixed inset-0 pointer-events-none z-[90] overflow-hidden">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute text-2xl select-none"
          style={{
            left: `${s.left}%`,
            top: `-5%`,
            transform: `scale(${s.scale})`,
            animation: `fall ${s.speed}s linear infinite`,
            animationDelay: `${s.delay}s`,
            color: s.id % 2 === 0 ? "#fbbf24" : "#f59e0b",
          }}
        >
          {s.id % 3 === 0 ? "✨" : s.id % 3 === 1 ? "⭐" : "🌟"}
        </span>
      ))}
      <style jsx global>{`
        @keyframes fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(105vh) rotate(360deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
