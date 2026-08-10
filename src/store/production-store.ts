"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Salad,
  QueueItem,
  FormatProgress,
  HistoryItem,
  TemplateItem,
} from "@/types/types";
import { generateId, calculateFormat, DEFAULT_BOX_TYPES } from "@/types/types";

import { 
  getProductionLines, 
  fetchLineData, 
  syncLineState, 
  syncQueueItems, 
  syncProgress, 
  saveHistoryLog 
} from "@/lib/supabase-service";

// Canal de sincronización local instantánea entre pestañas/monitores (<10ms)
const localSyncChannel = typeof window !== "undefined" && "BroadcastChannel" in window
  ? new BroadcastChannel("kpi_salad_local_sync")
  : null;

if (localSyncChannel) {
  localSyncChannel.onmessage = (event) => {
    if (event.data?.type === "LINE_DATA_UPDATED") {
      const state = useProductionStore.getState();
      if (state.activeLineCode === event.data.lineCode || state.activeLineCode === "ALL") {
        state.loadActiveLineData();
      }
    }
  };
}

function broadcastLocalChange(lineCode: string) {
  try {
    localSyncChannel?.postMessage({ type: "LINE_DATA_UPDATED", lineCode });
  } catch {}
}

// Helper para sintetizar sonidos limpios táctiles e industriales
function playSynthSound(type: "click" | "success") {
  if (typeof window === "undefined") return;
  try {
    const storeState = useProductionStore.getState();
    if (!storeState || !storeState.soundEnabled || !storeState.goldMode) return;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    if (type === "click") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === "success") {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "triangle";
      osc.frequency.setValueAtTime(330, ctx.currentTime); // E4
      osc.frequency.setValueAtTime(392, ctx.currentTime + 0.08); // G4
      osc.frequency.setValueAtTime(523, ctx.currentTime + 0.16); // C5
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.24); // E5
      
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(333, ctx.currentTime);
      osc2.frequency.setValueAtTime(395, ctx.currentTime + 0.08);
      osc2.frequency.setValueAtTime(526, ctx.currentTime + 0.16);
      osc2.frequency.setValueAtTime(662, ctx.currentTime + 0.24);
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.002, ctx.currentTime + 0.45);
      
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc2.start();
      osc.stop(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.5);
    }
  } catch (e) {
    console.error("AudioContext error:", e);
  }
}

// ===== ESTADO DEL STORE =====

interface Bookmark {
  id: string;
  label: string;
  url: string;
}

interface ProductionState {
  // Multilínea
  activeLineCode: string; // 'K00' | 'K01' | 'K02' | 'K03' | 'ALL'
  activeLineId: string | null;
  lineStorage: Record<string, {
    salads: Salad[];
    queue: QueueItem[];
    currentQueueIndex: number;
    currentProgress: FormatProgress | null;
    queueProgress: Record<string, FormatProgress>;
    isProducing: boolean;
  }>;
  setActiveLineCode: (code: string) => Promise<void>;
  loadActiveLineData: () => Promise<void>;

  // Datos
  salads: Salad[];
  queue: QueueItem[];

  // Producción
  currentQueueIndex: number;
  currentProgress: FormatProgress | null;
  queueProgress: Record<string, FormatProgress>;
  isProducing: boolean;
  formatStartTime: number | null;

  // UI
  showCalculator: boolean;
  showTransitionBanner: boolean;
  showSplitView: boolean;
  iframeUrl: string;
  bookmarks: Bookmark[];
  highContrastMode: boolean; // Modo Alto Contraste para fábrica
  goldMode: boolean; // Modo Premium Gold (Easter Egg)
  soundEnabled: boolean; // Control de sonido táctil
  palletSpeeds: number[]; // Velocidades instantáneas de paletizado (cajas/minuto)
  ambientMode: boolean; // Modo Ambiente a pantalla completa
  editingQueueItemId: string | null; // ID del elemento de la cola en edición
  isLoggedIn: boolean; // Estado de autenticación
  customDayLabelIndex: number | null; // Selector manual de día / color de etiqueta (Gold / Planta)
  isScreenLocked: boolean; // Modo Bloqueo Táctil de Pantalla (Glove-lock)
  login: (username: string, password: string) => boolean;
  logout: () => void;
  setCustomDayLabelIndex: (index: number | null) => void;
  toggleScreenLock: () => void;

  // ===== ACCIONES: ENSALADAS =====
  addSalad: (salad: Salad, targetLineCode?: string) => void;
  removeSalad: (id: string) => void;
  updateSalad: (id: string, salad: Partial<Salad>) => void;

  // ===== ACCIONES: COLA =====
  buildQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  removeFromQueue: (index: number) => void;

