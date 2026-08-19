"use client";

import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { Upload, X, Check, CheckCircle2, FileSpreadsheet, Trash2, RefreshCw, AlertTriangle, Info, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useProductionStore } from "@/store/production-store";
import { DEFAULT_BOX_TYPES, generateId, type Salad, type Format } from "@/types/types";

// ===== TIPOS PARA FEEDBACK DE CARGA =====

interface ColumnMatch {
  expected: string;
  found: string | null;
  status: "exact" | "fuzzy" | "missing";
  critical: boolean; // Si es obligatoria para que funcione
}

interface UploadFeedback {
  fileName: string;
  totalRows: number;
  validRows: number;
  discardedRows: number;
  headers: string[];
  columnMatches: ColumnMatch[];
  rawPreview: Record<string, unknown>[]; // Primeras 3 filas raw
  hasErrors: boolean;
  errorMessage?: string;
}

// Columnas esperadas y sus variaciones conocidas
const EXPECTED_COLUMNS: { key: string; aliases: string[]; critical: boolean; label: string }[] = [
  { key: "codigo", aliases: ["Código de artic.", "Código", "Codigo", "Material", "Código artículo", "Art.", "Articulo", "Cod"], critical: true, label: "Código Artículo" },
  { key: "nombre", aliases: ["Nombre", "Descripción", "Description", "Denominación", "Producto", "Descripcion"], critical: true, label: "Nombre / Descripción" },
  { key: "recurso", aliases: ["Recurso", "Puesto de trabajo", "Puesto", "Centro trabajo", "Línea", "Linea"], critical: false, label: "Recurso (Línea)" },
  { key: "estado", aliases: ["Estado", "Status", "Est."], critical: false, label: "Estado" },
  { key: "cantidad", aliases: ["Cantidad", "Cant.", "Qty", "Cantidad total", "Ctd"], critical: true, label: "Cantidad" },
  { key: "lote", aliases: ["Número de lote", "Lote", "Nº Lote", "Num. Lote", "Batch"], critical: false, label: "Lote" },
  { key: "noticia", aliases: ["Noticia", "Texto", "Notas", "Observaciones", "Comentario"], critical: false, label: "Noticia (DLC)" },
  { key: "fecha", aliases: ["Desde fecha", "Fecha", "Fecha inicio", "Date"], critical: false, label: "Fecha" },
  { key: "hora", aliases: ["Desde", "Hora", "Hora inicio", "Time"], critical: false, label: "Hora" },
];

// Fuzzy matching simple: normalizar y comparar
function normalizeStr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function fuzzyMatch(header: string, alias: string): boolean {
  const h = normalizeStr(header);
  const a = normalizeStr(alias);
  if (h === a) return true;
  if (h.includes(a) || a.includes(h)) return true;
  // Check si al menos 70% de los caracteres coinciden (Levenshtein light)
  if (a.length >= 3 && h.length >= 3) {
    let matches = 0;
    const shorter = h.length < a.length ? h : a;
    const longer = h.length >= a.length ? h : a;
    for (const char of shorter) {
      if (longer.includes(char)) matches++;
    }
    return (matches / shorter.length) >= 0.75;
  }
  return false;
}

function analyzeExcelColumns(headers: string[]): { matches: ColumnMatch[]; columnMap: Record<string, string> } {
  const matches: ColumnMatch[] = [];
  const columnMap: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  for (const col of EXPECTED_COLUMNS) {
    let found: { header: string; type: "exact" | "fuzzy" } | null = null;

    // 1. Buscar match exacto
    for (const alias of col.aliases) {
      const exactHeader = headers.find(h => h === alias && !usedHeaders.has(h));
      if (exactHeader) {
        found = { header: exactHeader, type: "exact" };
        break;
      }
    }

    // 2. Si no hay exacto, buscar fuzzy
    if (!found) {
      for (const alias of col.aliases) {
        const fuzzyHeader = headers.find(h => !usedHeaders.has(h) && fuzzyMatch(h, alias));
        if (fuzzyHeader) {
          found = { header: fuzzyHeader, type: "fuzzy" };
          break;
        }
      }
    }

    if (found) {
      usedHeaders.add(found.header);
      columnMap[col.key] = found.header;
      matches.push({
        expected: col.label,
        found: found.header,
        status: found.type,
        critical: col.critical,
      });
    } else {
      matches.push({
        expected: col.label,
        found: null,
        status: "missing",
        critical: col.critical,
      });
    }
  }

  return { matches, columnMap };
}

