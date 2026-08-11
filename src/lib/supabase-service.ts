import { supabase, isSupabaseConfigured } from "./supabase";
import type { 
  ProductionLine, 
  QueueItem, 
  FormatProgress, 
  HistoryItem,
  LineOverview
} from "@/types/types";
import { DEFAULT_PRODUCTION_LINES, calculateFormat } from "@/types/types";

// ============================================================
// 1. GESTIÓN DE LÍNEAS (K00, K01, K02, K03)
// ============================================================

export async function getProductionLines(): Promise<ProductionLine[]> {
  if (!isSupabaseConfigured || !supabase) {
    // Retornar líneas locales por defecto
    return DEFAULT_PRODUCTION_LINES.map((l, index) => ({
      id: `local-${l.code.toLowerCase()}`,
      code: l.code,
      name: l.name,
      isActive: true,
      currentQueueIndex: 0,
      isProducing: false,
    }));
  }

  try {
    const { data, error } = await supabase
      .from("production_lines")
      .select("*")
      .order("code", { ascending: true });

    if (error) {
      console.warn("Error cargando líneas de Supabase:", error.message);
      return DEFAULT_PRODUCTION_LINES.map((l) => ({
        id: `local-${l.code.toLowerCase()}`,
        code: l.code,
        name: l.name,
        isActive: true,
        currentQueueIndex: 0,
        isProducing: false,
      }));
    }

    if (!data || data.length === 0) {
      // Sembrar líneas si la tabla está vacía
      return await seedInitialLines();
    }

    return data.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
      currentQueueIndex: row.current_queue_index || 0,
      isProducing: row.is_producing || false,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.error("Error en getProductionLines:", err);
    return DEFAULT_PRODUCTION_LINES.map((l) => ({
      id: `local-${l.code.toLowerCase()}`,
      code: l.code,
      name: l.name,
      isActive: true,
      currentQueueIndex: 0,
      isProducing: false,
    }));
  }
}

async function seedInitialLines(): Promise<ProductionLine[]> {
  if (!supabase) return [];
  const rowsToInsert = DEFAULT_PRODUCTION_LINES.map((l) => ({
    code: l.code,
    name: l.name,
    is_active: true,
    current_queue_index: 0,
    is_producing: false,
  }));

  const { data } = await supabase
    .from("production_lines")
    .insert(rowsToInsert)
    .select();

  if (data) {
    return data.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isActive: r.is_active,
      currentQueueIndex: r.current_queue_index,
      isProducing: r.is_producing,
      updatedAt: r.updated_at,
    }));
  }
  return [];
}

// ============================================================
// 2. CARGA DE COLA Y PROGRESO DE UNA LÍNEA
// ============================================================

export async function fetchLineData(lineId: string): Promise<{
  queue: QueueItem[];
  queueProgress: Record<string, FormatProgress>;
  currentQueueIndex: number;
  isProducing: boolean;
}> {
  if (!isSupabaseConfigured || !supabase || lineId.startsWith("local-")) {
    return {
      queue: [],
      queueProgress: {},
      currentQueueIndex: 0,
      isProducing: false,
    };
  }

  try {
    // 1. Obtener estado de la línea
    const { data: lineRow } = await supabase
      .from("production_lines")
      .select("current_queue_index, is_producing")
      .eq("id", lineId)
      .single();

    // 2. Obtener items de la cola
    const { data: queueRows, error: qErr } = await supabase
      .from("line_queue_items")
      .select("*")
      .eq("line_id", lineId)
      .order("order_index", { ascending: true });

    if (qErr || !queueRows) {
      return {
        queue: [],
        queueProgress: {},
        currentQueueIndex: lineRow?.current_queue_index || 0,
        isProducing: lineRow?.is_producing || false,
      };
    }

    const queue: QueueItem[] = queueRows.map((q) => ({
      id: q.id,
      saladId: q.salad_id,
      saladName: q.salad_name,
      formatId: q.format_id,
      boxType: q.box_type,
      quantity: q.quantity,
      noblejas: q.noblejas || 0,
      boxesPerPallet: q.boxes_per_pallet,
      note: q.note || undefined,
      lote: q.lote || undefined,
      cambioLote: q.cambio_lote || false,
      fechaCaducidad: q.fecha_caducidad || undefined,
    }));

    // 3. Obtener progresos de los items
    const itemIds = queue.map((q) => q.id);
    const queueProgress: Record<string, FormatProgress> = {};

    if (itemIds.length > 0) {
      const { data: progRows } = await supabase
        .from("queue_item_progress")
        .select("*")
        .in("queue_item_id", itemIds);

      if (progRows) {
        progRows.forEach((p) => {
          queueProgress[p.queue_item_id] = {
            queueItemId: p.queue_item_id,
            completedPallets: p.completed_pallets || 0,
            picoCompleted: p.pico_completed || false,
            noblejasCompleted: (p.noblejas_completed_pallets > 0) || false,
            noblejasCompletedPallets: p.noblejas_completed_pallets || 0,
            nobjelasPicoCompleted: p.noblejas_pico_completed || false,
            finished: p.finished || false,
            boxesAdjustment: p.boxes_adjustment || 0,
            palletLastUpdated: p.pallet_last_updated ? new Date(p.pallet_last_updated).getTime() : undefined,
            lastPalletTimestamp: p.last_pallet_timestamp || null,
            lastPalletIntervalMs: p.last_pallet_interval_ms || null,
            declinedAutoAdvance: p.declined_auto_advance || false,
          };
        });
      }
    }

    return {
      queue,
      queueProgress,
      currentQueueIndex: lineRow?.current_queue_index || 0,
      isProducing: lineRow?.is_producing || false,
    };
  } catch (e) {
    console.error("Error en fetchLineData:", e);
    return {
      queue: [],
      queueProgress: {},
      currentQueueIndex: 0,
      isProducing: false,
    };
  }
}