  // ===== ACCIONES: PRODUCCIÓN =====
  startProduction: () => void;
  addPallet: () => void;
  removePallet: () => void;
  adjustBoxesDelta: (delta: number) => void;
  finishFormat: () => void;
  setPicoCompleted: (value: boolean) => void;
  setNoblejasCompleted: (value: boolean) => void;
  // Acciones para noblejas interactivo
  addNobjelasPallet: () => void;
  removeNobjelasPallet: () => void;
  setNobjelasPicoCompleted: (value: boolean) => void;
  advanceToNext: () => void;
  jumpToQueueItem: (index: number) => void;
  resetProduction: () => void;
  clearQueueAndSalads: () => void;
  history: HistoryItem[];
  clearHistory: () => void;
  wipeAllData: () => void;

  // ===== ACCIONES: TEMPLATES (FAVORITOS) =====
  templates: TemplateItem[];
  addTemplate: (item: Omit<TemplateItem, "id">) => void;
  removeTemplate: (id: string) => void;
  loadTemplate: (template: TemplateItem) => void;
  reproduceFromHistory: (item: Omit<HistoryItem, "id" | "date" | "duration">) => void;

  // ===== ACCIONES: UI =====
  toggleCalculator: () => void;
  hideTransitionBanner: () => void;
  toggleSplitView: () => void;
  setIframeUrl: (url: string) => void;
  addBookmark: (label: string, url: string) => void;
  removeBookmark: (id: string) => void;
  toggleHighContrastMode: () => void; // Toggle Alto Contraste
  toggleGoldMode: () => void; // Toggle Modo Premium Gold
  toggleSoundEnabled: () => void; // Activar/desactivar sonido
  toggleAmbientMode: () => void; // Activar/desactivar modo pantalla completa ambientador
  setEditingQueueItemId: (id: string | null) => void;
  updateQueueItem: (id: string, updates: Partial<QueueItem>) => void;
}

// Helper para crear el estado inicial de progreso
function createInitialProgress(queueItemId: string): FormatProgress {
  return {
    queueItemId,
    completedPallets: 0,
    picoCompleted: false,
    noblejasCompleted: false,
    noblejasCompletedPallets: 0,
    nobjelasPicoCompleted: false,
    finished: false,
    palletLastUpdated: 0,
    lastPalletTimestamp: null,
    lastPalletIntervalMs: null,
    declinedAutoAdvance: false,
  };
}

