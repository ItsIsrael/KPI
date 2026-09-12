"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Salad,
  QueueItem,
  FormatProgress,
  HistoryItem,
  TemplateItem,
  OrderRow,
  ParsedExcelRow,
} from "@/types/types";
import { generateId, calculateFormat, DEFAULT_BOX_TYPES } from "@/types/types";

import { 
  getProductionLines, 
  fetchLineData, 
  syncLineState, 
  syncQueueItems, 
  syncProgress, 
  saveHistoryLog,
  hardResetLine,
  syncPendingExcelData,
  fetchPendingExcelData,
  syncNoblejasConfig,
  fetchNoblejasConfig,
} from "@/lib/supabase-service";
import type { AuthUserProfile } from "@/lib/auth";
import { signOutSupabase } from "@/lib/auth";

// Canal de sincronización local instantánea entre pestañas/monitores (<10ms)
const localSyncChannel = typeof window !== "undefined" && "BroadcastChannel" in window
  ? new BroadcastChannel("kpi_salad_local_sync")
  : null;

if (localSyncChannel) {
  localSyncChannel.onmessage = (event) => {
    if (event.data?.type === "LINE_DATA_UPDATED") {
      const state = useProductionStore.getState();
      if (state.activeLineCode === event.data.lineCode || state.activeLineCode === "ALL") {
        // loadActiveLineData no carga nada en ALL; el dashboard necesita
        // reconstruir el almacenamiento de las cuatro líneas.
        if (state.activeLineCode === "ALL") {
          void state.loadAllLinesData();
        } else {
          void state.loadActiveLineData();
        }
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
  parsedExcelData: ParsedExcelRow[];
  setParsedExcelData: (data: ParsedExcelRow[]) => void;
  clearParsedExcelData: () => void;
  // Acciones de Línea
  lineStorage: Record<string, {
    salads: Salad[];
    queue: QueueItem[];
    currentQueueIndex: number;
    currentProgress: FormatProgress | null;
    queueProgress: Record<string, FormatProgress>;
    isProducing: boolean;
    manualOrderDrafts?: OrderRow[];
  }>;
  setActiveLineCode: (code: string) => Promise<void>;
  loadActiveLineData: () => Promise<void>;
  loadAllLinesData: () => Promise<void>;
  clearAllDatabase: () => Promise<void>;
  noblejasConfig: Record<string, number>;
  setNoblejasConfig: (codigo10e: string, boxes: number) => Promise<void>;
  setNoblejasConfigBulk: (configs: Record<string, number>) => Promise<void>;
  removeNoblejasConfig: (codigo10e: string) => void;

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
  authUser: AuthUserProfile | null; // Perfil autenticado real
  isLoggedIn: boolean; // Estado de autenticación
  currentUser: string | null; // Operador actual
  customDayLabelIndex: number | null; // Selector manual de día / color de etiqueta (Gold / Planta)
  isScreenLocked: boolean; // Modo Bloqueo Táctil de Pantalla (Glove-lock)
  setAuthUser: (user: AuthUserProfile | null) => void;
  logout: () => Promise<void>;
  setCustomDayLabelIndex: (index: number | null) => void;
  toggleScreenLock: () => void;

  // ===== ACCIONES: ENSALADAS =====
  addSalad: (salad: Salad, targetLineCode?: string) => Promise<void>;
  addSaladsBulk: (saladsWithLine: { salad: Salad; lineCode: string }[]) => Promise<void>;
  removeSalad: (id: string) => void;
  updateSalad: (id: string, salad: Partial<Salad>) => void;

  // ===== ACCIONES: COLA =====
  buildQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  multiLineReorderQueue: (lineCode: string, fromIndex: number, toIndex: number) => void;
  multiLineRemoveFromQueue: (lineCode: string, index: number) => void;
  multiLineClearQueueAndSalads: (lineCode: string) => void;
  updateManualOrderDrafts: (lineCode: string, drafts: OrderRow[]) => void;

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
  hardResetDatabase: () => Promise<void>;

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
  updateLineItemProgress: (lineCode: string, queueItemId: string, progress: FormatProgress) => void;
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

// No fiarse de activeLineId durante un cambio de pantalla: hasta que la nueva
// línea termina de cargar puede ser null (o, peor, pertenecer a la anterior).
async function resolveLineIdForCode(lineCode: string): Promise<string | null> {
  if (!lineCode || lineCode === "ALL") return null;
  const lines = await getProductionLines();
  return lines.find((line) => line.code === lineCode)?.id ?? null;
}

let currentLoadRequestId = 0;

// Timestamp de la última escritura local por línea para proteger contra race conditions
// con el realtime de Supabase. Cuando un realtime llega con datos vacíos pero
// la escritura local fue hace <10s, no sobreescribimos.
const lastLocalWriteTs: Record<string, number> = {};
const LOCAL_WRITE_PROTECTION_MS = 10_000; // 10 segundos de protección

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

        // Nunca conservar el id de la línea anterior durante una transición:
        // una mutación rápida no debe escribirse accidentalmente en esa línea.
        set({ activeLineCode: code, activeLineId: null });
        if (code === "ALL") {
          // Cargar datos de todas las líneas desde Supabase al entrar al Dashboard
          await get().loadAllLinesData();
          return;
        }

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
        
        // Si no hay Supabase, no intentes cargar datos (y así no borras el estado local)
        const { isSupabaseConfigured } = await import("@/lib/supabase");
        if (!isSupabaseConfigured) return;

        const requestId = ++currentLoadRequestId;

        try {
          const lines = await getProductionLines();
          if (requestId !== currentLoadRequestId) return;
          
          const currentLine = lines.find((l) => l.code === activeLineCode);
          if (currentLine) {
            set({ activeLineId: currentLine.id });
            const data = await fetchLineData(currentLine.id);
            if (requestId !== currentLoadRequestId) return;
            
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
            } else {
              // Supabase devolvió cola vacía — proteger contra race condition
              // Si la escritura local fue reciente (<10s), no sobreescribir datos locales
              const lastWrite = lastLocalWriteTs[activeLineCode] || 0;
              const localHasData = get().queue.length > 0 || (get().lineStorage[activeLineCode]?.queue?.length || 0) > 0;
              const isProtected = localHasData && (Date.now() - lastWrite < LOCAL_WRITE_PROTECTION_MS);

              if (!isProtected) {
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
              } else {
                console.log(`[loadActiveLineData] Protegido: Supabase devolvió vacío pero hay datos locales recientes para ${activeLineCode}`);
              }
            }
          }
        } catch (e) {
          console.error("Error cargando datos de línea:", e);
        }
      },

      loadAllLinesData: async () => {
        const { isSupabaseConfigured } = await import("@/lib/supabase");
        if (!isSupabaseConfigured) return;
        
        try {
          const lines = await getProductionLines();
          const newLineStorage: Record<string, any> = {};
          
          for (const line of lines) {
            const data = await fetchLineData(line.id);
            const lineCode = line.code;
            
            if (data.queue && data.queue.length > 0) {
              const currentQueueItem = data.queue[data.currentQueueIndex];
              const prog = currentQueueItem
                ? data.queueProgress[currentQueueItem.id] || createInitialProgress(currentQueueItem.id)
                : null;

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
                  codigo10e: q.codigo10e,
                  linea: q.linea,
                });
              });

              newLineStorage[lineCode] = {
                queue: data.queue,
                salads: Array.from(saladMap.values()),
                queueProgress: data.queueProgress,
                currentQueueIndex: data.currentQueueIndex,
                isProducing: data.isProducing,
                currentProgress: prog,
              };
            } else {
              newLineStorage[lineCode] = {
                queue: [],
                salads: [],
                queueProgress: {},
                currentQueueIndex: 0,
                isProducing: false,
                currentProgress: null,
              };
            }
          }
          
          // Hydrate pending Excel data from Supabase
          const remotePendingExcel = await fetchPendingExcelData();
          
          // Cargar configuración de Noblejas desde Supabase (sincronizada entre PCs)
          const remoteNoblejasConfig = await fetchNoblejasConfig();
          
          set((s) => {
            // Proteger: no sobreescribir lineStorage local con datos vacíos de Supabase
            // si la línea tiene datos locales recientes (protección contra race conditions)
            const mergedLineStorage = { ...s.lineStorage };
            for (const [lineCode, remoteData] of Object.entries(newLineStorage)) {
              const localData = s.lineStorage[lineCode];
              const lastWrite = lastLocalWriteTs[lineCode] || 0;
              const localHasData = localData?.queue?.length > 0;
              const remoteHasData = remoteData.queue?.length > 0;
              const isProtected = localHasData && !remoteHasData && (Date.now() - lastWrite < LOCAL_WRITE_PROTECTION_MS);
              
              if (!isProtected) {
                mergedLineStorage[lineCode] = remoteData;
              }
            }

            const updates: Partial<ProductionState> = {
              lineStorage: mergedLineStorage,
            };
            
            if (remotePendingExcel && remotePendingExcel.length > 0) {
              updates.parsedExcelData = remotePendingExcel;
            }
            
            // Merge noblejasConfig: remote tiene prioridad, pero mantener config local si remote está vacío
            if (remoteNoblejasConfig && Object.keys(remoteNoblejasConfig).length > 0) {
              updates.noblejasConfig = remoteNoblejasConfig;
            }
            
            return updates as any;
          });
        } catch (e) {
          console.error("Error loading all lines data:", e);
        }
      },

      // Configuración de Noblejas
      noblejasConfig: {},
      setNoblejasConfig: async (codigo10e, boxes) => {
        const state = get();
        await state.setNoblejasConfigBulk({ [codigo10e]: boxes });
      },
      setNoblejasConfigBulk: async (configs) => {
        const state = get();
        const newNoblejasConfig = { ...state.noblejasConfig, ...configs };
        
        const newLineStorage = { ...state.lineStorage };
        const linesToSync: string[] = [];

        // 1. Actualizar lineStorage de todas las líneas
        for (const [lineCode, lineData] of Object.entries(newLineStorage)) {
          let lineUpdated = false;
          const newQueue = lineData.queue.map(item => {
            const code = item.codigo10e?.toUpperCase();
            if (code) {
              // Buscar match case-insensitive en las configs
              const configKey = Object.keys(configs).find(k => k.toUpperCase() === code);
              if (configKey !== undefined) {
                lineUpdated = true;
                return { ...item, noblejas: configs[configKey] };
              }
            }
            return item;
          });

          if (lineUpdated) {
            newLineStorage[lineCode] = { ...lineData, queue: newQueue };
            linesToSync.push(lineCode);
          }
        }

        // 2. Actualizar también la queue top-level (estado activo visible) directamente
        let updatedTopLevelQueue = state.queue;
        let topLevelUpdated = false;
        if (state.activeLineCode && state.activeLineCode !== "ALL" && state.queue.length > 0) {
          updatedTopLevelQueue = state.queue.map(item => {
            const code = item.codigo10e?.toUpperCase();
            if (code) {
              const configKey = Object.keys(configs).find(k => k.toUpperCase() === code);
              if (configKey !== undefined) {
                topLevelUpdated = true;
                return { ...item, noblejas: configs[configKey] };
              }
            }
            return item;
          });

          // Asegurar que lineStorage también refleje los cambios de la línea activa
          if (topLevelUpdated && !linesToSync.includes(state.activeLineCode)) {
            const activeLineData = newLineStorage[state.activeLineCode];
            if (activeLineData) {
              newLineStorage[state.activeLineCode] = { ...activeLineData, queue: updatedTopLevelQueue };
            }
            linesToSync.push(state.activeLineCode);
          }
        }

        set({
          noblejasConfig: newNoblejasConfig,
          lineStorage: newLineStorage,
          ...(topLevelUpdated ? { queue: updatedTopLevelQueue } : {}),
        });

        // Sincronizar noblejasConfig con Supabase para que todos los PCs lo vean
        syncNoblejasConfig(newNoblejasConfig);

        const { syncQueueItems, getProductionLines } = await import("@/lib/supabase-service");
        
        if (linesToSync.length > 0) {
          const lines = await getProductionLines();
          for (const code of linesToSync) {
            const dbLine = lines.find(l => l.code === code);
            const queueToSync = code === state.activeLineCode && topLevelUpdated
              ? updatedTopLevelQueue
              : newLineStorage[code]?.queue;
            if (dbLine && queueToSync) {
              await syncQueueItems(dbLine.id, queueToSync);
            }
          }
        }
      },
      removeNoblejasConfig: (codigo10e) => {
        const newConfig = { ...get().noblejasConfig };
        delete newConfig[codigo10e];
        set({ noblejasConfig: newConfig });
        // Sincronizar con Supabase
        syncNoblejasConfig(newConfig);
      },

      // Estado inicial
      parsedExcelData: [],
      setParsedExcelData: (data) => {
        set({ parsedExcelData: data });
        syncPendingExcelData(data); // Sync en segundo plano
      },
      clearParsedExcelData: () => {
        set({ parsedExcelData: [] });
        syncPendingExcelData([]); // Borrar de Supabase también
      },
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
      authUser: {
        id: "planta-op",
        email: "operador@planta.local",
        username: "Operador Planta",
        role: "admin",
      },
      isLoggedIn: true,
      currentUser: "Operador Planta",
      customDayLabelIndex: null,
      isScreenLocked: false,

      // ===== ENSALADAS =====

      addSalad: async (salad, targetLineCode) => {
        const state = get();
        const lineCodeToUse = targetLineCode || state.activeLineCode;

        // Resolver por código, no reutilizar activeLineId: puede estar en plena
        // transición al cambiar de línea.
        const lineIdToUse = await resolveLineIdForCode(lineCodeToUse);

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
          codigo10e: format.codigo10e,
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

          // Marcar timestamp de escritura local para proteger contra race conditions
          lastLocalWriteTs[lineCodeToUse] = Date.now();

          // Sincronización completa con Supabase
          console.log(`[addSalad] Calling syncQueueItems with lineIdToUse=${lineIdToUse}, updatedQueue length=${updatedQueue.length}`);
          if (lineIdToUse) {
            await syncQueueItems(lineIdToUse, updatedQueue);
            await syncLineState(lineIdToUse, true, currentQueueIndex);
            if (currentProgress && currentItem) {
              await syncProgress(currentItem.id, currentProgress);
            }
          }
          broadcastLocalChange(lineCodeToUse);
        } else {
          // Guardar en la línea objetivo tanto en memoria local como en Supabase
          const prevTargetStorage = state.lineStorage[lineCodeToUse] || {
            salads: [],
            queue: [],
            currentQueueIndex: 0,
            currentProgress: null,
            queueProgress: {},
            isProducing: false,
          };
          const targetQueue = [...prevTargetStorage.queue, ...newQueueItems];
          const targetSalads = [...prevTargetStorage.salads, salad];
          const targetProgressMap: Record<string, FormatProgress> = { ...(prevTargetStorage.queueProgress || {}) };
          newQueueItems.forEach((item) => {
            if (!targetProgressMap[item.id]) {
              targetProgressMap[item.id] = createInitialProgress(item.id);
            }
          });
          const targetCurrentQueueIndex = prevTargetStorage.currentQueueIndex || 0;
          const currentItemInTarget = targetQueue[targetCurrentQueueIndex] || targetQueue[0];
          
          const targetCurrentProgress = prevTargetStorage.currentProgress && currentItemInTarget && prevTargetStorage.currentProgress.queueItemId === currentItemInTarget.id 
            ? prevTargetStorage.currentProgress 
            : (currentItemInTarget ? targetProgressMap[currentItemInTarget.id] || createInitialProgress(currentItemInTarget.id) : null);

          const targetLineState = {
            salads: targetSalads,
            queue: targetQueue,
            currentQueueIndex: targetCurrentQueueIndex,
            currentProgress: targetCurrentProgress,
            queueProgress: targetProgressMap,
            isProducing: true,
          };

          set((s) => ({
            lineStorage: {
              ...s.lineStorage,
              [lineCodeToUse]: targetLineState,
            },
          }));

          // Marcar timestamp de escritura local
          lastLocalWriteTs[lineCodeToUse] = Date.now();

          if (lineIdToUse) {
            await syncQueueItems(lineIdToUse, targetQueue);
            await syncLineState(lineIdToUse, true, targetCurrentQueueIndex);
            if (currentItemInTarget && targetCurrentProgress) {
              await syncProgress(currentItemInTarget.id, targetCurrentProgress);
            }
          }
          broadcastLocalChange(lineCodeToUse);
        }
      },

      addSaladsBulk: async (saladsWithLine) => {
        if (!saladsWithLine || saladsWithLine.length === 0) return;
        const state = get();
        const lines = await getProductionLines();

        // Agrupar items por línea
        const lineGroups: Record<string, { salads: Salad[]; queueItems: QueueItem[] }> = {};

        for (const { salad, lineCode } of saladsWithLine) {
          const lineCodeToUse = lineCode || state.activeLineCode || "K00";
          if (!lineGroups[lineCodeToUse]) {
            lineGroups[lineCodeToUse] = { salads: [], queueItems: [] };
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
            codigo10e: format.codigo10e,
            fechaCaducidad: format.fechaCaducidad,
            linea: lineCodeToUse,
          }));

          lineGroups[lineCodeToUse].salads.push(salad);
          lineGroups[lineCodeToUse].queueItems.push(...newQueueItems);
        }

        const updatedLineStorage = { ...state.lineStorage };
        let updatedTopLevelQueue = [...state.queue];
        let updatedTopLevelSalads = [...state.salads];
        let updatedTopLevelProgress = state.currentProgress;
        let updatedTopLevelQueueProgress = { ...(state.queueProgress || {}) };
        let updatedTopLevelQueueIndex = state.currentQueueIndex;
        let hasTopLevelChange = false;

        const syncPromises: Promise<any>[] = [];

        for (const [lineCode, { salads: newSalads, queueItems: newQueueItems }] of Object.entries(lineGroups)) {
          const prevStorage = updatedLineStorage[lineCode] || {
            salads: [],
            queue: [],
            currentQueueIndex: 0,
            currentProgress: null,
            queueProgress: {},
            isProducing: false,
          };

          const targetQueue = [...prevStorage.queue, ...newQueueItems];
          const targetSalads = [...prevStorage.salads, ...newSalads];
          const targetProgressMap: Record<string, FormatProgress> = { ...(prevStorage.queueProgress || {}) };

          newQueueItems.forEach((item) => {
            if (!targetProgressMap[item.id]) {
              targetProgressMap[item.id] = createInitialProgress(item.id);
            }
          });

          const isNewStart = !prevStorage.isProducing || prevStorage.queue.length === 0 || !prevStorage.currentProgress;
          const targetCurrentQueueIndex = isNewStart ? 0 : prevStorage.currentQueueIndex;
          const currentItemInTarget = targetQueue[targetCurrentQueueIndex] || targetQueue[0];

          const targetCurrentProgress = currentItemInTarget
            ? targetProgressMap[currentItemInTarget.id] || createInitialProgress(currentItemInTarget.id)
            : null;

          if (targetCurrentProgress && currentItemInTarget) {
            targetProgressMap[currentItemInTarget.id] = targetCurrentProgress;
          }

          const targetLineState = {
            salads: targetSalads,
            queue: targetQueue,
            currentQueueIndex: targetCurrentQueueIndex,
            currentProgress: targetCurrentProgress,
            queueProgress: targetProgressMap,
            isProducing: true,
          };

          updatedLineStorage[lineCode] = targetLineState;

          if (lineCode === state.activeLineCode) {
            hasTopLevelChange = true;
            updatedTopLevelQueue = targetQueue;
            updatedTopLevelSalads = targetSalads;
            updatedTopLevelProgress = targetCurrentProgress;
            updatedTopLevelQueueProgress = targetProgressMap;
            updatedTopLevelQueueIndex = targetCurrentQueueIndex;
          }

          // Encontrar ID de línea para sincronizar en paralelo
          const dbLine = lines.find((l) => l.code === lineCode);
          if (dbLine) {
            syncPromises.push(syncQueueItems(dbLine.id, targetQueue));
            syncPromises.push(syncLineState(dbLine.id, true, targetCurrentQueueIndex));
            if (currentItemInTarget && targetCurrentProgress) {
              syncPromises.push(syncProgress(currentItemInTarget.id, targetCurrentProgress));
            }
          }
          // Marcar timestamp de escritura local
          lastLocalWriteTs[lineCode] = Date.now();
          broadcastLocalChange(lineCode);
        }

        // Actualizar store inmediatamente
        set((s) => ({
          lineStorage: updatedLineStorage,
          ...(hasTopLevelChange ? {
            queue: updatedTopLevelQueue,
            salads: updatedTopLevelSalads,
            currentProgress: updatedTopLevelProgress,
            queueProgress: updatedTopLevelQueueProgress,
            currentQueueIndex: updatedTopLevelQueueIndex,
            isProducing: true,
          } : {})
        }));

        // Esperar sincronizaciones paralelas con Supabase
        await Promise.allSettled(syncPromises);
      },

      removeSalad: (id) =>
        set((state) => ({
          salads: state.salads.filter((s) => s.id !== id),
          queue: state.queue.filter((q) => q.saladId !== id),
        })),

      updateSalad: async (id, updates) => {
        const state = get();
        const updatedSalads = state.salads.map((s) =>
          s.id === id ? { ...s, ...updates } : s
        );

        const targetSalad = updatedSalads.find((s) => s.id === id);
        if (!targetSalad) return;

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
              linea: format.linea || state.activeLineCode,
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
              linea: format.linea || state.activeLineCode,
            });
          }
        });

        // Initialize progress for new items
        const updatedQueueProgress: Record<string, FormatProgress> = { ...(state.queueProgress || {}) };
        newQueue.forEach((item) => {
          if (!updatedQueueProgress[item.id]) {
            updatedQueueProgress[item.id] = createInitialProgress(item.id);
          }
        });

        const lineState = {
          salads: updatedSalads,
          queue: newQueue,
          queueProgress: updatedQueueProgress,
        };

        set((s) => ({
          ...lineState,
          lineStorage: {
            ...s.lineStorage,
            [state.activeLineCode]: {
              ...s.lineStorage[state.activeLineCode],
              ...lineState,
            },
          },
        }));

        if (state.activeLineId) {
          await syncQueueItems(state.activeLineId, newQueue);
        }
        broadcastLocalChange(state.activeLineCode);
      },

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

      reorderQueue: async (fromIndex, toIndex) => {
        const state = get();
        const newQueue = [...state.queue];
        const [moved] = newQueue.splice(fromIndex, 1);
        newQueue.splice(toIndex, 0, moved);

        // Actualizar tanto queue top-level como lineStorage para coherencia total
        const lineCode = state.activeLineCode;
        set((s) => ({
          queue: newQueue,
          lineStorage: {
            ...s.lineStorage,
            ...(lineCode && lineCode !== "ALL" ? {
              [lineCode]: {
                ...(s.lineStorage[lineCode] || {}),
                queue: newQueue,
              }
            } : {}),
          },
        }));

        if (state.activeLineId) {
          await syncQueueItems(state.activeLineId, newQueue);
        }
        if (lineCode && lineCode !== "ALL") {
          broadcastLocalChange(lineCode);
        }
      },

      removeFromQueue: async (index) => {
        const state = get();
        const newQueue = state.queue.filter((_, i) => i !== index);

        const lineCode = state.activeLineCode;
        set((s) => ({
          queue: newQueue,
          lineStorage: {
            ...s.lineStorage,
            ...(lineCode && lineCode !== "ALL" ? {
              [lineCode]: {
                ...(s.lineStorage[lineCode] || {}),
                queue: newQueue,
              }
            } : {}),
          },
        }));

        if (state.activeLineId) {
          await syncQueueItems(state.activeLineId, newQueue);
        }
        if (lineCode && lineCode !== "ALL") {
          broadcastLocalChange(lineCode);
        }
      },

      multiLineReorderQueue: async (lineCode, fromIndex, toIndex) => {
        const state = get();
        const lineState = state.lineStorage[lineCode];
        if (!lineState) return;

        const newQueue = [...lineState.queue];
        const [moved] = newQueue.splice(fromIndex, 1);
        newQueue.splice(toIndex, 0, moved);

        const updatedLineState = {
          ...lineState,
          queue: newQueue,
        };

        const isCurrentActiveLine = state.activeLineCode === lineCode;

        set((s) => ({
          lineStorage: {
            ...s.lineStorage,
            [lineCode]: updatedLineState,
          },
          ...(isCurrentActiveLine ? { queue: newQueue } : {}),
        }));

        const lines = await getProductionLines();
        const line = lines.find((l) => l.code === lineCode);
        if (line) {
          await syncQueueItems(line.id, newQueue);
        }
        broadcastLocalChange(lineCode);
      },

      multiLineRemoveFromQueue: async (lineCode, index) => {
        const state = get();
        const lineState = state.lineStorage[lineCode];
        if (!lineState) return;

        const newQueue = lineState.queue.filter((_, i) => i !== index);
        const updatedLineState = {
          ...lineState,
          queue: newQueue,
        };

        const isCurrentActiveLine = state.activeLineCode === lineCode;

        set((s) => ({
          lineStorage: {
            ...s.lineStorage,
            [lineCode]: updatedLineState,
          },
          ...(isCurrentActiveLine ? { queue: newQueue } : {}),
        }));

        const lines = await getProductionLines();
        const line = lines.find((l) => l.code === lineCode);
        if (line) {
          await syncQueueItems(line.id, newQueue);
        }
        broadcastLocalChange(lineCode);
      },

      multiLineClearQueueAndSalads: async (lineCode) => {
        const state = get();
        const lines = await getProductionLines();
        const line = lines.find((l) => l.code === lineCode);

        if (line) {
          await syncLineState(line.id, false, 0);
          await syncQueueItems(line.id, []);
        }

        set((s) => ({
          lineStorage: {
            ...s.lineStorage,
            [lineCode]: {
              salads: [],
              queue: [],
              isProducing: false,
              currentQueueIndex: 0,
              currentProgress: null,
              queueProgress: {},
            },
          },
        }));
        broadcastLocalChange(lineCode);
      },

      updateManualOrderDrafts: (lineCode, drafts) => {
        set((s) => ({
          lineStorage: {
            ...s.lineStorage,
            [lineCode]: {
              ...(s.lineStorage[lineCode] || ({} as any)),
              manualOrderDrafts: drafts,
            },
          },
        }));
      },

      // ===== PRODUCCIÓN =====

      startProduction: () => {
        const { queue, activeLineCode } = get();
        if (queue.length === 0) return;

        const progressMap: Record<string, FormatProgress> = {};
        queue.forEach((item) => {
          progressMap[item.id] = createInitialProgress(item.id);
        });

        void resolveLineIdForCode(activeLineCode).then((lineId) => {
          if (lineId) void syncLineState(lineId, true, 0);
        });

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
        const { queue, salads, currentQueueIndex, formatStartTime, soundEnabled, activeLineId, activeLineCode } = get();
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
          operator: get().currentUser || undefined,
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

        // Eliminar el formato completado de la cola
        const remainingQueue = queue.filter((_, idx) => idx !== currentQueueIndex);

        // Actualizar lista de ensaladas removiendo el formato completado
        const remainingSalads: Salad[] = [];
        salads.forEach((s) => {
          const updatedFormats = s.formats.filter((f) => f.id !== completedFormat.formatId);
          if (updatedFormats.length > 0) {
            remainingSalads.push({
              ...s,
              formats: updatedFormats,
            });
          }
        });

        // Si ya no quedan más formatos en la cola de esta línea:
        if (remainingQueue.length === 0) {
          if (activeLineId) {
            syncLineState(activeLineId, false, 0);
            syncQueueItems(activeLineId, []);
          }

          const emptyLineState = {
            queue: [],
            salads: [],
            queueProgress: {},
            currentQueueIndex: 0,
            isProducing: false,
            currentProgress: null,
            formatStartTime: null,
            palletSpeeds: [],
          };

          set((state) => ({
            ...emptyLineState,
            lineStorage: {
              ...state.lineStorage,
              [activeLineCode]: emptyLineState,
            },
            history: [historyItem, ...(state.history || [])].slice(0, 30),
            showTransitionBanner: false,
          }));

          broadcastLocalChange(activeLineCode);
          return;
        }

        // Si aún quedan formatos pendientes en la cola:
        const nextQueueIndex = 0; // El siguiente formato pasa al índice 0
        const nextItem = remainingQueue[nextQueueIndex];
        const nextProgress = (get().queueProgress || {})[nextItem.id] || createInitialProgress(nextItem.id);

        if (activeLineId) {
          syncLineState(activeLineId, true, nextQueueIndex);
          syncQueueItems(activeLineId, remainingQueue);
        }

        const nextLineState = {
          queue: remainingQueue,
          salads: remainingSalads,
          currentQueueIndex: nextQueueIndex,
          currentProgress: nextProgress,
          isProducing: true,
          showTransitionBanner: true,
          formatStartTime: Date.now(),
          palletSpeeds: [],
        };

        set((state) => ({
          ...nextLineState,
          lineStorage: {
            ...state.lineStorage,
            [activeLineCode]: {
              ...state.lineStorage[activeLineCode],
              ...nextLineState,
            },
          },
          history: [historyItem, ...(state.history || [])].slice(0, 30),
          queueProgress: {
            ...(state.queueProgress || {}),
            [nextItem.id]: nextProgress,
          },
        }));

        broadcastLocalChange(activeLineCode);
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

      resetProduction: () => {
        const { activeLineCode } = get();
        void resolveLineIdForCode(activeLineCode).then((lineId) => {
          if (lineId) void syncLineState(lineId, false, 0);
        });
        set((state) => ({
          isProducing: false,
          currentQueueIndex: 0,
          currentProgress: null,
          showTransitionBanner: false,
          formatStartTime: null,
          palletSpeeds: [],
          lineStorage: {
            ...state.lineStorage,
            [activeLineCode]: {
              ...(state.lineStorage[activeLineCode] || {}),
              isProducing: false,
            },
          },
        }));
        broadcastLocalChange(activeLineCode);
      },

      clearQueueAndSalads: () => {
        const { activeLineCode } = get();
        void resolveLineIdForCode(activeLineCode).then((lineId) => {
          if (!lineId) return;
          void syncLineState(lineId, false, 0);
          void syncQueueItems(lineId, []);
        });
        const emptyState = {
          salads: [],
          queue: [],
          currentQueueIndex: 0,
          currentProgress: null,
          queueProgress: {},
          isProducing: false,
          formatStartTime: null,
          palletSpeeds: [],
        };
        set((state) => ({
          ...emptyState,
          lineStorage: {
            ...state.lineStorage,
            [activeLineCode]: emptyState,
          },
        }));
        broadcastLocalChange(activeLineCode);
      },

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

      clearAllDatabase: async () => {
        const { clearAllQueuesAndLines } = await import("@/lib/supabase-service");
        await clearAllQueuesAndLines();
        // Reset all lineStorage and current line
        const emptyState = {
          salads: [],
          queue: [],
          currentQueueIndex: 0,
          currentProgress: null,
          queueProgress: {},
          isProducing: false,
        };
        set((s) => {
          const resetStorage: Record<string, any> = {};
          Object.keys(s.lineStorage).forEach(code => {
            resetStorage[code] = { ...emptyState };
          });
          return {
            ...emptyState,
            lineStorage: resetStorage
          };
        });
      },

      hardResetDatabase: async () => {
        const { activeLineCode } = get();
        const activeLineId = await resolveLineIdForCode(activeLineCode);
        if (activeLineId) {
          await hardResetLine(activeLineId);
        }
        
        const emptyState = {
          salads: [],
          queue: [],
          currentQueueIndex: 0,
          currentProgress: null,
          queueProgress: {},
          isProducing: false,
          formatStartTime: null,
          palletSpeeds: [],
        };
        
        set((state) => ({
          ...emptyState,
          lineStorage: {
            ...state.lineStorage,
            [activeLineCode]: emptyState,
          },
        }));
        broadcastLocalChange(activeLineCode);
      },

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

      setAuthUser: (user) => {
        set({
          authUser: user,
          isLoggedIn: Boolean(user),
          currentUser: user ? user.username : null,
        });
      },

      logout: async () => {
        await signOutSupabase();
        set({
          authUser: null,
          isLoggedIn: false,
          currentUser: null,
        });
      },

      updateQueueItem: async (id, updates) => {
        const state = get();
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

        if (state.activeLineId) {
          await syncQueueItems(state.activeLineId, newQueue);
          if (updatedQueueProgress[id]) {
            await syncProgress(id, updatedQueueProgress[id]);
          }
        }

        set((s) => ({
          queue: newQueue,
          currentProgress: nextProgress,
          queueProgress: updatedQueueProgress,
          lineStorage: {
            ...s.lineStorage,
            [s.activeLineCode]: {
              ...(s.lineStorage[s.activeLineCode] || ({} as any)),
              queue: newQueue,
              currentProgress: nextProgress,
              queueProgress: updatedQueueProgress,
            }
          }
        }));
        
        broadcastLocalChange(state.activeLineCode);
      },

      updateLineItemProgress: (lineCode: string, queueItemId: string, progress: FormatProgress) => {
        const state = get();
        const prevLineStorage = state.lineStorage[lineCode] || {
          salads: [],
          queue: [],
          currentQueueIndex: 0,
          currentProgress: null,
          queueProgress: {},
          isProducing: false,
        };
        
        const updatedProgressMap = {
          ...(prevLineStorage.queueProgress || {}),
          [queueItemId]: progress,
        };

        const updatedLineState = {
          ...prevLineStorage,
          queueProgress: updatedProgressMap,
          currentProgress: (prevLineStorage.queue[prevLineStorage.currentQueueIndex]?.id === queueItemId)
            ? progress
            : prevLineStorage.currentProgress,
        };

        const isCurrentActiveLine = state.activeLineCode === lineCode;

        set((s) => ({
          lineStorage: {
            ...s.lineStorage,
            [lineCode]: updatedLineState,
          },
          ...(isCurrentActiveLine ? {
            queueProgress: {
              ...(s.queueProgress || {}),
              [queueItemId]: progress,
            },
            currentProgress: (s.queue[s.currentQueueIndex]?.id === queueItemId)
              ? progress
              : s.currentProgress,
          } : {}),
        }));

        syncProgress(queueItemId, progress);
        broadcastLocalChange(lineCode);
      },
    }),
    {
      name: "salad-production-storage",
      partialize: (state) => {
        // Excluir información de sesión de usuario del localStorage persistente
        const { authUser: _a, isLoggedIn: _i, currentUser: _c, ...rest } = state;
        return rest;
      },
      merge: (persistedState: unknown, currentState) => ({
        ...currentState,
        ...(persistedState as object),
        authUser: null,
        isLoggedIn: false,
        currentUser: null,
      }),
    }
  )
);