// ============================================================
// 3. ACTUALIZACIÓN / MUTACIONES
// ============================================================

export async function syncLineState(
  lineId: string,
  isProducing: boolean,
  currentQueueIndex: number
) {
  if (!isSupabaseConfigured || !supabase || lineId.startsWith("local-")) return;

  const { error } = await supabase
    .from("production_lines")
    .update({
      is_producing: isProducing,
      current_queue_index: currentQueueIndex,
    })
    .eq("id", lineId);
    
  if (error) {
    console.error("Supabase update error in syncLineState:", error.message, error.details);
  }
}

export async function syncQueueItems(lineId: string, queue: QueueItem[]) {
  if (!isSupabaseConfigured || !supabase || lineId.startsWith("local-")) return;

  try {
    const queueIds = queue.map((q) => q.id);

    // 1. Primero, insertar o actualizar los items de la cola en line_queue_items
    if (queue.length > 0) {
      const rows = queue.map((item, index) => ({
        id: item.id,
        line_id: lineId,
        order_index: index,
        salad_id: item.saladId,
        salad_name: item.saladName,
        format_id: item.formatId,
        box_type: item.boxType,
        quantity: item.quantity,
        noblejas: item.noblejas,
        boxes_per_pallet: item.boxesPerPallet,
        note: item.note || null,
        lote: item.lote || null,
        cambio_lote: item.cambioLote || false,
        fecha_caducidad: item.fechaCaducidad || null,
      }));

      const { error } = await supabase.from("line_queue_items").upsert(rows, { onConflict: "id" });
      if (error) {
        console.error("Supabase upsert error in syncQueueItems:", error.message, error.details, error.hint);
      }
    }

    // 2. Limpiar items antiguos respetando la foreign key (borrando primero de queue_item_progress)
    if (queueIds.length > 0) {
      const { data: orphanItems } = await supabase
        .from("line_queue_items")
        .select("id")
        .eq("line_id", lineId)
        .not("id", "in", `(${queueIds.join(",")})`);

      if (orphanItems && orphanItems.length > 0) {
        const orphanIds = orphanItems.map((o) => o.id);
        await supabase.from("queue_item_progress").delete().in("queue_item_id", orphanIds);
        await supabase.from("line_queue_items").delete().in("id", orphanIds);
      }
    } else {
      const { data: allLineItems } = await supabase
        .from("line_queue_items")
        .select("id")
        .eq("line_id", lineId);

      if (allLineItems && allLineItems.length > 0) {
        const allIds = allLineItems.map((o) => o.id);
        await supabase.from("queue_item_progress").delete().in("queue_item_id", allIds);
        await supabase.from("line_queue_items").delete().in("id", allIds);
      }
    }
  } catch (e) {
    console.error("Error en syncQueueItems:", e);
  }
}

export async function syncProgress(queueItemId: string, progress: FormatProgress) {
  if (!isSupabaseConfigured || !supabase || queueItemId.startsWith("local-")) return;

  try {
    // Comprobar que el item existe en line_queue_items para evitar error de FK
    const { data: exists } = await supabase
      .from("line_queue_items")
      .select("id")
      .eq("id", queueItemId)
      .maybeSingle();

    if (!exists) {
      return;
    }

    const { error } = await supabase.from("queue_item_progress").upsert(
      {
        queue_item_id: queueItemId,
        completed_pallets: progress.completedPallets,
        pico_completed: progress.picoCompleted,
        noblejas_completed_pallets: progress.noblejasCompletedPallets,
        noblejas_pico_completed: progress.nobjelasPicoCompleted,
        boxes_adjustment: progress.boxesAdjustment || 0,
        finished: progress.finished,
        pallet_last_updated: progress.palletLastUpdated || null,
        last_pallet_timestamp: progress.lastPalletTimestamp || null,
        last_pallet_interval_ms: progress.lastPalletIntervalMs,
        declined_auto_advance: progress.declinedAutoAdvance || false,
      },
      { onConflict: "queue_item_id" }
    );
    if (error) {
      console.error("Supabase upsert error in syncProgress:", error.message, error.details, error.hint);
    }
  } catch (e) {
    console.error("Critical error in syncProgress:", e);
  }
}