// Helper para formatear duraciones de producción
function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export const useProductionStore = create<ProductionState>()(
  persist(
    (set, get) => ({
      // Multilínea
      activeLineCode: "K00",
      activeLineId: null,
      lineStorage: {},

      setActiveLineCode: async (code: string) => {
        const prevCode = get().activeLineCode;
        if (prevCode && prevCode !== "ALL") {
          // Guardar snapshot de la línea actual en memoria local
          const currentSnapshot = {
            salads: get().salads,
            queue: get().queue,
            currentQueueIndex: get().currentQueueIndex,
            currentProgress: get().currentProgress,
            queueProgress: get().queueProgress,
            isProducing: get().isProducing,
          };
          set((s) => ({
            lineStorage: { ...s.lineStorage, [prevCode]: currentSnapshot },
          }));
        }

        set({ activeLineCode: code });
        if (code === "ALL") return;

        // Restaurar inmediatamente el estado de la línea seleccionada (0ms de latencia)
        const saved = get().lineStorage[code];
        if (saved) {
          set({
            salads: saved.salads || [],
            queue: saved.queue || [],
            currentQueueIndex: saved.currentQueueIndex || 0,
            currentProgress: saved.currentProgress || null,
            queueProgress: saved.queueProgress || {},
            isProducing: saved.isProducing || false,
          });
        } else {
          set({
            salads: [],
            queue: [],
            currentQueueIndex: 0,
            currentProgress: null,
            queueProgress: {},
            isProducing: false,
          });
        }

        // Sincronizar con la base de datos de Supabase
        await get().loadActiveLineData();
      },

      loadActiveLineData: async () => {
        const { activeLineCode, queue: currentLocalQueue, salads: currentLocalSalads } = get();
        if (activeLineCode === "ALL") return;

        try {
          const lines = await getProductionLines();
          const currentLine = lines.find((l) => l.code === activeLineCode);
          if (currentLine) {
            set({ activeLineId: currentLine.id });
            const data = await fetchLineData(currentLine.id);
            if (data.queue && data.queue.length > 0) {
              const currentQueueItem = data.queue[data.currentQueueIndex];
              const prog = currentQueueItem
                ? data.queueProgress[currentQueueItem.id] || createInitialProgress(currentQueueItem.id)
                : null;

              // Reconstruir lista de ensaladas a partir de la cola de esta línea
              const saladMap = new Map<string, Salad>();
              data.queue.forEach((q) => {
                if (!saladMap.has(q.saladId)) {
                  saladMap.set(q.saladId, {
                    id: q.saladId,
                    name: q.saladName,
                    formats: [],
                  });
                }
                saladMap.get(q.saladId)!.formats.push({
                  id: q.formatId,
                  boxType: q.boxType,
                  quantity: q.quantity,
                  noblejas: q.noblejas,
                  boxesPerPallet: q.boxesPerPallet,
                  note: q.note,
                  lote: q.lote,
                  cambioLote: q.cambioLote,
                  fechaCaducidad: q.fechaCaducidad,
                  linea: q.linea,
                });
              });
              const reconstructedSalads = Array.from(saladMap.values());

              const lineState = {
                queue: data.queue,
                salads: reconstructedSalads,
                queueProgress: data.queueProgress,
                currentQueueIndex: data.currentQueueIndex,
                isProducing: data.isProducing,
                currentProgress: prog,
              };

              set((s) => ({
                ...lineState,
                lineStorage: { ...s.lineStorage, [activeLineCode]: lineState },
              }));
            } else if (currentLocalQueue && currentLocalQueue.length > 0) {
              // Si la base de datos respondió vacía pero hay cola local, sincronizar hacia Supabase para evitar pérdidas
              await syncQueueItems(currentLine.id, currentLocalQueue);
            } else {
              // La línea realmente está vacía y no tiene cola local
              const emptyState = {
                queue: [],
                salads: [],
                queueProgress: {},
                currentQueueIndex: 0,
                isProducing: false,
                currentProgress: null,
              };
              set((s) => ({
                ...emptyState,
                lineStorage: { ...s.lineStorage, [activeLineCode]: emptyState },
              }));
            }
          }
        } catch (e) {
          console.error("Error cargando datos de línea:", e);
        }
      },

      // Estado inicial
      salads: [],
      queue: [],
      currentQueueIndex: 0,
      currentProgress: null,
      queueProgress: {},
      isProducing: false,
      formatStartTime: null,
      showCalculator: false,
      showTransitionBanner: false,
      showSplitView: false,
      iframeUrl: "https://isra.dev",
      bookmarks: [
        { id: "bk-1", label: "Portal Vegaindus", url: "http://portalindustrial.vegaindus.com" },
      ],
      highContrastMode: false,
      goldMode: false,
      soundEnabled: false,
      palletSpeeds: [],
      ambientMode: false,
      history: [],
      templates: [],
      editingQueueItemId: null,
      isLoggedIn: true,
      customDayLabelIndex: null,
      isScreenLocked: false,

      // ===== ENSALADAS =====

      addSalad: async (salad, targetLineCode) => {
        const state = get();
        const lineCodeToUse = targetLineCode || state.activeLineCode;

        // Obtener ID de la línea si no está cargado
        let lineIdToUse = state.activeLineId;
        if (targetLineCode && targetLineCode !== state.activeLineCode) {
          const lines = await getProductionLines();
          const targetLine = lines.find((l) => l.code === targetLineCode);
          if (targetLine) lineIdToUse = targetLine.id;
        }

        const newQueueItems: QueueItem[] = salad.formats.map((format) => ({
          id: generateId(),
          saladId: salad.id,
          saladName: salad.name,
          formatId: format.id,
          boxType: format.boxType,
          quantity: format.quantity,
          noblejas: format.noblejas,
          boxesPerPallet: format.boxesPerPallet,
          note: format.note,
          lote: format.lote,
          cambioLote: format.cambioLote,
          fechaCaducidad: format.fechaCaducidad,
          linea: lineCodeToUse,
        }));

        if (lineCodeToUse === state.activeLineCode) {
          const updatedQueue = [...state.queue, ...newQueueItems];
          const updatedSalads = [...state.salads, salad];

          // Iniciar producción automáticamente directamente al crear
          const isNewStart = !state.isProducing || state.queue.length === 0 || !state.currentProgress;
          const currentQueueIndex = isNewStart ? 0 : state.currentQueueIndex;
          const currentItem = updatedQueue[currentQueueIndex] || updatedQueue[0];

          const updatedQueueProgress: Record<string, FormatProgress> = { ...(state.queueProgress || {}) };
          newQueueItems.forEach((item) => {
            if (!updatedQueueProgress[item.id]) {
              updatedQueueProgress[item.id] = createInitialProgress(item.id);
            }
          });

          const currentProgress = currentItem
            ? updatedQueueProgress[currentItem.id] || createInitialProgress(currentItem.id)
            : null;

          if (currentProgress && currentItem) {
            updatedQueueProgress[currentItem.id] = currentProgress;
          }

          const lineState = {
            salads: updatedSalads,
            queue: updatedQueue,
            currentQueueIndex,
            currentProgress,
            queueProgress: updatedQueueProgress,
            isProducing: true,
            formatStartTime: state.formatStartTime || Date.now(),
          };

          set((s) => ({
            ...lineState,
            lineStorage: {
              ...s.lineStorage,
              [lineCodeToUse]: lineState,
            },
          }));

          // Sincronización completa con Supabase
          if (lineIdToUse) {
            await syncQueueItems(lineIdToUse, updatedQueue);
            await syncLineState(lineIdToUse, true, currentQueueIndex);
            if (currentProgress && currentItem) {
              await syncProgress(currentItem.id, currentProgress);
            }
          }
          broadcastLocalChange(lineCodeToUse);
        } else {
          // Guardar en la línea objetivo
          if (lineIdToUse) {
            const data = await fetchLineData(lineIdToUse);
            const targetQueue = [...data.queue, ...newQueueItems];
            await syncQueueItems(lineIdToUse, targetQueue);
            if (!data.isProducing || data.queue.length === 0) {
              await syncLineState(lineIdToUse, true, 0);
              const firstItem = targetQueue[0];
              if (firstItem) {
                await syncProgress(firstItem.id, createInitialProgress(firstItem.id));
              }
            }
          }
          broadcastLocalChange(lineCodeToUse);
        }
      },

      removeSalad: (id) =>
        set((state) => ({
          salads: state.salads.filter((s) => s.id !== id),
          queue: state.queue.filter((q) => q.saladId !== id),
        })),

      updateSalad: (id, updates) =>
        set((state) => {
          const updatedSalads = state.salads.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          );

          const targetSalad = updatedSalads.find((s) => s.id === id);
          if (!targetSalad) return { salads: updatedSalads };

          let newQueue = [...state.queue];

          // 1. Remove queue items whose format was deleted from the salad
          const saladFormatIds = new Set(targetSalad.formats.map((f) => f.id));
          newQueue = newQueue.filter((q) => q.saladId !== id || saladFormatIds.has(q.formatId));

          // 2. Update existing formats in the queue or append new formats added to the salad
          targetSalad.formats.forEach((format) => {
            const existingIndex = newQueue.findIndex(
              (q) => q.saladId === id && q.formatId === format.id
            );
            if (existingIndex > -1) {
              newQueue[existingIndex] = {
                ...newQueue[existingIndex],
                saladName: targetSalad.name,
                boxType: format.boxType,
                quantity: format.quantity,
                noblejas: format.noblejas,
                boxesPerPallet: format.boxesPerPallet,
                note: format.note,
                lote: format.lote,
                cambioLote: format.cambioLote,
                fechaCaducidad: format.fechaCaducidad,
                linea: format.linea,
              };
            } else {
              newQueue.push({
                id: generateId(),
                saladId: targetSalad.id,
                saladName: targetSalad.name,
                formatId: format.id,
                boxType: format.boxType,
                quantity: format.quantity,
                noblejas: format.noblejas,
                boxesPerPallet: format.boxesPerPallet,
                note: format.note,
                lote: format.lote,
                cambioLote: format.cambioLote,
                fechaCaducidad: format.fechaCaducidad,
                linea: format.linea,
              });
            }
          });

          return {
            salads: updatedSalads,
            queue: newQueue,
          };
        }),

      // ===== COLA =====

      buildQueue: () => {
        const { salads } = get();
        const queue: QueueItem[] = [];

        for (const salad of salads) {
          for (const format of salad.formats) {
            queue.push({
              id: generateId(),
              saladId: salad.id,
              saladName: salad.name,
              formatId: format.id,
              boxType: format.boxType,
              quantity: format.quantity,
              noblejas: format.noblejas,
              boxesPerPallet: format.boxesPerPallet,
              note: format.note,
              lote: format.lote,
              cambioLote: format.cambioLote,
              fechaCaducidad: format.fechaCaducidad,
              linea: format.linea,
            });
          }
        }

        set({ queue });
      },

      reorderQueue: (fromIndex, toIndex) =>
        set((state) => {
          const newQueue = [...state.queue];
          const [moved] = newQueue.splice(fromIndex, 1);
          newQueue.splice(toIndex, 0, moved);
          if (state.activeLineId) {
            syncQueueItems(state.activeLineId, newQueue);
          }
          return { queue: newQueue };
        }),

      removeFromQueue: (index) =>
        set((state) => {
          const newQueue = state.queue.filter((_, i) => i !== index);
          if (state.activeLineId) {
            syncQueueItems(state.activeLineId, newQueue);
          }
          return { queue: newQueue };
        }),

      // ===== PRODUCCIÓN =====

      startProduction: () => {
        const { queue, activeLineId } = get();
        if (queue.length === 0) return;

        const progressMap: Record<string, FormatProgress> = {};
        queue.forEach((item) => {
          progressMap[item.id] = createInitialProgress(item.id);
        });

        if (activeLineId) {
          syncLineState(activeLineId, true, 0);
        }

        set({
          isProducing: true,
          currentQueueIndex: 0,
          currentProgress: progressMap[queue[0].id],
          queueProgress: progressMap,
          showTransitionBanner: false,
          formatStartTime: Date.now(),
          palletSpeeds: [],
        });
      },

      addPallet: () => {
        const state = get();
        if (!state.currentProgress || state.currentProgress.finished) return;

        const current = state.queue[state.currentQueueIndex];
        if (!current) return;

        const calc = calculateFormat({
          id: current.formatId,
          boxType: current.boxType,
          quantity: current.quantity,
          noblejas: current.noblejas,
          boxesPerPallet: current.boxesPerPallet,
        });

        if (state.currentProgress.completedPallets >= calc.pallets) return;

        if (state.soundEnabled) playSynthSound("click");

        const now = Date.now();
        const prevTime = state.currentProgress.lastPalletTimestamp || state.formatStartTime || now;
        const elapsedMs = now - prevTime;
        let speed = 45;
        if (elapsedMs > 1500) {
          speed = current.boxesPerPallet / (elapsedMs / 60000);
        }
        const finalSpeed = Math.round(Math.max(15, Math.min(speed, 95)));
        const newSpeeds = [...state.palletSpeeds, finalSpeed].slice(-10);

        const updatedProgress = {
          ...state.currentProgress,
          completedPallets: state.currentProgress.completedPallets + 1,
          palletLastUpdated: now, // Trigger flash visual
          lastPalletTimestamp: now,
          lastPalletIntervalMs: state.currentProgress.lastPalletTimestamp ? elapsedMs : null,
        };

        syncProgress(current.id, updatedProgress);

        set({
          palletSpeeds: newSpeeds,
          currentProgress: updatedProgress,
          queueProgress: {
            ...(state.queueProgress || {}),
            [current.id]: updatedProgress,
          },
        });
      },

      removePallet: () =>
        set((state) => {
          if (!state.currentProgress) return state;
          if (state.currentProgress.completedPallets <= 0) return state;

          const current = state.queue[state.currentQueueIndex];
          if (!current) return state;

          const updatedProgress = {
            ...state.currentProgress,
            completedPallets: state.currentProgress.completedPallets - 1,
            palletLastUpdated: Date.now(), // Trigger flash visual
          };

          syncProgress(current.id, updatedProgress);

          return {
            currentProgress: updatedProgress,
            queueProgress: {
              ...(state.queueProgress || {}),
              [current.id]: updatedProgress,
            },
          };
        }),

      adjustBoxesDelta: (delta: number) =>
        set((state) => {
          if (!state.currentProgress) return state;

          const current = state.queue[state.currentQueueIndex];
          if (!current) return state;

          const currentAdj = state.currentProgress.boxesAdjustment || 0;
          const newAdj = currentAdj + delta;

          if (state.soundEnabled) playSynthSound("click");

          const updatedProgress = {
            ...state.currentProgress,
            boxesAdjustment: newAdj,
            palletLastUpdated: Date.now(),
          };

          syncProgress(current.id, updatedProgress);

          return {
            currentProgress: updatedProgress,
            queueProgress: {
              ...(state.queueProgress || {}),
              [current.id]: updatedProgress,
            },
          };
        }),

      finishFormat: () =>
        set((state) => {
          if (!state.currentProgress) return state;

          const current = state.queue[state.currentQueueIndex];
          if (!current) return state;

          const updatedProgress = {
            ...state.currentProgress,
            finished: true,
          };

          syncProgress(current.id, updatedProgress);

          return {
            currentProgress: updatedProgress,
            queueProgress: {
              ...(state.queueProgress || {}),
              [current.id]: updatedProgress,
            },
          };
        }),

      setPicoCompleted: (value) =>
        set((state) => {
          if (!state.currentProgress) return state;
          if (value && state.soundEnabled) playSynthSound("click");

          const current = state.queue[state.currentQueueIndex];
          if (!current) return state;

          const updatedProgress = {
            ...state.currentProgress,
            picoCompleted: value,
          };

          syncProgress(current.id, updatedProgress);

          return {
            currentProgress: updatedProgress,
            queueProgress: {
              ...(state.queueProgress || {}),
              [current.id]: updatedProgress,
            },
          };
        }),

      setNoblejasCompleted: (value) =>
        set((state) => {
          if (!state.currentProgress) return state;
          if (value && state.soundEnabled) playSynthSound("success");

          const current = state.queue[state.currentQueueIndex];
          if (!current) return state;

          const updatedProgress = {
            ...state.currentProgress,
            noblejasCompleted: value,
          };

          syncProgress(current.id, updatedProgress);

          return {
            currentProgress: updatedProgress,
            queueProgress: {
              ...(state.queueProgress || {}),
              [current.id]: updatedProgress,
            },
          };
        }),

      // ===== ACCIONES: NOBLEJAS INTERACTIVO =====

      addNobjelasPallet: () => {
        const state = get();
        if (!state.currentProgress || state.currentProgress.finished) return;

        const current = state.queue[state.currentQueueIndex];
        if (!current) return;

        const nobjelasPallets = Math.floor(current.noblejas / current.boxesPerPallet);
        if (state.currentProgress.noblejasCompletedPallets >= nobjelasPallets) return;

        if (state.soundEnabled) playSynthSound("click");

        const now = Date.now();
        const prevTime = state.currentProgress.lastPalletTimestamp || state.formatStartTime || now;
        const elapsedMs = now - prevTime;

        const newCompleted = state.currentProgress.noblejasCompletedPallets + 1;
        const nobjelasPico = current.noblejas % current.boxesPerPallet;
        const picoOk = nobjelasPico === 0 || state.currentProgress.nobjelasPicoCompleted;
        const isAllDone = newCompleted >= nobjelasPallets && picoOk;

        const updatedProgress = {
          ...state.currentProgress,
          noblejasCompletedPallets: newCompleted,
          noblejasCompleted: isAllDone,
          palletLastUpdated: now,
          lastPalletTimestamp: now,
          lastPalletIntervalMs: state.currentProgress.lastPalletTimestamp ? elapsedMs : null,
        };

        syncProgress(current.id, updatedProgress);

        set({
          currentProgress: updatedProgress,
          queueProgress: {
            ...(state.queueProgress || {}),
            [current.id]: updatedProgress,
          },
        });
      },

      removeNobjelasPallet: () =>
        set((state) => {
          if (!state.currentProgress) return state;
          if (state.currentProgress.noblejasCompletedPallets <= 0) return state;

          const current = state.queue[state.currentQueueIndex];
          if (!current) return state;

          const newCompleted = state.currentProgress.noblejasCompletedPallets - 1;
          const nobjelasPallets = Math.floor(current.noblejas / current.boxesPerPallet);
          const nobjelasPico = current.noblejas % current.boxesPerPallet;
          const picoOk = nobjelasPico === 0 || state.currentProgress.nobjelasPicoCompleted;
          const isAllDone = newCompleted >= nobjelasPallets && picoOk;

          const updatedProgress = {
            ...state.currentProgress,
            noblejasCompletedPallets: newCompleted,
            noblejasCompleted: isAllDone,
          };

          syncProgress(current.id, updatedProgress);

          return {
            currentProgress: updatedProgress,
            queueProgress: {
              ...(state.queueProgress || {}),
              [current.id]: updatedProgress,
            },
          };
        }),

      setNobjelasPicoCompleted: (value) =>
        set((state) => {
          if (!state.currentProgress) return state;
          if (value && state.soundEnabled) playSynthSound("click");

          const current = state.queue[state.currentQueueIndex];
          if (!current) return state;

          const nobjelasPallets = Math.floor(current.noblejas / current.boxesPerPallet);
          const isAllDone =
            state.currentProgress.noblejasCompletedPallets >= nobjelasPallets && value;

          const updatedProgress = {
            ...state.currentProgress,
            nobjelasPicoCompleted: value,
            noblejasCompleted: nobjelasPallets === 0 ? value : isAllDone,
          };

          syncProgress(current.id, updatedProgress);

          return {
            currentProgress: updatedProgress,
            queueProgress: {
              ...(state.queueProgress || {}),
              [current.id]: updatedProgress,
            },
          };
        }),

      advanceToNext: () => {
        const { queue, currentQueueIndex, formatStartTime, soundEnabled, activeLineId } = get();
        const nextIndex = currentQueueIndex + 1;
        const elapsedMs = formatStartTime ? Date.now() - formatStartTime : 0;
        const durationStr = elapsedMs > 0 ? formatDuration(elapsedMs) : "0s";

        const completedFormat = queue[currentQueueIndex];
        if (!completedFormat) return;

        const historyItem: HistoryItem = {
          id: completedFormat.id + "-" + Date.now(),
          saladName: completedFormat.saladName,
          boxType: completedFormat.boxType,
          quantity: completedFormat.quantity,
          noblejas: completedFormat.noblejas,
          boxesPerPallet: completedFormat.boxesPerPallet,
          date: new Date().toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          }) + " " + new Date().toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "2-digit",
          }),
          duration: durationStr,
        };

        saveHistoryLog(activeLineId, historyItem);

        if (soundEnabled) playSynthSound("success");

        if (nextIndex >= queue.length) {
          if (activeLineId) {
            syncLineState(activeLineId, false, nextIndex);
          }
          set((state) => ({
            isProducing: false,
            currentProgress: null,
            showTransitionBanner: false,
            history: [historyItem, ...(state.history || [])].slice(0, 30),
            formatStartTime: null,
            palletSpeeds: [],
          }));
          return;
        }

        const nextItem = queue[nextIndex];
        const nextProgress = (get().queueProgress || {})[nextItem.id] || createInitialProgress(nextItem.id);

        if (activeLineId) {
          syncLineState(activeLineId, true, nextIndex);
        }

        set((state) => ({
          currentQueueIndex: nextIndex,
          currentProgress: nextProgress,
          showTransitionBanner: true,
          formatStartTime: Date.now(),
          history: [historyItem, ...(state.history || [])].slice(0, 30),
          palletSpeeds: [],
          queueProgress: {
            ...(state.queueProgress || {}),
            [nextItem.id]: nextProgress,
          },
        }));
      },

      jumpToQueueItem: (index) => {
        const { queue, queueProgress } = get();
        if (index < 0 || index >= queue.length) return;

        const targetItem = queue[index];
        const progress = (queueProgress || {})[targetItem.id] || createInitialProgress(targetItem.id);

        const updatedProgress = {
          ...progress,
          finished: false,
          declinedAutoAdvance: true,
        };

        set((state) => {
          let newHistory = state.history || [];
          if (index < state.currentQueueIndex && newHistory.length > 0) {
            newHistory = newHistory.slice(1);
          }

          return {
            currentQueueIndex: index,
            currentProgress: updatedProgress,
            showTransitionBanner: false,
            formatStartTime: Date.now(),
            history: newHistory,
            queueProgress: {
              ...(state.queueProgress || {}),
              [targetItem.id]: updatedProgress,
            }
          };
        });
      },

      resetProduction: () =>
        set({
          isProducing: false,
          currentQueueIndex: 0,
          currentProgress: null,
          showTransitionBanner: false,
          formatStartTime: null,
          palletSpeeds: [],
        }),

      clearQueueAndSalads: () =>
        set({
          salads: [],
          queue: [],
          currentQueueIndex: 0,
          currentProgress: null,
          queueProgress: {},
          isProducing: false,
          formatStartTime: null,
          palletSpeeds: [],
        }),

       clearHistory: () =>
        set({ history: [] }),

      wipeAllData: () =>
        set({
          salads: [],
          queue: [],
          currentQueueIndex: 0,
          currentProgress: null,
          queueProgress: {},
          isProducing: false,
          formatStartTime: null,
          showCalculator: false,
          showTransitionBanner: false,
          history: [],
          templates: [],
        }),

      // ===== ACCIONES: TEMPLATES (FAVORITOS) =====
      addTemplate: (item) =>
        set((state) => ({
          templates: [
            ...(state.templates || []),
            { id: generateId(), ...item },
          ],
        })),

      removeTemplate: (id) =>
        set((state) => ({
          templates: (state.templates || []).filter((t) => t.id !== id),
        })),

      loadTemplate: (template) =>
        set((state) => {
          let bpp = template.boxesPerPallet;
          if (!bpp || isNaN(bpp)) {
            const match = DEFAULT_BOX_TYPES.find(
              (b) =>
                b.name.toLowerCase() === template.boxType.toLowerCase() ||
                b.id.toLowerCase() === template.boxType.toLowerCase()
            );
            bpp = match ? match.defaultBoxesPerPallet : 72;
          }

          const newSalad: Salad = {
            id: generateId(),
            name: template.saladName,
            formats: [
              {
                id: generateId(),
                boxType: template.boxType,
                quantity: template.quantity,
                noblejas: template.noblejas || 0,
                boxesPerPallet: bpp,
              },
            ],
          };
          const newQueueItem: QueueItem = {
            id: generateId(),
            saladId: newSalad.id,
            saladName: newSalad.name,
            formatId: newSalad.formats[0].id,
            boxType: newSalad.formats[0].boxType,
            quantity: newSalad.formats[0].quantity,
            noblejas: newSalad.formats[0].noblejas,
            boxesPerPallet: newSalad.formats[0].boxesPerPallet,
          };

          return {
            salads: [...state.salads, newSalad],
            queue: [...state.queue, newQueueItem],
          };
        }),

      reproduceFromHistory: (item) => {
        let bpp = item.boxesPerPallet;
        if (!bpp || isNaN(bpp)) {
          const match = DEFAULT_BOX_TYPES.find(
            (b) =>
              b.name.toLowerCase() === item.boxType.toLowerCase() ||
              b.id.toLowerCase() === item.boxType.toLowerCase()
          );
          bpp = match ? match.defaultBoxesPerPallet : 72;
        }

        const newSalad: Salad = {
          id: generateId(),
          name: item.saladName,
          formats: [
            {
              id: generateId(),
              boxType: item.boxType,
              quantity: item.quantity,
              noblejas: item.noblejas || 0,
              boxesPerPallet: bpp,
            },
          ],
        };
        set({
          salads: [newSalad],
        });
        get().buildQueue();
        get().startProduction();
      },

      // ===== UI =====

      toggleCalculator: () =>
        set((state) => ({ showCalculator: !state.showCalculator })),

      hideTransitionBanner: () =>
        set({ showTransitionBanner: false }),

      toggleSplitView: () =>
        set((state) => ({ showSplitView: !state.showSplitView })),

      setIframeUrl: (url) =>
        set({ iframeUrl: url }),

      addBookmark: (label, url) =>
        set((state) => ({
          bookmarks: [...state.bookmarks, { id: generateId(), label, url }],
        })),

      removeBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.id !== id),
        })),

      toggleHighContrastMode: () =>
        set((state) => ({ highContrastMode: !state.highContrastMode })),

      toggleGoldMode: () =>
        set((state) => ({ goldMode: !state.goldMode })),

      toggleSoundEnabled: () =>
        set((state) => ({ soundEnabled: !state.soundEnabled })),

      toggleAmbientMode: () =>
        set((state) => ({ ambientMode: !state.ambientMode })),

      setCustomDayLabelIndex: (index) =>
        set({ customDayLabelIndex: index }),

      toggleScreenLock: () =>
        set((state) => ({ isScreenLocked: !state.isScreenLocked })),

      setEditingQueueItemId: (id) =>
        set({ editingQueueItemId: id }),

      login: (_username, _password) => {
        set({ isLoggedIn: true });
        return true;
      },

      logout: () =>
        set({ isLoggedIn: true }),

      updateQueueItem: (id, updates) =>
        set((state) => {
          const newQueue = state.queue.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          );

          let nextProgress = state.currentProgress;
          const updatedQueueProgress = { ...(state.queueProgress || {}) };
          
          // Si estamos editando el item actual en producción, ajustar el progreso
          if (nextProgress && nextProgress.queueItemId === id) {
            const currentItem = newQueue.find((item) => item.id === id);
            if (currentItem) {
              const calc = calculateFormat({
                id: currentItem.formatId,
                boxType: currentItem.boxType,
                quantity: currentItem.quantity,
                noblejas: currentItem.noblejas,
                boxesPerPallet: currentItem.boxesPerPallet,
              });

              const nobPalletsMax = Math.floor(currentItem.noblejas / currentItem.boxesPerPallet);
              const nobPicoMax = currentItem.noblejas % currentItem.boxesPerPallet;

              // Clamp completed pallets/noblejas to new maximums
              const completedPallets = Math.min(nextProgress.completedPallets, calc.pallets);
              const noblejasCompletedPallets = Math.min(
                nextProgress.noblejasCompletedPallets,
                nobPalletsMax
              );

              // Reset pico/noblejas pico completed if they are now 0, or keep their values
              const picoCompleted = calc.pico > 0 ? nextProgress.picoCompleted : false;
              const nobjelasPicoCompleted = nobPicoMax > 0 ? nextProgress.nobjelasPicoCompleted : false;

              // Recalculate finished status
              const isNoblejasDone =
                noblejasCompletedPallets >= nobPalletsMax &&
                (nobPicoMax === 0 || nobjelasPicoCompleted);
              const isPalletsDone = completedPallets >= calc.pallets;
              const isPicoDone = calc.pico === 0 || picoCompleted;
              const finished = isNoblejasDone && isPalletsDone && isPicoDone;

              nextProgress = {
                ...nextProgress,
                completedPallets,
                noblejasCompletedPallets,
                picoCompleted,
                nobjelasPicoCompleted,
                noblejasCompleted: isNoblejasDone,
                finished,
              };
            }
          }

          const item = newQueue.find((i) => i.id === id);
          if (item && updatedQueueProgress[id]) {
            const itemProgress = updatedQueueProgress[id];
            const calc = calculateFormat({
              id: item.formatId,
              boxType: item.boxType,
              quantity: item.quantity,
              noblejas: item.noblejas,
              boxesPerPallet: item.boxesPerPallet,
            });

            const nobPalletsMax = Math.floor(item.noblejas / item.boxesPerPallet);
            const nobPicoMax = item.noblejas % item.boxesPerPallet;

            const completedPallets = Math.min(itemProgress.completedPallets, calc.pallets);
            const noblejasCompletedPallets = Math.min(
              itemProgress.noblejasCompletedPallets,
              nobPalletsMax
            );

            const picoCompleted = calc.pico > 0 ? itemProgress.picoCompleted : false;
            const nobjelasPicoCompleted = nobPicoMax > 0 ? itemProgress.nobjelasPicoCompleted : false;

            const isNoblejasDone =
              noblejasCompletedPallets >= nobPalletsMax &&
              (nobPicoMax === 0 || nobjelasPicoCompleted);
            const isPalletsDone = completedPallets >= calc.pallets;
            const isPicoDone = calc.pico === 0 || picoCompleted;
            const finished = isNoblejasDone && isPalletsDone && isPicoDone;

            const newProg = {
              ...itemProgress,
              completedPallets,
              noblejasCompletedPallets,
              picoCompleted,
              nobjelasPicoCompleted,
              noblejasCompleted: isNoblejasDone,
              finished,
            };

            updatedQueueProgress[id] = newProg;
            if (id === state.currentProgress?.queueItemId) {
              nextProgress = newProg;
            }
          }

          return {
            queue: newQueue,
            currentProgress: nextProgress,
            queueProgress: updatedQueueProgress,
          };
        }),
    }),
    {
      name: "salad-production-storage",
      merge: (persistedState: unknown, currentState) => ({
        ...currentState,
        ...(persistedState as object),
        isLoggedIn: true,
      }),
    }
  )
);
