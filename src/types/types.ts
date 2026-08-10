// ===== TIPOS DE CAJA PREDEFINIDOS =====

export interface BoxTypeOption {
  id: string;
  name: string;
  defaultBoxesPerPallet: number;
}

export const DEFAULT_BOX_TYPES: BoxTypeOption[] = [
  { id: "Carton-4", name: "Cartón 4", defaultBoxesPerPallet: 72 },
  { id: "Carton-6", name: "Cartón 6", defaultBoxesPerPallet: 72 },
  { id: "LL6410-4", name: "LL410 4", defaultBoxesPerPallet: 64 },
  { id: "LL6410-6", name: "LL6410 6", defaultBoxesPerPallet: 64 },
  { id: "PV216-12", name: "PV216 12", defaultBoxesPerPallet: 36 },
  { id: "PV136-6", name: "PV136 6", defaultBoxesPerPallet: 64 },

];

// ===== FORMATO DE PRODUCCIÓN =====

export interface Format {
  id: string;
  boxType: string;
  quantity: number;
  noblejas: number;
  boxesPerPallet: number;
  lote?: string;
  cambioLote?: boolean;
  note?: string;
  fechaCaducidad?: string;
  linea?: string;
}

export interface FormatCalculations {
  production: number;
  pallets: number;
  pico: number;
}

// ===== ENSALADA =====

export interface Salad {
  id: string;
  name: string;
  formats: Format[];
}

// ===== COLA DE PRODUCCIÓN =====

export interface QueueItem {
  id: string;
  saladId: string;
  saladName: string;
  formatId: string;
  boxType: string;
  quantity: number;
  noblejas: number;
  boxesPerPallet: number;
  note?: string;
  lote?: string;
  cambioLote?: boolean;
  fechaCaducidad?: string;
  linea?: string;
}

// ===== PROGRESO DE FORMATO =====

export interface FormatProgress {
  queueItemId: string;
  completedPallets: number;
  picoCompleted: boolean;
  noblejasCompleted: boolean;
  // Nuevos: contador interactivo de noblejas (palets + pico)
  noblejasCompletedPallets: number;
  nobjelasPicoCompleted: boolean;
  finished: boolean;
  palletLastUpdated?: number;
  lastPalletTimestamp?: number | null; // Timestamp exacto de la última adición de palet (ms)
  lastPalletIntervalMs?: number | null; // Intervalo en ms desde la adición de palet previa
  declinedAutoAdvance?: boolean;
  boxesAdjustment?: number; // Ajuste express de cajas (+/-)
}

// ===== TIPO DE TRANSICIÓN =====

export type TransitionType = "same" | "box-change" | "salad-change" | "lote-change";

// ===== FUNCIONES AUXILIARES =====

export function calculateFormat(format: Format): FormatCalculations {
  const production = format.quantity - format.noblejas;
  const pallets = Math.floor(production / format.boxesPerPallet);
  const pico = production % format.boxesPerPallet;
  return { production, pallets, pico };
}

export function getActiveLote(queue: QueueItem[], index: number): string {
  if (index < 0 || index >= queue.length) return "";
  const targetSaladId = queue[index].saladId;
  for (let i = index; i >= 0; i--) {
    if (queue[i].saladId !== targetSaladId) {
      break;
    }
    if (queue[i].lote) {
      return queue[i].lote || "";
    }
  }
  return "";
}

export function getTransitionType(
  current: QueueItem | undefined,
  next: QueueItem | undefined
): TransitionType {
  if (!current || !next) return "same";
  if (current.saladId !== next.saladId) return "salad-change";
  if (current.boxType !== next.boxType) return "box-change";
  if (next.cambioLote || (next.lote && current.lote !== next.lote)) return "lote-change";
  return "same";
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export function getSaladsPerBox(boxType: string): number {
  const match = boxType.match(/\d+$/);
  return match ? parseInt(match[0], 10) : 6;
}

// ===== COLORES DE ETIQUETA POR DÍA =====

export interface DayLabelColor {
  day: string;
  colorName: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  dotClass: string;
}

export const DAY_LABEL_COLORS: DayLabelColor[] = [
  { day: "Domingo", colorName: "—", bgClass: "bg-gray-800", textClass: "text-gray-500", borderClass: "border-gray-700", dotClass: "bg-gray-700" },
  { day: "Lunes", colorName: "Roja", bgClass: "bg-red-600", textClass: "text-white", borderClass: "border-red-500", dotClass: "bg-red-500" },
  { day: "Martes", colorName: "Azul", bgClass: "bg-blue-600", textClass: "text-white", borderClass: "border-blue-500", dotClass: "bg-blue-500" },
  { day: "Miércoles", colorName: "Rosa", bgClass: "bg-pink-500", textClass: "text-white", borderClass: "border-pink-400", dotClass: "bg-pink-400" },
  { day: "Jueves", colorName: "Naranja", bgClass: "bg-[#FF7A00]", textClass: "text-white", borderClass: "border-[#FF7A00]", dotClass: "bg-[#FF7A00]" },
  { day: "Viernes", colorName: "Blanca", bgClass: "bg-white", textClass: "text-black", borderClass: "border-white", dotClass: "bg-white" },
  { day: "Sábado", colorName: "Verde", bgClass: "bg-green-600", textClass: "text-white", borderClass: "border-green-500", dotClass: "bg-green-500" }
];

export function getTodayLabelColor(customIndex?: number | null): DayLabelColor {
  if (customIndex !== undefined && customIndex !== null && customIndex >= 0 && customIndex < DAY_LABEL_COLORS.length) {
    return DAY_LABEL_COLORS[customIndex];
  }
  const dayIndex = new Date().getDay();
  return DAY_LABEL_COLORS[dayIndex];
}

// ===== LÍNEAS DE PRODUCCIÓN MULTIUSUARIO =====

export interface ProductionLine {
  id: string;
  code: string; // 'K00', 'K01', 'K02', 'K03'
  name: string;
  isActive: boolean;
  currentQueueIndex: number;
  isProducing: boolean;
  updatedAt?: string;
}

export const DEFAULT_PRODUCTION_LINES: Array<{ code: string; name: string }> = [
  { code: "K00", name: "Línea K00 - Envasado Principal" },
  { code: "K01", name: "Línea K01 - Envasado Secundario" },
  { code: "K02", name: "Línea K02 - Bowls y Especialidades" },
  { code: "K03", name: "Línea K03 - Formatos Familiares" },
];

export interface LineOverview {
  line: ProductionLine;
  currentSaladName?: string;
  currentBoxType?: string;
  currentLote?: string;
  totalBoxes: number;
  completedBoxes: number;
  totalPallets: number;
  completedPallets: number;
  noblejasBoxes: number;
  noblejasDoneBoxes: number;
  percent: number;
  queueLength: number;
  pendingCount: number;
}

export interface TemplateItem {
  id: string;
  saladName: string;
  boxType: string;
  quantity: number;
  noblejas: number;
  boxesPerPallet: number;
}

export interface HistoryItem {
  id: string;
  saladName: string;
  boxType: string;
  quantity: number;
  noblejas: number;
  boxesPerPallet: number;
  date: string;
  duration?: string;
}