interface ParsedRow {
  id: string;
  codigo: string;
  nombre: string;
  recurso: string;
  linea: string;
  estado: string;
  cantidad: number;
  lote: string;
  dlc: string;
  boxType: string;
  boxesPerPallet: number;
  selected: boolean;
  timestamp: number;
}

interface ExcelUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goldMode?: boolean;
}

function guessBoxType(name: string): { id: string; name: string; boxesPerPallet: number } {
  const upper = name.toUpperCase();
  let selectedTypeId = "Carton-6";

  if (upper.includes("LL6410") || upper.includes("LL 6410")) {
    if (upper.includes("/4") || upper.endsWith(" 4")) selectedTypeId = "LL6410-4";
    else selectedTypeId = "LL6410-6";
  } else if (upper.includes("PV216") || upper.includes("PV 216")) {
    selectedTypeId = "PV216-12";
  } else if (upper.includes("PV136") || upper.includes("PV 136")) {
    selectedTypeId = "PV136-6";
  } else {
    if (upper.includes("/4") || upper.endsWith(" 4")) selectedTypeId = "Carton-4";
    else if (upper.includes("/6") || upper.endsWith(" 6")) selectedTypeId = "Carton-6";
  }

  const boxType = DEFAULT_BOX_TYPES.find((b) => b.id === selectedTypeId) || DEFAULT_BOX_TYPES[0];
  return { id: boxType.id, name: boxType.name, boxesPerPallet: boxType.defaultBoxesPerPallet };
}