export async function saveHistoryLog(lineId: string | null, historyItem: HistoryItem) {
  if (!isSupabaseConfigured || !supabase) return;

  try {
    await supabase.from("production_history").insert({
      line_id: lineId && !lineId.startsWith("local-") ? lineId : null,
      salad_name: historyItem.saladName,
      box_type: historyItem.boxType,
      quantity: historyItem.quantity,
      noblejas: historyItem.noblejas,
      boxes_per_pallet: historyItem.boxesPerPallet,
      duration_str: historyItem.duration || null,
    });
  } catch (e) {
    console.error("Error en saveHistoryLog:", e);
  }
}

// ============================================================
// 4. RESUMEN MULTILÍNEA PARA VISTA GENERAL DE FÁBRICA
// ============================================================

export async function getFactoryOverview(): Promise<LineOverview[]> {
  const lines = await getProductionLines();
  
  const overviewList: LineOverview[] = [];

  for (const line of lines) {
    const { queue, queueProgress, currentQueueIndex } = await fetchLineData(line.id);
    const currentItem = queue[currentQueueIndex];

    let totalBoxes = 0;
    let completedBoxes = 0;
    let totalPallets = 0;
    let completedPallets = 0;
    let noblejasBoxes = 0;
    let noblejasDoneBoxes = 0;
    let percent = 0;

    let currentCalc: { pallets: number; pico: number; production: number } | undefined = undefined;
    let currentProg: FormatProgress | undefined = undefined;

    if (currentItem) {
      const calc = calculateFormat({
        id: currentItem.formatId,
        boxType: currentItem.boxType,
        quantity: currentItem.quantity,
        noblejas: currentItem.noblejas,
        boxesPerPallet: currentItem.boxesPerPallet,
      });
      currentCalc = calc;

      const prog = queueProgress[currentItem.id] || {
        completedPallets: 0,
        picoCompleted: false,
        noblejasCompletedPallets: 0,
        nobjelasPicoCompleted: false,
        boxesAdjustment: 0,
      };
      currentProg = prog;

      totalBoxes = currentItem.quantity;
      noblejasBoxes = currentItem.noblejas;
      totalPallets = calc.pallets;
      completedPallets = prog.completedPallets;

      const nobjelasPicoCajas = currentItem.noblejas % currentItem.boxesPerPallet;
      noblejasDoneBoxes = prog.noblejasCompletedPallets * currentItem.boxesPerPallet + (prog.nobjelasPicoCompleted ? nobjelasPicoCajas : 0);
      const milagroDoneBoxes = prog.completedPallets * currentItem.boxesPerPallet + (prog.picoCompleted ? calc.pico : 0) + (prog.boxesAdjustment || 0);

      completedBoxes = noblejasDoneBoxes + milagroDoneBoxes;
      percent = totalBoxes > 0 ? Math.min(Math.round((completedBoxes / totalBoxes) * 100), 100) : 0;
    }

    overviewList.push({
      line,
      currentSaladName: currentItem?.saladName,
      currentBoxType: currentItem?.boxType,
      currentLote: currentItem?.lote,
      totalBoxes,
      completedBoxes,
      totalPallets,
      completedPallets,
      noblejasBoxes,
      noblejasDoneBoxes,
      percent,
      queueLength: queue.length,
      pendingCount: Math.max(0, queue.length - currentQueueIndex - 1),
      currentItem,
      nextItem: queue[currentQueueIndex + 1],
      calc: currentCalc,
      progress: currentProg,
      queue,
    });
  }

  return overviewList;
}

// ============================================================
// 5. SUSCRIPCIONES REALTIME (WEBSOCKETS)
// ============================================================

export function subscribeToLineChanges(
  lineId: string,
  onLineChange: () => void
) {
  if (!isSupabaseConfigured || !supabase || lineId.startsWith("local-")) {
    return () => {};
  }

  const channel = supabase
    .channel(`line-realtime-${lineId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "production_lines", filter: `id=eq.${lineId}` },
      (payload) => { console.log("Line change: production_lines", payload); onLineChange(); }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "line_queue_items", filter: `line_id=eq.${lineId}` },
      (payload) => { console.log("Line change: line_queue_items", payload); onLineChange(); }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "queue_item_progress" },
      (payload) => { console.log("Line change: queue_item_progress", payload); onLineChange(); }
    )
    .subscribe((status) => {
      console.log(`Line Channel status [${lineId}]:`, status);
    });

  return () => {
    supabase?.removeChannel(channel);
  };
}

export function subscribeToGlobalChanges(onGlobalChange: () => void) {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('global-realtime')
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "production_lines" },
      (payload) => { console.log("Global change: production_lines", payload); onGlobalChange(); }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "line_queue_items" },
      (payload) => { console.log("Global change: line_queue_items", payload); onGlobalChange(); }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "queue_item_progress" },
      (payload) => { console.log("Global change: queue_item_progress", payload); onGlobalChange(); }
    )
    .subscribe((status) => {
      console.log("Global Channel status:", status);
    });

  return () => {
    supabase?.removeChannel(channel);
  };
}
