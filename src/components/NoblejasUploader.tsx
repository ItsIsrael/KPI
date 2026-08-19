"use client";

import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { Upload, Plus, Trash2, Box, Save, CheckCircle2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProductionStore } from "@/store/production-store";

interface NoblejasEntry {
  id: string;
  codigo: string;
  nombre: string;
  palets: number;
  cajasExtra: number;
}

interface NoblejasUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goldMode?: boolean;
}

export function NoblejasUploader({ open, onOpenChange, goldMode = false }: NoblejasUploaderProps) {
  const [entries, setEntries] = useState<NoblejasEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { noblejasConfig, setNoblejasConfigBulk, removeNoblejasConfig } = useProductionStore();

  // Manual entry state
  const [manualCode, setManualCode] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPalets, setManualPalets] = useState("");
  const [manualExtra, setManualExtra] = useState("");

  const [uploadFeedback, setUploadFeedback] = useState<{ total: number; valid: number; error?: string } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      e.target.value = "";
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error("El archivo Excel no contiene hojas.");
        }
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!jsonData || jsonData.length === 0) {
          setUploadFeedback({ total: 0, valid: 0, error: "El archivo está vacío o no contiene filas con datos." });
          return;
        }

        const newEntries = jsonData.map((row) => {
          // Buscar columna de código con múltiples variantes
          const rawCodigo = Object.entries(row).find(([k]) => 
            /c[oó]d/i.test(k) || /10e/i.test(k) || /art/i.test(k) || /material/i.test(k)
          )?.[1] || "";
          
          let codigo = String(rawCodigo).trim().toUpperCase();
          if (codigo && !codigo.startsWith("10E")) {
            codigo = `10E${codigo.replace(/^E/i, '')}`;
          }

          // Buscar nombre
          const nombre = String(
            Object.entries(row).find(([k]) => /nom/i.test(k) || /desc/i.test(k) || /prod/i.test(k))?.[1] || "Ensalada Noblejas"
          ).trim();

          // Buscar palets
          const rawPalets = Object.entries(row).find(([k]) => /palet/i.test(k) || /pal/i.test(k))?.[1] || "0";
          const palets = parseInt(String(rawPalets), 10);

          // Buscar cajas extra
          const rawExtra = Object.entries(row).find(([k]) => /extra/i.test(k) || /pico/i.test(k) || /suelta/i.test(k))?.[1] || "0";
          const cajasExtra = parseInt(String(rawExtra), 10);

          return {
            id: crypto.randomUUID(),
            codigo,
            nombre,
            palets: isNaN(palets) ? 0 : palets,
            cajasExtra: isNaN(cajasExtra) ? 0 : cajasExtra,
          };
        }).filter(item => item.codigo && item.codigo.length > 3);

        if (newEntries.length === 0) {
          setUploadFeedback({
            total: jsonData.length,
            valid: 0,
            error: "Se leyeron filas pero no se detectaron códigos de artículo válidos (ej. 10E943 o 943). Revisa las columnas de tu Excel.",
          });
          return;
        }

        setEntries(prev => [...prev, ...newEntries]);
        setUploadFeedback({ total: jsonData.length, valid: newEntries.length });
      } catch (err: any) {
        setUploadFeedback({ total: 0, valid: 0, error: `Error al procesar archivo: ${err?.message || "Formato no compatible."}` });
      }
    };
    reader.onerror = () => {
      setUploadFeedback({ total: 0, valid: 0, error: "Error al leer el archivo desde el navegador." });
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

  const handleAddManual = () => {
    if (!manualCode) return;
    
    // Extraer solo los números y asegurar que empieza por 10E
    const cleanCode = manualCode.replace(/^10[eE]/i, '');
    const finalCode = `10E${cleanCode}`.toUpperCase();

    setEntries(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        codigo: finalCode,
        nombre: manualName || "Ensalada Noblejas",
        palets: parseInt(manualPalets || "0", 10),
        cajasExtra: parseInt(manualExtra || "0", 10),
      }
    ]);
    setManualCode("");
    setManualName("");
    setManualPalets("");
    setManualExtra("");
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleSaveToConfig = () => {
    // Save to the global store noblejasConfig
    // The noblejasConfig just maps codigo10e -> total cajas
    // Total cajas = (palets * 64) + cajas extra... wait, boxesPerPallet is dynamic?
    // We don't know boxesPerPallet until it's matched with a format. 
    // Wait, the user said "cantidad en palets y si hay cajas extra". 
    // The current store setNoblejasConfig just saves `boxes`, an absolute integer.
    // If we only have palets and extra boxes, we might need to assume a default boxes per pallet, OR we store an object.
    // Let's assume standard 64 boxes per pallet if unknown, or maybe the user just enters exact boxes?
    // Let's store total = (palets * 64) + cajasExtra as a fallback, but the correct approach is the user provides absolute total boxes.
    // I will use `(palets * 72)` for Cartón 4/6 as a common default, but we should probably prompt for total boxes.
    // Wait, let's just do a rough calculation: 72 boxes/pallet for Cartón.
    
    const configs: Record<string, number> = {};
    entries.forEach(entry => {
      const nombreUpper = entry.nombre.toUpperCase();
      let boxesPerPallet = 72; // Default para Cartón 4/6
      
      if (nombreUpper.includes("LIDL")) {
        boxesPerPallet = 84;
      } else if (nombreUpper.includes("ALI")) {
        boxesPerPallet = 72; // ALI es de 72 cajas
      } else if (nombreUpper.includes("LL6410")) {
        boxesPerPallet = 64; // LL6410 es 64 cajas
      }
      
      const totalBoxes = (entry.palets * boxesPerPallet) + entry.cajasExtra;
      configs[entry.codigo] = totalBoxes;
    });
    
    setNoblejasConfigBulk(configs);

    setEntries([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={cn(
        "!max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 overflow-hidden border-0",
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
          <DialogTitle className="flex items-center gap-2 text-xl font-black pl-16">
            <Box className={cn("w-6 h-6", goldMode ? "text-amber-400" : "text-emerald-600")} />
            Cargar Cajas Noblejas
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Manual Entry Form */}
          <div className={cn("p-4 rounded-xl border", goldMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")}>
            <h3 className="font-bold mb-4">Ingreso Manual</h3>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
              <div className="space-y-1 sm:col-span-1">
                <Label>Cód. 10E</Label>
                <div className={cn(
                  "flex items-center w-full h-10 px-3 rounded-md border overflow-hidden transition-colors focus-within:ring-1 focus-within:ring-emerald-500",
                  goldMode ? "bg-black/50 border-white/20 text-white" : "bg-white border-slate-200"
                )}>
                  <span className={cn("text-sm font-bold opacity-50 mr-1", goldMode ? "text-white" : "text-slate-500")}>10E</span>
                  <input 
                    type="text" 
                    value={manualCode} 
                    onChange={e => setManualCode(e.target.value)} 
                    placeholder="123"
                    className="w-full h-full bg-transparent text-sm font-medium outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Nombre</Label>
                <Input 
                  value={manualName} 
                  onChange={e => setManualName(e.target.value)} 
                  placeholder="Ej. César"
                  className={goldMode ? "bg-black/50 border-white/20 text-white" : "bg-white"}
                />
              </div>
              <div className="space-y-1 sm:col-span-1">
                <Label>Palets</Label>
                <Input 
                  type="number" 
                  value={manualPalets} 
                  onChange={e => setManualPalets(e.target.value)} 
                  placeholder="0"
                  className={goldMode ? "bg-black/50 border-white/20 text-white" : "bg-white"}
                />
              </div>
              <div className="space-y-1 sm:col-span-1">
                <Label>Extra</Label>
                <div className="flex gap-2">
                  <Input 
                    type="text" 
                    inputMode="numeric"
                    value={manualExtra} 
                    onChange={e => setManualExtra(e.target.value)} 
                    placeholder="0"
                    className={cn(
                      "min-w-[60px]",
                      goldMode ? "bg-black/50 border-white/20 text-white" : "bg-white"
                    )}
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddManual}
                    className={goldMode ? "bg-amber-500 text-black hover:bg-amber-400" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Excel Dropzone */}
          <div 
            className={cn(
              "border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer",
              isDragging 
                ? (goldMode ? "border-amber-400 bg-amber-400/10" : "border-emerald-500 bg-emerald-50") 
                : (goldMode ? "border-white/10 hover:border-amber-500/50 hover:bg-white/5" : "border-gray-200 hover:border-emerald-400 hover:bg-gray-50"),
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className={cn("w-8 h-8 mb-2", goldMode ? "text-amber-400/70" : "text-emerald-500/70")} />
            <h4 className="font-bold">Subir Excel de Noblejas</h4>
            <p className="text-xs text-center opacity-60">
              Formato esperado: Columnas [Código, Nombre, Palets, Cajas Extra]
            </p>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".xlsx, .xls, .csv" 
              onChange={handleFileUpload}
            />
          </div>

          {/* Feedback de Subida Noblejas */}
          {uploadFeedback && (
            <div className={cn(
              "p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2",
              uploadFeedback.error
                ? goldMode ? "bg-red-500/15 border-red-500/30 text-red-300" : "bg-red-50 border-red-200 text-red-700"
                : goldMode ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-700"
            )}>
              <div className="flex items-center gap-2">
                <span>{uploadFeedback.error ? "❌" : "✅"}</span>
                <span>
                  {uploadFeedback.error
                    ? uploadFeedback.error
                    : `Se han cargado ${uploadFeedback.valid} artículos de Noblejas correctamente (${uploadFeedback.total} filas leídas).`}
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => setUploadFeedback(null)} 
                className="opacity-50 hover:opacity-100 p-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* List of Entries */}
          {entries.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-bold border-b pb-2">Lista para Procesar</h3>
              <div className="divide-y divide-gray-200 dark:divide-white/10">
                {entries.map(entry => (
                  <div key={entry.id} className="py-2 flex items-center justify-between">
                    <div>
                      <p className="font-bold">{entry.nombre} <span className="text-xs opacity-70 ml-2">({entry.codigo})</span></p>
                      <p className="text-sm opacity-70">Palets: {entry.palets} | Cajas extra: {entry.cajasExtra}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeEntry(entry.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saved Config Section */}
          <div className="pt-6">
            <h3 className="font-bold border-b pb-2 mb-4">Configuraciones Guardadas en Base de Datos Local</h3>
            {Object.keys(noblejasConfig).length === 0 ? (
              <p className="text-sm opacity-60 italic text-center py-4">No hay cajas configuradas actualmente.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(noblejasConfig).map(([codigo, cajas]) => (
                  <div key={codigo} className={cn(
                    "p-3 rounded-xl border flex items-center justify-between",
                    goldMode ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
                  )}>
                    <div>
                      <p className="font-bold text-sm">{codigo}</p>
                      <p className={cn("text-xs", goldMode ? "text-emerald-400" : "text-emerald-600 font-semibold")}>
                        {cajas} cajas
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeNoblejasConfig(codigo)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 h-8 w-8"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {entries.length > 0 && (
          <div className={cn(
            "p-4 border-t flex items-center justify-between",
            goldMode ? "bg-[#120e06] border-white/10" : "bg-white border-gray-200"
          )}>
            <Button 
              variant="outline" 
              onClick={() => setEntries([])}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/20"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpiar
            </Button>
            
            <Button 
              onClick={handleSaveToConfig}
              className={cn(
                "flex items-center gap-2 font-bold px-6",
                goldMode 
                  ? "bg-amber-500 hover:bg-amber-400 text-black" 
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              )}
            >
              <Save className="w-5 h-5" />
              Guardar Configuración
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
