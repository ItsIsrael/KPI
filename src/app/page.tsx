"use client";

import packageJson from "../../package.json";

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
import { Calculator as CalcIcon, Maximize, Minimize, Trash2, Play, History, LogOut, LayoutDashboard, Layers, Plus, Pause, ChevronDown, ChevronUp } from "lucide-react";
import { LoginScreen } from "@/components/LoginScreen";
import { ScreenLockOverlay } from "@/components/ScreenLockOverlay";
import { MultiLineDashboard } from "@/components/MultiLineDashboard";
import { QuickQueueBuilder } from "@/components/QuickQueueBuilder";
import { LineSelectorModal } from "@/components/LineSelectorModal";
import { VersionNotifier } from "@/components/VersionNotifier";
import { BroadcastListener } from "@/components/BroadcastAlerts";
import { QualityReminder } from "@/components/QualityReminder";
import { subscribeToLineChanges } from "@/lib/supabase-service";
import { useTabClock } from "@/hooks/useTabClock";
import { supabase } from "@/lib/supabase";
import { getActiveUserProfile, isAdminRole } from "@/lib/auth";
import { notifySuccess, notifyError } from "@/lib/notifications";
import { getSavedWorkspacePreference } from "@/lib/workspace-preference";

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
    hardResetDatabase,
    clearQueueAndSalads,
    authUser,
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
  const [showPrepLineModal, setShowPrepLineModal] = useState(false);
  
  // Acciones secundarias en vista de producción
  const [showAddQueueMenu, setShowAddQueueMenu] = useState(false);
  const [showMoreProdActions, setShowMoreProdActions] = useState(false);
  const [showClearLineModal, setShowClearLineModal] = useState(false);

  // Filtro de historial
  const [historyFilter, setHistoryFilter] = useState("");

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

    // Restaurar preferencia de contexto guardada antes de ocultar pantalla de carga (cero flicker)
    const savedPref = getSavedWorkspacePreference(useProductionStore.getState().authUser?.id);
    if (savedPref) {
      setActiveLineCode(savedPref);
      setShowPrepLineModal(false);
    } else {
      // Primera visita: no asumir K00, preparar Dashboard en segundo plano y mostrar selector
      setActiveLineCode("ALL", false);
      setShowPrepLineModal(true);
    }

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  // Efecto para sincronizar datos de la línea activa y suscripción Realtime
  useEffect(() => {
    loadActiveLineData();
  }, [activeLineCode]);

  // Cargar noblejasConfig, sesión de Supabase Auth y datos al montar
  useEffect(() => {
    // 1. Restaurar sesión activa de Supabase Auth si existe
    getActiveUserProfile().then((profile) => {
      if (profile) {
        useProductionStore.getState().setAuthUser(profile);
        const userPref = getSavedWorkspacePreference(profile.id);
        if (userPref && userPref !== useProductionStore.getState().activeLineCode) {
          useProductionStore.getState().setActiveLineCode(userPref);
        }
      }
    });

    // 2. Suscribirse a cambios en el estado de autenticación (login/logout/token refresh)
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          getActiveUserProfile().then((profile) => {
            if (profile) {
              useProductionStore.getState().setAuthUser(profile);
              const userPref = getSavedWorkspacePreference(profile.id);
              if (userPref && userPref !== useProductionStore.getState().activeLineCode) {
                useProductionStore.getState().setActiveLineCode(userPref);
              }
            }
          });
        } else {
          useProductionStore.getState().setAuthUser(null);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }

    useProductionStore.getState().loadAllLinesData();
  }, []);

  useEffect(() => {
    if (!activeLineId || activeLineCode === "ALL") return;
    const unsubscribe = subscribeToLineChanges(activeLineId, () => {
      loadActiveLineData();
    });

    return () => {
      unsubscribe();
    };
  }, [activeLineId, activeLineCode]);

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
    <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
      {/* Enorme marca de agua en el fondo para indicar la línea activa */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden opacity-[0.03] dark:opacity-[0.02]">
         <span className="text-[40vw] font-black tracking-tighter whitespace-nowrap select-none">
           {activeLineCode}
         </span>
      </div>

      <ProductionHeader onOpenLabelsModal={() => setShowLabelsModal(true)} />
      <div className="flex-1 max-w-2xl mx-auto w-full px-3 py-2 space-y-2 overflow-y-auto relative z-10">

        <ProductionCard />
        <ProductionControls />
        
        {/* Acciones secundarias y gestión de cola */}
        <div className="space-y-2 pt-1 pb-1">
          <div className="flex items-center gap-2">
            {/* 1. Agrupar 'Añadir formato' y 'Nueva ensalada' bajo 'Añadir a cola' */}
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setShowAddQueueMenu(!showAddQueueMenu)}
                className={cn(
                  "w-full min-h-[44px] px-3.5 py-2 rounded-xl border font-bold text-xs flex items-center justify-between transition-all cursor-pointer shadow-sm active:scale-[0.98]",
                  goldMode
                    ? "bg-white/5 border-white/15 text-white hover:bg-white/10"
                    : "bg-white border-slate-300 text-slate-800 hover:bg-slate-50"
                )}
              >
                <span className="flex items-center gap-2 font-black">
                  <Plus className="w-4 h-4 text-emerald-500" />
                  <span>Añadir a cola</span>
                </span>
                <ChevronDown className={cn("w-4 h-4 opacity-60 transition-transform duration-200", showAddQueueMenu && "rotate-180")} />
              </button>

              {showAddQueueMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowAddQueueMenu(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 p-1.5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 shadow-xl space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddQueueMenu(false);
                        setFormMode("add-format");
                        setShowForm(true);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl text-left text-xs font-bold hover:bg-emerald-50 dark:hover:bg-white/5 flex items-center gap-2 text-slate-800 dark:text-white cursor-pointer"
                    >
                      <span className="text-sm">➕</span>
                      <span>Añadir formato (a ensalada actual)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddQueueMenu(false);
                        setFormMode("add-salad");
                        setShowForm(true);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl text-left text-xs font-bold hover:bg-emerald-50 dark:hover:bg-white/5 flex items-center gap-2 text-slate-800 dark:text-white cursor-pointer"
                    >
                      <span className="text-sm">🥗</span>
                      <span>Nueva ensalada completa</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 2. Pausar producción (separado de vaciar) */}
            <button
              type="button"
              onClick={() => {
                useProductionStore.getState().resetProduction();
                notifySuccess("Producción pausada", "La línea se ha pausado. Las órdenes siguen en cola.");
              }}
              className={cn(
                "min-h-[44px] px-4 py-2 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.98] shrink-0",
                goldMode
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                  : "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
              )}
              title="Pausar producción y volver a preparación sin borrar la cola"
            >
              <Pause className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Pausar</span>
            </button>

            {/* 3. Menú Más acciones (incluye Vaciar Línea) */}
            <button
              type="button"
              onClick={() => setShowMoreProdActions(!showMoreProdActions)}
              className={cn(
                "min-h-[44px] px-3 py-2 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-[0.98] shrink-0",
                showMoreProdActions
                  ? "bg-slate-200 dark:bg-white/20 border-slate-400"
                  : "bg-white/5 border-white/10 text-white/70 hover:text-white"
              )}
              title="Más acciones operativas"
            >
              <span>•••</span>
              <span className="hidden sm:inline text-[11px]">Más</span>
            </button>
          </div>

          {/* Opciones dentro de Más Acciones */}
          {showMoreProdActions && (
            <div className="p-3 rounded-2xl border bg-red-500/[0.03] border-red-500/25 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-red-400 uppercase tracking-wider">Acciones de emergencia / Peligro</span>
                <button
                  type="button"
                  onClick={() => setShowMoreProdActions(false)}
                  className="text-xs text-white/40 hover:text-white cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowClearLineModal(true)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <Trash2 className="w-4 h-4" />
                <span>Vaciar línea (Eliminar toda la cola)</span>
              </button>
            </div>
          )}
        </div>

        <ProductionQueue editable />
      </div>
      <FinishFormatDialog />
    </div>
  );

  // ===== MODO PREPARACIÓN =====
  const renderPreparationContent = () => (
    <div className="flex-1 flex flex-col min-h-screen overflow-y-auto relative">
      {/* Enorme marca de agua en el fondo para indicar la línea activa */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden opacity-[0.03] dark:opacity-[0.02]">
         <span className="text-[40vw] font-black tracking-tighter whitespace-nowrap select-none">
           {activeLineCode}
         </span>
      </div>

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
            <div className="flex items-center gap-1.5 shrink-0 relative z-10">
              {activeLineCode !== "ALL" ? (
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black border-2 shadow-md flex items-center gap-1.5 uppercase tracking-widest",
                    goldMode
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                      : "bg-emerald-600 text-white border-emerald-400"
                  )}>
                    <span className="text-sm">📍</span>
                    <span>Línea {activeLineCode}</span>
                  </div>
                  <button
                    onClick={() => setShowPrepLineModal(true)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-white/15 bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Cambiar de línea de trabajo"
                    type="button"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black border-2 shadow-md flex items-center gap-1.5 uppercase tracking-widest",
                    goldMode
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                      : "bg-emerald-600 text-white border-emerald-400"
                  )}>
                    <span>🌐 Dashboard</span>
                  </div>
                  <button
                    onClick={() => setShowPrepLineModal(true)}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-white/15 bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Cambiar de línea o vista de trabajo"
                    type="button"
                  >
                    Cambiar
                  </button>
                </div>
              )}

              <button
                onClick={() => setActiveLineCode("ALL")}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm border",
                  activeLineCode === "ALL"
                    ? goldMode
                      ? "bg-amber-500 text-black border-amber-400"
                      : "bg-emerald-600 text-white border-emerald-700"
                    : goldMode
                    ? "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:scale-105 active:scale-95"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:scale-105 active:scale-95"
                )}
                title="Ver Monitor Multilínea (Dashboard de Planta)"
                type="button"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
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
            <Clock />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto w-full px-4 py-6 space-y-6 flex-1">

        {/* KPI Dashboard */}
        {salads.length > 0 && (
          <section className="grid grid-cols-3 gap-3">
            <div className="glass-card rounded-2xl p-4 text-center overflow-hidden">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-1">Ensaladas</p>
              <p className="text-2xl sm:text-3xl font-black text-white truncate px-1">{salads.length}</p>
              <p className="text-[10px] text-white/20 mt-0.5">{totalFormats} formatos</p>
            </div>
            <div className="glass-card rounded-2xl p-4 text-center overflow-hidden">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-1">Total Cajas</p>
              <p className="text-2xl sm:text-3xl font-black text-emerald-400 truncate px-1">{totalBoxes.toLocaleString()}</p>
              <p className="text-[10px] text-emerald-400/30 mt-0.5">unidades</p>
            </div>
            <div className="glass-card rounded-2xl p-4 text-center overflow-hidden">
              <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-1">Total Palets</p>
              <p className="text-2xl sm:text-3xl font-black text-teal-400 truncate px-1">{totalPallets}</p>
              <p className="text-[10px] text-teal-400/30 mt-0.5">estimados</p>
            </div>
          </section>
        )}



        {/* Estado Vacío Operativo (Requirement 2) */}
        {queue.length === 0 && activeLineCode !== "ALL" && (
          <div className={cn(
            "p-6 sm:p-8 rounded-3xl border text-center space-y-4 shadow-xl transition-all",
            goldMode
              ? "bg-[#141006]/90 border-amber-500/30 text-white"
              : "bg-white/95 border-emerald-600/20 text-slate-900 shadow-emerald-950/5"
          )}>
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              <Layers className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight">
                Línea {activeLineCode} no tiene órdenes activas
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-white/50 mt-1 max-w-md mx-auto">
                La línea está libre y lista para trabajar. Crea la primera orden para generar la cola de producción.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2 flex-wrap sm:flex-nowrap">
              <Button
                onClick={() => {
                  const formEl = document.getElementById("quick-order-builder");
                  if (formEl) formEl.scrollIntoView({ behavior: "smooth" });
                }}
                className={cn(
                  "h-12 px-6 text-sm font-black rounded-2xl flex items-center gap-2 shadow-lg cursor-pointer min-h-[48px]",
                  goldMode
                    ? "bg-amber-500 text-black hover:bg-amber-400"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
              >
                <Plus className="w-4 h-4" />
                <span>Crear primera orden</span>
              </Button>
              <Button
                onClick={() => setActiveLineCode("ALL")}
                variant="outline"
                className="h-12 px-5 text-sm font-bold rounded-2xl border-slate-300 dark:border-white/15 cursor-pointer min-h-[48px]"
              >
                <LayoutDashboard className="w-4 h-4 mr-1.5" />
                <span>Ver Dashboard</span>
              </Button>
            </div>
          </div>
        )}

        {/* Formulario Rápido de Cola para Operarios */}
        <div id="quick-order-builder">
          <QuickQueueBuilder goldMode={goldMode} />
        </div>

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

        {/* History */}
        {history && history.length > 0 && (
          <section className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col max-w-xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 shrink-0 gap-2">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                <History className="w-3.5 h-3.5" /> Historial Reciente ({history.length})
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filtrar por ensalada o lote..."
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 text-white text-xs rounded-lg px-2 py-1 w-full sm:w-40 focus:outline-none focus:border-emerald-500/50"
                />
                <button
                  onClick={clearHistory}
                  className="text-[10px] font-bold text-red-400/60 hover:text-red-400 hover:bg-red-500/10 px-2 py-1 rounded transition-all cursor-pointer shrink-0"
                >
                  Limpiar
                </button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5">
              {history
                .filter((h) => h.saladName.toLowerCase().includes(historyFilter.toLowerCase()) || h.operator?.toLowerCase().includes(historyFilter.toLowerCase()))
                .map((h) => (
                <div key={h.id} className="flex items-center justify-between p-2.5 bg-white/[0.02] border border-white/5 rounded-xl text-xs hover:bg-white/[0.04] transition-all">
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white/80 truncate">{h.saladName}</p>
                      {false && h.operator && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-white/40 font-mono flex-shrink-0">
                          {h.operator}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/40 truncate">
                      {h.boxType} · {h.quantity}c {h.noblejas > 0 ? `· ${h.noblejas} Nob` : ""}
                    </p>
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

        <div className="h-4" />
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-4 px-4 flex items-center justify-between text-xs text-white/20 relative">
        <div className="flex-1">
          <button
            onClick={() => {
              if (!isAdminRole(authUser?.role)) {
                notifyError("Acción restringida", "Solo los usuarios con rol Administrador pueden realizar un borrado de la base de datos.");
                return;
              }

              if (window.confirm("⚠️ ADVERTENCIA DE ADMINISTRADOR: ¿Estás seguro de que deseas forzar el borrado completo de los datos de esta línea en la base de datos?")) {
                hardResetDatabase().then(() => {
                  notifySuccess("Base de datos borrada", "Se han eliminado los datos de la línea actual.");
                }).catch(() => {
                  notifyError("Error al borrar", "No se pudo realizar el borrado de la base de datos.");
                });
              }
            }}
            className="px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-500/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer font-semibold shadow-sm"
            title="Borrado Forzado de Base de Datos (Solo Administrador)"
          >
            Borrado Forzado DB (Admin)
          </button>
        </div>
        <div className="flex-1 flex justify-center">
          <p>
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
        </div>
        <div className="flex-1 flex justify-end">
          <span className="font-mono font-bold opacity-50 hover:opacity-100 transition-opacity tracking-wider cursor-default" title="Versión actual">
            v{packageJson.version}
          </span>
        </div>
      </footer>
    </div>
  );

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center min-h-screen w-full relative overflow-hidden transition-colors duration-300",
          goldLoading ? "gold-mode bg-[#05050a] text-white" : "bg-slate-50 text-slate-900"
        )}
      >
        {/* Background ambient glows */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none opacity-80 glass-bg-blobs">
          {goldLoading ? (
            <>
              <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-purple-500/20 blur-[130px] animate-pulse" style={{ animationDuration: "8s" }} />
              <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-orange-500/12 blur-[130px] animate-pulse" style={{ animationDuration: "12s" }} />
              <div className="absolute top-1/4 right-[5%] w-[400px] h-[400px] rounded-full bg-emerald-500/8 blur-[110px]" />
            </>
          ) : (
            <>
              <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-emerald-500/10 blur-[130px] animate-pulse" style={{ animationDuration: "8s" }} />
              <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-teal-500/10 blur-[130px] animate-pulse" style={{ animationDuration: "12s" }} />
            </>
          )}
        </div>

        {/* Loading Card */}
        <div className="relative z-10 w-full max-w-sm px-4 animate-fade-in">
          <div className={cn(
            "rounded-3xl p-8 text-center space-y-6 animate-slide-up border shadow-2xl backdrop-blur-md",
            goldLoading ? "glass-card" : "bg-white/80 border-slate-200 shadow-emerald-900/5"
          )}>
            {/* Logo Container */}
            <div className={cn(
              "relative w-20 h-20 mx-auto rounded-2xl overflow-hidden flex items-center justify-center shadow-lg",
              goldLoading ? "bg-black/40 border-white/15 shadow-black/40" : "bg-white border-slate-200 shadow-slate-200"
            )}>
              {goldLoading && (
                <span className="absolute inset-0 bg-amber-500/30 animate-pulse pointer-events-none" />
              )}
              <img src="/images/logo.png" className="w-16 h-16 object-cover" alt="KPI logo" />
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <h2 className="text-2xl font-black tracking-wide leading-none flex items-center justify-center gap-1.5">
                <span className={cn(goldLoading ? "text-gold-gradient" : "text-[#0f291e]")}>KPI</span>
                {goldLoading && (
                  <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.4)] tracking-wide uppercase shrink-0 animate-bounce">
                    👑 GOLD
                  </span>
                )}
              </h2>
              <p className={cn("text-[10px] font-bold uppercase tracking-[0.15em] leading-none animate-pulse", goldLoading ? "text-amber-400/80" : "text-emerald-700")}>
                {goldLoading ? "EDICIÓN PREMIUM" : "CONTROL DE PRODUCCIÓN"}
              </p>
            </div>

            {/* Progress line */}
            <div className="space-y-3 pt-2">
              <div className={cn("h-1.5 w-full rounded-full overflow-hidden border relative", goldLoading ? "bg-white/5 border-white/5" : "bg-slate-100 border-slate-200")}>
                <div 
                  className={cn(
                    "absolute top-0 bottom-0 left-0 bg-gradient-to-r rounded-full",
                    goldLoading ? "from-amber-400 to-yellow-500" : "from-emerald-500 to-teal-500"
                  )}
                  style={{ animation: "progress-load 0.6s ease-out forwards" }}
                />
              </div>
              <p className={cn("text-[11px] font-medium", goldLoading ? "text-white/35" : "text-slate-500")}>
                Iniciando sistema...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (ambientMode && isProducing) {
    return <AmbientMode />;
  }

  return (
    <div
      className={cn(
        "flex min-h-screen w-full transition-colors duration-300 relative overflow-hidden",
        highContrastMode ? "high-contrast" : goldMode ? "gold-mode" : "florette-mode"
      )}
    >
      <VersionNotifier goldMode={goldMode} />
      <BroadcastListener goldMode={goldMode} currentLineCode={activeLineCode} />
      <QualityReminder goldMode={goldMode} />
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
            <header className="sticky top-0 z-40 bg-black/20 backdrop-blur-xl border-b border-white/10">
              <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Logo Custom Generado clickable for Gold Mode */}
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
                        <span className={cn(goldMode && "text-gold-gradient")}>L.I.A</span>
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
                      <p className={cn("text-[9px] font-bold uppercase tracking-[0.12em] leading-none mt-1", goldMode ? "text-amber-400/80" : "text-emerald-700 dark:text-emerald-400")}>
                        DASHBOARD GENERAL
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

                  {/* Selector de Contexto Dashboard · Cambiar */}
                  <div className="flex items-center gap-1.5 ml-1 md:ml-3 shrink-0">
                    <div className={cn(
                      "px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black border-2 shadow-md flex items-center gap-1.5 uppercase tracking-widest",
                      goldMode
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                        : "bg-emerald-600 text-white border-emerald-400"
                    )}>
                      <span>🌐 Dashboard</span>
                    </div>
                    <button
                      onClick={() => setShowPrepLineModal(true)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-white/15 bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer shadow-sm active:scale-95"
                      title="Cambiar de línea o vista de trabajo"
                      type="button"
                    >
                      Cambiar
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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
                    id="calc-toggle-btn-dash"
                    title="Calculadora"
                    type="button"
                  >
                    <CalcIcon className="w-4 h-4" />
                  </button>
                  <Clock />
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

      {/* Selector de Línea Inicial / Contexto */}
      <LineSelectorModal
        open={showPrepLineModal}
        onOpenChange={setShowPrepLineModal}
        goldMode={goldMode}
      />

      {/* Modal de confirmación para Vaciar Línea */}
      {showClearLineModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowClearLineModal(false)}
        >
          <div
            className={cn(
              "w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 animate-in zoom-in-95",
              goldMode
                ? "bg-[#141006] border-red-500/40 text-white"
                : "bg-white border-red-300 text-slate-900"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight">¿Vaciar toda la línea {activeLineCode}?</h3>
                <p className="text-xs text-slate-500 dark:text-white/60 mt-1 leading-relaxed">
                  Esta acción detendrá la producción y eliminará todas las órdenes pendientes de la cola de la línea {activeLineCode}. No se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearLineModal(false)}
                className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-bold hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  clearQueueAndSalads();
                  setShowClearLineModal(false);
                  setShowMoreProdActions(false);
                  notifySuccess("Línea vaciada", `Se han eliminado todas las órdenes de ${activeLineCode}.`);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-lg shadow-red-600/30 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, vaciar línea</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

// 1. MODO AMBIENTE - RELOJ GIGANTE Y DETALLES A 10 METROS (FLORETTE & GOLD)
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

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
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

  const bgStyle = {
    backgroundColor: isNoblejasActive
      ? "#09060e"
      : goldMode
      ? "#090602"
      : "#02120a",
    backgroundImage: isNoblejasActive
      ? "radial-gradient(circle at 50% 40%, #1f0c33 0%, #07040c 100%)"
      : goldMode
      ? "radial-gradient(circle at 50% 40%, #1e1304 0%, #070501 100%)"
      : "radial-gradient(circle at 50% 40%, #062b18 0%, #020c06 100%)",
    color: "#ffffff",
  };

  return (
    <div
      onClick={toggleAmbientMode}
      style={bgStyle}
      className="fixed inset-0 z-[100] flex flex-col justify-between p-6 sm:p-8 md:p-12 select-none cursor-pointer transition-all duration-500 overflow-y-auto scrollbar-none pb-[env(safe-area-inset-bottom,24px)] text-white"
    >
      {/* Background ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 opacity-80">
        <div
          className={cn(
            "absolute top-[10%] left-[10%] w-[500px] h-[500px] rounded-full blur-[140px] animate-pulse transition-colors duration-1000",
            isNoblejasActive
              ? "bg-purple-500/20"
              : goldMode
              ? "bg-amber-500/15"
              : "bg-emerald-500/15"
          )}
          style={{ animationDuration: "8s" }}
        />
        <div
          className={cn(
            "absolute bottom-[10%] right-[10%] w-[500px] h-[500px] rounded-full blur-[140px] transition-colors duration-1000",
            isNoblejasActive
              ? "bg-indigo-500/15"
              : goldMode
              ? "bg-orange-500/10"
              : "bg-teal-500/10"
          )}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between flex-wrap gap-2 mb-4 lg:mb-0">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] px-3.5 py-1.5 rounded-full border shadow-md flex items-center gap-1.5",
              isNoblejasActive
                ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                : goldMode
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
            )}
          >
            <span>🌿</span>
            <span>{goldMode ? "👑 PANEL AMBIENTADOR GOLD" : "🌿 PANEL AMBIENTADOR FLORETTE"}</span>
          </span>
        </div>
        <div className="text-white/40 text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 px-3 py-1 rounded-full">
          Toca en cualquier parte para salir
        </div>
      </div>

      {/* Grid central responsivo de alta visibilidad */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10 lg:gap-14 items-center justify-center max-w-5xl mx-auto my-auto w-full px-2 sm:px-4">
        
        {/* Columna Izquierda: Anillo de Progreso Gigante Neón */}
        <div className="flex justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleRingClick}
            className="relative w-52 h-52 sm:w-64 md:w-80 sm:h-64 md:h-80 mx-auto flex items-center justify-center shrink-0 hover:scale-[1.03] active:scale-[0.97] transition-all bg-transparent border-0 cursor-pointer outline-none group"
            title="Haz clic para registrar el siguiente palet"
          >
            {/* SVG Progress Ring */}
            <svg className="w-full h-full transform -rotate-90 animate-fade-in" viewBox="0 0 320 320">
              {/* Outer Track */}
              <circle
                cx="160"
                cy="160"
                r="135"
                className="stroke-white/10"
                strokeWidth="12"
                fill="transparent"
              />
              {/* Outer glowing progress Circle */}
              <circle
                cx="160"
                cy="160"
                r="135"
                className={cn(
                  "transition-all duration-1000 ease-out",
                  goldMode ? "stroke-amber-400" : "stroke-emerald-400"
                )}
                strokeWidth="14"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 135}
                strokeDashoffset={2 * Math.PI * 135 * (1 - (hasNoblejas ? (milCajasTotal > 0 ? Math.min((milagroDoneCajas / milCajasTotal) * 100, 100) : 100) : percent) / 100)}
                strokeLinecap="round"
                style={{
                  filter: goldMode
                    ? "drop-shadow(0 0 12px rgba(245, 158, 11, 0.8))"
                    : "drop-shadow(0 0 12px rgba(16, 185, 129, 0.8))"
                }}
              />

              {/* Inner Track and Circle for Noblejas (if applies) */}
              {hasNoblejas && (
                <>
                  <circle
                    cx="160"
                    cy="160"
                    r="105"
                    className="stroke-white/10"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  <circle
                    cx="160"
                    cy="160"
                    r="105"
                    className="transition-all duration-1000 ease-out stroke-purple-400"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 105}
                    strokeDashoffset={2 * Math.PI * 105 * (1 - (current.noblejas > 0 ? Math.min((noblejasDoneCajas / current.noblejas) * 100, 100) : 100) / 100)}
                    strokeLinecap="round"
                    style={{
                      filter: "drop-shadow(0 0 10px rgba(168, 85, 247, 0.8))"
                    }}
                  />
                </>
              )}
            </svg>
            
            {/* Content inside Progress Ring */}
            <div className="absolute flex flex-col items-center justify-center text-center select-none pointer-events-none">
              <span className="text-[10px] sm:text-xs text-white/60 uppercase tracking-[0.25em] font-bold mb-1">
                {time}
              </span>
              <div className={cn("h-px w-10 sm:w-14 my-1", isNoblejasActive ? "bg-purple-500/40" : (goldMode ? "bg-amber-500/40" : "bg-emerald-500/40"))} />
              <span className={cn(
                "text-4xl sm:text-6xl md:text-7xl font-black font-mono leading-none my-1", 
                isNoblejasActive 
                  ? "text-purple-300 drop-shadow-[0_0_12px_rgba(168,85,247,0.6)]" 
                  : (goldMode ? "text-amber-300 drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]" : "text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]")
              )}>
                {percent}%
              </span>

              {/* Active phase badge inside ring */}
              {hasNoblejas && (
                <span className={cn(
                  "text-[9px] uppercase tracking-widest font-black px-2.5 py-0.5 rounded-md mt-1 border",
                  isNoblejasActive
                    ? "bg-purple-500/30 text-purple-200 border-purple-400 shadow-sm"
                    : "bg-amber-500/30 text-amber-200 border-amber-400 shadow-sm"
                )}>
                  {isNoblejasActive ? "🟣 Fase Noblejas" : "📦 Fase Milagro"}
                </span>
              )}

              <span className="text-[10px] sm:text-[11px] text-white/70 uppercase tracking-widest font-black mt-1 group-hover:text-emerald-300 transition-all">
                {percent === 100 ? "Completado" : "Toca para +1"}
              </span>
            </div>
          </button>
        </div>

        {/* Columna Derecha: Información del Formato y Cuadrícula de Palets */}
        <div className="text-center lg:text-left space-y-4 sm:space-y-6 flex flex-col justify-center max-w-lg w-full">
          
          {/* Nombre y datos del formato */}
          <div className="space-y-2 sm:space-y-3">
            <h2 className={cn(
              "text-3xl sm:text-5xl md:text-6xl font-black tracking-wide leading-tight text-white drop-shadow-md",
              isNoblejasActive ? "text-purple-300" : (goldMode ? "text-gold-gradient" : "text-emerald-100")
            )}>
              🥗 {current.saladName}
            </h2>
            
            <div className="flex items-center justify-center lg:justify-start gap-1.5 sm:gap-2 flex-wrap">
              <span className={cn(
                "text-xs sm:text-sm md:text-base font-black px-3 py-1 rounded-xl bg-white/10 border border-white/20 tracking-wide uppercase", 
                isNoblejasActive ? "text-purple-300" : (goldMode ? "text-amber-300" : "text-emerald-300")
              )}>
                📦 {current.boxType}
              </span>
              
              {getActiveLote(queue, currentQueueIndex) && (
                <span className={cn(
                  "text-[11px] sm:text-xs md:text-sm font-mono font-bold border px-2.5 py-1 rounded-xl shrink-0",
                  current.cambioLote
                    ? "bg-purple-500/30 text-purple-200 border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.4)] animate-pulse"
                    : "bg-white/10 text-white/80 border-white/20"
                )}>
                  🏷️ Lote: {getActiveLote(queue, currentQueueIndex)}
                </span>
              )}
              {current.cambioLote && (
                <span className="bg-purple-600 text-white text-[9px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider shadow-md animate-bounce shrink-0">
                  🔄 CAMBIO DE LOTE
                </span>
              )}
            </div>
            
            {current.note && (
              <div className="mx-auto lg:mx-0 max-w-md px-3.5 py-1.5 bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-bold flex items-center justify-center lg:justify-start gap-1.5 rounded-xl animate-pulse">
                <span>⚠️ ALERTA:</span>
                <span>{current.note}</span>
              </div>
            )}
          </div>

          {/* Cuadrícula de Palets Interactiva */}
          <div className="space-y-4 w-full" onClick={(e) => e.stopPropagation()}>
            {/* Sección Noblejas */}
            {hasNoblejas && (
              <div className={cn(
                "space-y-2 border rounded-2xl p-4 transition-all duration-500",
                isNoblejasActive
                  ? "border-purple-500/50 bg-purple-950/40 shadow-[0_0_20px_rgba(168,85,247,0.25)]"
                  : "border-purple-500/20 bg-purple-950/10 opacity-50"
              )}>
                <p className="text-xs text-purple-300 uppercase tracking-[0.18em] font-black text-center lg:text-left flex items-center justify-center lg:justify-start gap-1.5">
                  🟣 Noblejas ({nobPalletsDone} / {nobPalletsTotal} palets)
                  {isNoblejasActive && (
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                  )}
                  {currentProgress.noblejasCompleted && (
                    <span>✅</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2 justify-center lg:justify-start max-w-sm mx-auto lg:mx-0">
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
                          "w-12 h-12 rounded-xl border flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden active:scale-95 cursor-pointer shadow-sm",
                          isCompleted
                            ? "bg-purple-600/30 border-purple-400 text-purple-200 font-bold"
                            : "bg-white/10 border-white/15 text-white/40 hover:bg-white/15 hover:text-white"
                        )}
                      >
                        <span className="text-[10px] font-bold font-mono">P{idx + 1}</span>
                        <span className="text-[10px]">{isCompleted ? "📦 ✓" : "📦"}</span>
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
                        "w-12 h-12 rounded-xl border flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden active:scale-95 cursor-pointer shadow-sm",
                        nobPicoDone
                          ? "bg-purple-600/30 border-purple-400 text-purple-200 font-bold"
                          : "bg-white/10 border-white/15 border-dashed text-white/40 hover:bg-white/15"
                      )}
                    >
                      <span className="text-[9px] font-bold font-mono">PICO</span>
                      <span className="text-[8px] opacity-80">{nobPico}c</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Sección Milagro */}
            <div className={cn(
              "space-y-2 border rounded-2xl p-4 transition-all duration-500",
              isMilagroActive
                ? goldMode
                  ? "border-amber-500/50 bg-amber-950/40 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                  : "border-emerald-500/50 bg-emerald-950/40 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                : "border-white/10 bg-white/5 opacity-50"
            )}>
              <p className={cn(
                "text-xs uppercase tracking-[0.18em] font-black text-center lg:text-left flex items-center justify-center lg:justify-start gap-1.5",
                goldMode ? "text-amber-300" : "text-emerald-300"
              )}>
                {hasNoblejas ? "😇 Milagro" : "🪵 Producción Milagro"} ({milPalletsDone} / {milPalletsTotal} palets)
                {isMilagroActive && (
                  <span className={cn("w-2 h-2 rounded-full animate-ping", goldMode ? "bg-amber-400" : "bg-emerald-400")} />
                )}
                {milPalletsDone >= milPalletsTotal && (!milPico || milPicoDone) && (
                  <span>✅</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2 justify-center lg:justify-start max-w-sm mx-auto lg:mx-0">
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
                        "w-12 h-12 rounded-xl border flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden active:scale-95 cursor-pointer shadow-sm",
                        isCompleted
                          ? goldMode
                            ? "bg-amber-500/30 border-amber-400 text-amber-200 font-bold"
                            : "bg-emerald-600/30 border-emerald-400 text-emerald-200 font-bold"
                          : "bg-white/10 border-white/15 text-white/40 hover:bg-white/15 hover:text-white"
                      )}
                    >
                      <span className="text-[10px] font-bold font-mono">P{idx + 1}</span>
                      <span className="text-[10px]">{isCompleted ? "📦 ✓" : "📦"}</span>
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
                      "w-12 h-12 rounded-xl border flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden active:scale-95 cursor-pointer shadow-sm",
                      milPicoDone
                        ? goldMode
                          ? "bg-amber-500/30 border-amber-400 text-amber-200 font-bold"
                          : "bg-emerald-600/30 border-emerald-400 text-emerald-200 font-bold"
                        : "bg-white/10 border-white/15 border-dashed text-white/40 hover:bg-white/15"
                    )}
                  >
                    <span className="text-[9px] font-bold font-mono">PICO</span>
                    <span className="text-[8px] opacity-80">{milPico}c</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Estadísticas de cajas y navegación */}
          <div className="flex flex-col gap-3 max-w-sm mx-auto lg:mx-0 w-full border-t border-white/10 pt-3">
            <div className="flex justify-between items-center text-xs font-bold text-white/80">
              <span>📦 Cajas: {currentDone} / {totalCajasObjetivo}</span>
              <span className="text-white/50">{totalCajasObjetivo - currentDone} restantes</span>
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
                  className="flex-1 py-3 px-4 text-xs font-black rounded-2xl bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 hover:text-white transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-md shrink-0"
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
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/25 animate-pulse font-black"
                    : "bg-white/15 border border-white/20 text-white hover:bg-white/25"
                )}
              >
                <span>{queue[currentQueueIndex + 1] ? "SIGUIENTE ➔" : "FINALIZAR ➔"}</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 mt-6 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white/50 flex-wrap gap-2">
        <div>
          Formato {currentQueueIndex + 1} de {queue.length} en Cola
        </div>
        {queue[currentQueueIndex + 1] ? (() => {
          const nextItem = queue[currentQueueIndex + 1];
          const transition = getTransitionType(current, nextItem);
          return (
            <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-[10px] sm:text-[11px] text-white/90 backdrop-blur-md transition-all select-none shrink-0">
              <span className="text-white/40 font-black">SIGUIENTE:</span>
              <span className="font-extrabold text-white">{nextItem.saladName}</span>
              <span className="text-white/60 font-bold">({nextItem.boxType})</span>
              
              {transition === "salad-change" && (
                <span className="bg-red-500/30 border border-red-500/50 text-red-300 text-[8px] font-black uppercase px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                  🥗 CAMBIO
                </span>
              )}
              {transition === "box-change" && (
                <span className="bg-orange-500/30 border border-orange-500/50 text-orange-300 text-[8px] font-black uppercase px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                  📦 CAJA
                </span>
              )}
              {transition === "lote-change" && (
                <span className="bg-purple-500/30 border border-purple-500/50 text-purple-300 text-[8px] font-black uppercase px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                  🔄 LOTE
                </span>
              )}
            </div>
          );
        })() : (
          <span className="text-[10px] font-bold text-white/40 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 select-none shrink-0 uppercase tracking-widest">
            🏁 Fin de Cola
          </span>
        )}
      </div>
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