function extractDLC(noticia: string): string {
  if (!noticia) return "";
  const match = noticia.match(/DLC\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  return match ? match[1] : "";
}

function mapRecursoToLine(recurso: string): string {
  const r = recurso?.trim().toUpperCase();
  if (r === "12C00") return "K00";
  if (r === "12C01") return "K01";
  if (r === "12C02") return "K02";
  if (r === "12C03") return "K03";
  return "K00"; // fallback
}

export function ExcelUploader({ open, onOpenChange, goldMode = false }: ExcelUploaderProps) {
  const { parsedExcelData: parsedData, setParsedExcelData: setParsedData, clearParsedExcelData, addSalad } = useProductionStore();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingWarning, setPendingWarning] = useState<{ action: "line" | "selected", target?: string, warnings: string[] } | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<UploadFeedback | null>(null);
  const [showFeedbackDetails, setShowFeedbackDetails] = useState(true);
  const [showRawPreview, setShowRawPreview] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Parse to JSON array of objects
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

      // === PASO 1: Extraer headers y analizar columnas ===
      const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
      const { matches: columnMatches, columnMap } = analyzeExcelColumns(headers);
      const rawPreview = jsonData.slice(0, 3);

      // === PASO 2: Parsear usando el mapa de columnas inteligente ===
      const mappedData: ParsedRow[] = jsonData.map((row) => {
        const codigo = columnMap.codigo ? row[columnMap.codigo] : "";
        const nombre = columnMap.nombre ? row[columnMap.nombre] : "";
        const recurso = columnMap.recurso ? row[columnMap.recurso] : "";
        const estado = columnMap.estado ? row[columnMap.estado] : "";
        const cantidadStr = columnMap.cantidad ? row[columnMap.cantidad] : "0";
        const cantidad = typeof cantidadStr === 'number' ? cantidadStr : parseFloat(String(cantidadStr).replace(',', '.'));
        const lote = columnMap.lote ? row[columnMap.lote] : "";
        const noticia = columnMap.noticia ? row[columnMap.noticia] : "";

        const { name: boxTypeName, boxesPerPallet } = guessBoxType(String(nombre));

        // Parse time for sorting
        const dateStr = columnMap.fecha ? row[columnMap.fecha] : "";
        const timeStr = columnMap.hora ? row[columnMap.hora] : "";
        let timestamp = 0;
        
        if (timeStr) {
          try {
            const datePart = dateStr || new Date().toLocaleDateString('es-ES');
            const parts = String(datePart).split("/");
            if (parts.length >= 3) {
              const [day, month, year] = parts;
              const parseStr = `${month}/${day}/${year} ${String(timeStr)}`;
              timestamp = Date.parse(parseStr);
            }
            if (isNaN(timestamp)) timestamp = 0;
          } catch {
            timestamp = 0;
          }
        }

        return {
          id: generateId(),
          codigo: String(codigo || ""),
          nombre: String(nombre || ""),
          recurso: String(recurso || ""),
          linea: mapRecursoToLine(String(recurso || "")),
          estado: String(estado || ""),
          cantidad: isNaN(cantidad) ? 0 : cantidad,
          lote: String(lote || ""),
          dlc: extractDLC(String(noticia || "")),
          boxType: boxTypeName,
          boxesPerPallet,
          selected: true,
          timestamp
        } as ParsedRow & { timestamp: number };
      }).filter(item => item.codigo && item.nombre);

      // Ordenar por hora ("Desde")
      mappedData.sort((a, b) => a.timestamp - b.timestamp);

      // === PASO 3: Generar feedback ===
      const criticalMissing = columnMatches.filter(m => m.critical && m.status === "missing");
      const hasErrors = mappedData.length === 0;

      const feedback: UploadFeedback = {
        fileName: file.name,
        totalRows: jsonData.length,
        validRows: mappedData.length,
        discardedRows: jsonData.length - mappedData.length,
        headers,
        columnMatches,
        rawPreview,
        hasErrors,
        errorMessage: hasErrors
          ? criticalMissing.length > 0
            ? `No se encontraron las columnas obligatorias: ${criticalMissing.map(m => m.expected).join(", ")}. Revisa que tu Excel tenga estas columnas.`
            : jsonData.length === 0
            ? "El archivo Excel está vacío o no tiene datos en la primera hoja."
            : "Se leyeron filas pero ninguna tiene Código y Nombre válidos. Revisa el formato de los datos."
          : undefined,
      };

      setUploadFeedback(feedback);
      setShowFeedbackDetails(!hasErrors ? false : true); // Auto-collapse si todo OK
      setParsedData(mappedData);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      processFile(file);
    }
  };

  const toggleSelect = (id: string) => {
    setParsedData(parsedData.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
  };

  const toggleSelectAll = (linea: string, forceState?: boolean) => {
    setParsedData(parsedData.map(item => {
      if (item.linea === linea) {
        return { ...item, selected: forceState !== undefined ? forceState : !item.selected };
      }
      return item;
    }));
  };

  const handleAddLine = async (linea: string) => {
    const lineItems = parsedData.filter(item => item.linea === linea && item.selected);
    const noblejasConfig = useProductionStore.getState().noblejasConfig;

    // Verificar si hay alguna ensalada con menos cantidad total que lo exigido por Noblejas
    const warnings = [];
    for (const item of lineItems) {
      const noblejasReq = noblejasConfig[item.codigo] || 0;
      if (noblejasReq > item.cantidad) {
        warnings.push(`• ${item.nombre}: Pide ${noblejasReq} para Noblejas pero solo producirás ${item.cantidad}.`);
      }
    }

    if (warnings.length > 0) {
      setPendingWarning({ action: "line", target: linea, warnings });
      return;
    }
    
    await executeAddLine(linea);
  };

  const executeAddLine = async (linea: string) => {
    const lineItems = parsedData.filter(item => item.linea === linea && item.selected);
    for (const item of lineItems) {
      const noblejasConfig = useProductionStore.getState().noblejasConfig;

      const newFormat: Format = {
        id: generateId(),
        boxType: item.boxType,
        quantity: item.cantidad,
        noblejas: noblejasConfig[item.codigo] || 0,
        boxesPerPallet: item.boxesPerPallet,
        lote: item.lote,
        fechaCaducidad: item.dlc,
        cambioLote: false,
        codigo10e: item.codigo
      };

      const newSalad: Salad = {
        id: generateId(),
        name: item.nombre,
        formats: [newFormat]
      };

      await addSalad(newSalad, item.linea);
    }

    // Remover solo los que acabamos de cargar de ese panel
    const remainingData = parsedData.filter(item => !(item.linea === linea && item.selected));
    setParsedData(remainingData);
    
    // Si ya no quedan datos tras cargar esta línea, cerramos el panel
    if (remainingData.length === 0) {
      onOpenChange(false);
    }
  };

  const handleAddSelected = async () => {
    const selectedItems = parsedData.filter(item => item.selected);
    const noblejasConfig = useProductionStore.getState().noblejasConfig;

    const warnings = [];
    for (const item of selectedItems) {
      const noblejasReq = noblejasConfig[item.codigo] || 0;
      if (noblejasReq > item.cantidad) {
        warnings.push(`• ${item.nombre}: Pide ${noblejasReq} para Noblejas pero solo producirás ${item.cantidad}.`);
      }
    }

    if (warnings.length > 0) {
      setPendingWarning({ action: "selected", warnings });
      return;
    }
    
    await executeAddSelected();
  };

  const executeAddSelected = async () => {
    const selectedItems = parsedData.filter(item => item.selected);
    const noblejasConfig = useProductionStore.getState().noblejasConfig;

    // Process items and add them to the queue
    for (const item of selectedItems) {
      // Create Format
      const newFormat: Format = {
        id: generateId(),
        boxType: item.boxType,
        quantity: item.cantidad,
        noblejas: noblejasConfig[item.codigo] || 0,
        boxesPerPallet: item.boxesPerPallet,
        lote: item.lote,
        fechaCaducidad: item.dlc,
        linea: item.linea,
        codigo10e: item.codigo
      };

      // Create Salad wrapper
      const newSalad: Salad = {
        id: generateId(),
        name: item.nombre,
        formats: [newFormat]
      };

      await addSalad(newSalad, item.linea);
    }
    // Remover todos los que acabamos de cargar
    setParsedData(parsedData.filter(item => !item.selected));
    onOpenChange(false);
  };

  const handleMoveUp = (id: string, linea: string) => {
    const newData = [...parsedData];
    const globalIndexCurrent = newData.findIndex(item => item.id === id);
    if (globalIndexCurrent === -1) return;
    
    // Find previous item in the same line
    let globalIndexPrev = -1;
    for (let i = globalIndexCurrent - 1; i >= 0; i--) {
        if (newData[i].linea === linea) {
            globalIndexPrev = i;
            break;
        }
    }
    
    if (globalIndexPrev !== -1) {
        const temp = newData[globalIndexCurrent];
        newData[globalIndexCurrent] = newData[globalIndexPrev];
        newData[globalIndexPrev] = temp;
        setParsedData(newData);
    }
  };

  const handleMoveDown = (id: string, linea: string) => {
    const newData = [...parsedData];
    const globalIndexCurrent = newData.findIndex(item => item.id === id);
    if (globalIndexCurrent === -1) return;
    
    // Find next item in the same line
    let globalIndexNext = -1;
    for (let i = globalIndexCurrent + 1; i < newData.length; i++) {
        if (newData[i].linea === linea) {
            globalIndexNext = i;
            break;
        }
    }
    
    if (globalIndexNext !== -1) {
        const temp = newData[globalIndexCurrent];
        newData[globalIndexCurrent] = newData[globalIndexNext];
        newData[globalIndexNext] = temp;
        setParsedData(newData);
    }
  };

  // Group by line
  const groupedData = parsedData.reduce((acc, item) => {
    if (!acc[item.linea]) acc[item.linea] = [];
    acc[item.linea].push(item);
    return acc;
  }, {} as Record<string, ParsedRow[]>);

  const lineas = Object.keys(groupedData).sort();
  const hasData = parsedData.length > 0;
  const totalSelected = parsedData.filter(i => i.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={cn(
        "!max-w-[1400px] w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden border-0",
        goldMode ? "bg-[#120e06] text-white" : "bg-white text-[#0f291e]"
      )}>
        <DialogHeader className={cn(
          "px-6 py-4 border-b flex-shrink-0 relative",
          goldMode ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-50 border-emerald-100"
        )}>
          {/* Mac-style window controls */}
          <div className="flex gap-1.5 absolute left-6 top-1/2 -translate-y-1/2 z-10">
            <button onClick={() => onOpenChange(false)} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center group border border-black/10 shadow-sm transition-all">
              <X className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100" />
            </button>
            <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/10 shadow-sm"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/10 shadow-sm"></div>
          </div>
          <div className="flex items-center justify-between w-full pl-16">
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <FileSpreadsheet className={cn("w-6 h-6", goldMode ? "text-amber-400" : "text-emerald-600")} />
              Cargar Plan de Producción (Excel)
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const { fetchPendingExcelData } = await import("@/lib/supabase-service");
                const data = await fetchPendingExcelData();
                if (data && data.length > 0) {
                  setParsedData(data);
                }
              }}
              className={cn(
                "flex items-center gap-2 text-xs h-8 px-3",
                goldMode 
                  ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30" 
                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
              )}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sincronizar PCs
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {/* === PANEL DE FEEDBACK DE CARGA === */}
          {uploadFeedback && (
            <div className={cn(
              "mb-4 rounded-2xl border overflow-hidden transition-all",
              uploadFeedback.hasErrors
                ? goldMode ? "border-red-500/40 bg-red-500/10" : "border-red-300 bg-red-50"
                : goldMode ? "border-emerald-500/30 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50/50"
            )}>
              {/* Header del feedback */}
              <button
                type="button"
                onClick={() => setShowFeedbackDetails(!showFeedbackDetails)}
                className={cn(
                  "w-full px-4 py-3 flex items-center justify-between transition-colors",
                  goldMode ? "hover:bg-white/5" : "hover:bg-black/5"
                )}
              >
                <div className="flex items-center gap-3">
                  {uploadFeedback.hasErrors ? (
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", goldMode ? "bg-red-500/20" : "bg-red-100")}>
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    </div>
                  ) : (
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", goldMode ? "bg-emerald-500/20" : "bg-emerald-100")}>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                  )}
                  <div className="text-left">
                    <p className="text-sm font-bold">
                      {uploadFeedback.hasErrors ? "❌ Error al procesar el Excel" : "✅ Excel cargado correctamente"}
                    </p>
                    <p className={cn("text-xs", goldMode ? "text-white/50" : "text-gray-500")}>
                      {uploadFeedback.fileName} · {uploadFeedback.totalRows} filas · {uploadFeedback.validRows} válidas
                      {uploadFeedback.discardedRows > 0 && ` · ${uploadFeedback.discardedRows} descartadas`}
                    </p>
                  </div>
                </div>
                {showFeedbackDetails ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
              </button>

              {/* Detalles expandibles */}
              {showFeedbackDetails && (
                <div className={cn("px-4 pb-4 space-y-3 border-t", goldMode ? "border-white/10" : "border-gray-200")}>
                  {/* Error principal */}
                  {uploadFeedback.errorMessage && (
                    <div className={cn(
                      "mt-3 p-3 rounded-xl border text-sm font-medium",
                      goldMode ? "bg-red-500/15 border-red-500/30 text-red-300" : "bg-red-100 border-red-200 text-red-700"
                    )}>
                      <p>{uploadFeedback.errorMessage}</p>
                    </div>
                  )}

                  {/* Grid de columnas detectadas */}
                  <div className="mt-3">
                    <p className={cn("text-xs font-black uppercase tracking-wider mb-2", goldMode ? "text-white/40" : "text-gray-500")}>
                      📊 Mapeo de Columnas
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {uploadFeedback.columnMatches.map((match, idx) => (
                        <div key={idx} className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs",
                          match.status === "exact"
                            ? goldMode ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : match.status === "fuzzy"
                            ? goldMode ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-700"
                            : match.critical
                            ? goldMode ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-red-50 border-red-200 text-red-600"
                            : goldMode ? "bg-white/5 border-white/10 text-white/40" : "bg-gray-50 border-gray-200 text-gray-400"
                        )}>
                          <span className="flex-shrink-0">
                            {match.status === "exact" ? "✅" : match.status === "fuzzy" ? "⚠️" : match.critical ? "❌" : "⬜"}
                          </span>
                          <span className="font-bold truncate">{match.expected}</span>
                          {match.found && (
                            <span className={cn("ml-auto text-[10px] font-mono truncate max-w-[120px]", goldMode ? "text-white/30" : "text-gray-400")}>
                              → {match.found}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Headers reales del Excel */}
                  {uploadFeedback.headers.length > 0 && (
                    <div>
                      <p className={cn("text-xs font-black uppercase tracking-wider mb-1.5", goldMode ? "text-white/40" : "text-gray-500")}>
                        🏷️ Columnas en tu Excel ({uploadFeedback.headers.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {uploadFeedback.headers.map((h, i) => (
                          <span key={i} className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border",
                            goldMode ? "bg-white/5 border-white/10 text-white/60" : "bg-white border-gray-200 text-gray-600"
                          )}>
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview de datos raw */}
                  {uploadFeedback.rawPreview.length > 0 && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowRawPreview(!showRawPreview)}
                        className={cn(
                          "flex items-center gap-2 text-xs font-bold transition-colors",
                          goldMode ? "text-white/50 hover:text-white/80" : "text-gray-500 hover:text-gray-700"
                        )}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{showRawPreview ? "Ocultar" : "Ver"} preview de datos raw ({uploadFeedback.rawPreview.length} filas)</span>
                        {showRawPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {showRawPreview && (
                        <div className="mt-2 overflow-x-auto">
                          <table className={cn(
                            "min-w-full text-[10px] font-mono border-collapse",
                            goldMode ? "text-white/70" : "text-gray-600"
                          )}>
                            <thead>
                              <tr>
                                {uploadFeedback.headers.map((h, i) => (
                                  <th key={i} className={cn(
                                    "px-2 py-1 text-left font-black border-b whitespace-nowrap",
                                    goldMode ? "border-white/10 text-white/50" : "border-gray-200 text-gray-500"
                                  )}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {uploadFeedback.rawPreview.map((row, rIdx) => (
                                <tr key={rIdx} className={cn(goldMode ? "border-b border-white/5" : "border-b border-gray-100")}>
                                  {uploadFeedback.headers.map((h, cIdx) => (
                                    <td key={cIdx} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate">
                                      {String(row[h] ?? "")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Botón para reintentar */}
                  {uploadFeedback.hasErrors && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setUploadFeedback(null);
                          fileInputRef.current?.click();
                        }}
                        className={cn(
                          "text-xs font-bold",
                          goldMode ? "border-amber-500/30 hover:bg-amber-500/20 text-amber-400" : "border-emerald-200 hover:bg-emerald-50 text-emerald-700"
                        )}
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        Subir otro archivo
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!hasData ? (
            <div 
              className={cn(
                "border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center transition-all cursor-pointer",
                isDragging 
                  ? (goldMode ? "border-amber-400 bg-amber-400/10" : "border-emerald-500 bg-emerald-50") 
                  : (goldMode ? "border-white/10 hover:border-amber-500/50 hover:bg-white/5" : "border-gray-200 hover:border-emerald-400 hover:bg-gray-50"),
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className={cn("w-12 h-12 mb-4", goldMode ? "text-amber-400/70" : "text-emerald-500/70")} />
              <h3 className="text-lg font-bold mb-2">Arrastra tu archivo Excel aquí</h3>
              <p className={cn("text-sm text-center mb-6", goldMode ? "text-white/50" : "text-gray-500")}>
                Soporta archivos .xlsx o .csv generados desde el sistema (Recurso 12C00, 12C01...)
              </p>
              <Button 
                variant="outline" 
                className={cn(
                  "font-bold",
                  goldMode ? "border-amber-500/30 hover:bg-amber-500 hover:text-black" : "border-emerald-200 hover:bg-emerald-50"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Explorar Archivos
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".xlsx, .xls, .csv" 
                onChange={handleFileUpload}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
              {lineas.map(linea => {
                const items = groupedData[linea];
                const allSelected = items.every(i => i.selected);
                const storeState = useProductionStore.getState();
                const queueLength = storeState.lineStorage[linea]?.queue?.length || 0;
                
                return (
                  <div key={linea} className={cn("rounded-xl border overflow-hidden", goldMode ? "border-white/10" : "border-gray-200")}>
                    <div className={cn(
                      "px-4 py-3 border-b flex items-center justify-between",
                      goldMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200"
                    )}>
                      <div className="flex items-center gap-3">
                        <Checkbox 
                          checked={allSelected} 
                          onCheckedChange={(checked) => toggleSelectAll(linea, checked as boolean)} 
                          className={goldMode ? "border-white/30 data-[state=checked]:bg-amber-500" : ""}
                        />
                        <h3 className="font-bold text-lg flex flex-wrap items-center gap-2 flex-1">
                          Línea {linea}
                          <span className={cn("text-xs px-2 py-1 rounded-full font-semibold", goldMode ? "bg-white/10 text-white/70" : "bg-gray-200 text-gray-600")}>
                            {items.length} formatos
                          </span>
                          {queueLength > 0 && (
                            <span className="text-[10px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full font-bold uppercase border border-red-500/30">
                              Tiene {queueLength} en cola
                            </span>
                          )}
                        </h3>
                        <Button
                          size="sm"
                          onClick={() => handleAddLine(linea)}
                          disabled={!items.some(i => i.selected)}
                          className={cn(
                            "h-8 text-xs font-bold px-4 ml-auto whitespace-nowrap",
                            goldMode ? "bg-amber-500 hover:bg-amber-400 text-black" : "bg-emerald-600 hover:bg-emerald-700 text-white"
                          )}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Cargar {linea}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="divide-y divide-gray-200 dark:divide-white/10">
                      {items.map(item => (
                        <div key={item.id} className={cn(
                          "px-4 py-3 flex items-start gap-4 transition-colors",
                          item.selected 
                            ? (goldMode ? "bg-amber-500/5" : "bg-emerald-50/50") 
                            : "hover:bg-black/5 dark:hover:bg-white/5"
                        )}>
                          <Checkbox 
                            checked={item.selected} 
                            onCheckedChange={() => toggleSelect(item.id)} 
                            className={cn("mt-1", goldMode ? "border-white/30 data-[state=checked]:bg-amber-500" : "")}
                          />
                          <div className="flex flex-col gap-1 -mt-1">
                            <button
                              type="button"
                              onClick={() => handleMoveUp(item.id, linea)}
                              className={cn("p-1 rounded hover:bg-black/10 transition-colors", goldMode ? "hover:bg-white/10" : "")}
                              title="Mover Arriba"
                            >
                              <span className="text-[10px]">⬆️</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDown(item.id, linea)}
                              className={cn("p-1 rounded hover:bg-black/10 transition-colors", goldMode ? "hover:bg-white/10" : "")}
                              title="Mover Abajo"
                            >
                              <span className="text-[10px]">⬇️</span>
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm leading-tight mb-1.5 line-clamp-2" title={item.nombre}>{item.nombre}</p>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-black text-base whitespace-nowrap">
                                {item.cantidad} cj.
                              </span>
                              <select 
                                value={item.linea}
                                onChange={(e) => {
                                  setParsedData(parsedData.map(d => d.id === item.id ? { ...d, linea: e.target.value } : d));
                                }}
                                className={cn(
                                  "text-[11px] bg-transparent border rounded px-1.5 py-0.5 font-bold cursor-pointer", 
                                  goldMode ? "border-white/20 text-white [&>option]:bg-[#120e06]" : "border-gray-300 text-gray-700 [&>option]:bg-white"
                                )}
                              >
                                <option value="K00">Mover a K00</option>
                                <option value="K01">Mover a K01</option>
                                <option value="K02">Mover a K02</option>
                                <option value="K03">Mover a K03</option>
                              </select>
                            </div>
                            <div className={cn("text-xs flex flex-wrap gap-x-3 gap-y-1", goldMode ? "text-white/60" : "text-gray-500")}>
                              <span title="Código Artículo"><span className="font-semibold opacity-70">Cód:</span> {item.codigo}</span>
                              <span title="Lote"><span className="font-semibold opacity-70">Lote:</span> {item.lote || "-"}</span>
                              <span title="Caducidad"><span className="font-semibold opacity-70">DLC:</span> {item.dlc || "-"}</span>
                              <span title="Caja detectada"><span className="font-semibold opacity-70">Tipo:</span> {item.boxType} ({item.boxesPerPallet} cj/pal)</span>
                              <span title="Estado"><span className="font-semibold opacity-70">Estado:</span> {item.estado}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {hasData && (
          <div className={cn(
            "p-4 border-t flex items-center justify-between",
            goldMode ? "bg-[#120e06] border-white/10" : "bg-white border-gray-200"
          )}>
            <Button 
              variant="outline" 
              onClick={() => { setParsedData([]); setUploadFeedback(null); }}
              className={cn(
                "flex items-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50",
                goldMode ? "border-red-500/30 bg-transparent hover:bg-red-500/20" : ""
              )}
            >
              <Trash2 className="w-4 h-4" />
              Limpiar Excel
            </Button>
            
            <Button 
              onClick={handleAddSelected}
              disabled={totalSelected === 0}
              className={cn(
                "flex items-center gap-2 font-bold px-6",
                goldMode 
                  ? "bg-amber-500 hover:bg-amber-400 text-black" 
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              )}
            >
              <CheckCircle2 className="w-5 h-5" />
              Añadir a la Cola ({totalSelected})
            </Button>
          </div>
        )}
      </DialogContent>
      <Dialog open={!!pendingWarning} onOpenChange={(open) => !open && setPendingWarning(null)}>
        <DialogContent className={cn(
          "max-w-md p-0 overflow-hidden border-0 shadow-2xl",
          goldMode ? "bg-[#120e06]" : "bg-white"
        )}>
          <div className={cn(
            "p-6 flex flex-col items-center text-center space-y-4",
            goldMode ? "text-white" : "text-slate-800"
          )}>
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center animate-in zoom-in-50",
              goldMode ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-600"
            )}>
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <h3 className="text-xl font-black">Discrepancia en Noblejas</h3>
            
            <p className={cn("text-sm", goldMode ? "text-white/70" : "text-slate-500")}>
              Hay ensaladas donde la cantidad total que has introducido es <strong>menor</strong> a lo que exige Noblejas:
            </p>

            <div className={cn(
              "w-full text-left text-sm p-4 rounded-lg overflow-y-auto max-h-40 space-y-2 border",
              goldMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
            )}>
              {pendingWarning?.warnings.map((w, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-amber-500 flex-shrink-0">•</span>
                  <span className="font-medium">{w.replace('• ', '')}</span>
                </div>
              ))}
            </div>

            <p className={cn("text-sm font-medium", goldMode ? "text-amber-400" : "text-amber-600")}>
              ¿Deseas proceder de todas formas?<br />(Los palets de Milagro se quedarán en 0)
            </p>
          </div>

          <div className={cn(
            "p-4 flex gap-3 justify-end border-t",
            goldMode ? "border-white/10 bg-black/20" : "border-slate-100 bg-slate-50"
          )}>
            <Button
              variant="outline"
              onClick={() => setPendingWarning(null)}
              className={cn(
                "flex-1",
                goldMode && "border-white/20 text-white hover:bg-white/10 hover:text-white"
              )}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const action = pendingWarning?.action;
                const target = pendingWarning?.target;
                setPendingWarning(null);
                if (action === "line" && target) {
                  executeAddLine(target);
                } else if (action === "selected") {
                  executeAddSelected();
                }
              }}
              className={cn(
                "flex-1 font-bold",
                goldMode 
                  ? "bg-amber-500 text-black hover:bg-amber-400" 
                  : "bg-amber-500 text-white hover:bg-amber-600"
              )}
            >
              Aceptar y Continuar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
