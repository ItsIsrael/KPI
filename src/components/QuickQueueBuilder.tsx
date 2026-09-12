"use client";

import { useState, useEffect } from "react";
import { useProductionStore } from "@/store/production-store";
import { DEFAULT_BOX_TYPES, DEFAULT_PRODUCTION_LINES, generateId, calculateFormat, getSaladsPerBox, DEFAULT_SALADS } from "@/types/types";
import type { Salad } from "@/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Package, Check, AlertCircle, Sparkles, Layers, ChevronDown, ChevronUp, Tag, Calendar, FileText, RefreshCw } from "lucide-react";
import { notifySuccess, notifyError } from "@/lib/notifications";
import { LineSelectorModal } from "@/components/LineSelectorModal";

interface QuickQueueBuilderProps {
  goldMode?: boolean;
  onCancel?: () => void;
}

export function QuickQueueBuilder({ goldMode = false, onCancel }: QuickQueueBuilderProps) {
  const { addSalad, activeLineCode, setActiveLineCode, salads } = useProductionStore();

  // Línea seleccionada en el formulario (por defecto la activa)
  const [selectedLine, setSelectedLine] = useState<string>(activeLineCode === "ALL" ? "K00" : activeLineCode);
  const [showLineModal, setShowLineModal] = useState(false);

  useEffect(() => {
    if (activeLineCode !== "ALL") {
      setSelectedLine(activeLineCode);
    }
  }, [activeLineCode]);

  const [saladName, setSaladName] = useState<string>("");
  const [selectedBoxType, setSelectedBoxType] = useState<string>("Cartón 6");
  const [quantity, setQuantity] = useState<string>("");
  
  // Toggle para Noblejas (Oculto por defecto)
  const [showNoblejasToggle, setShowNoblejasToggle] = useState<boolean>(false);
  const [noblejasPallets, setNoblejasPallets] = useState<string>("");
  const [noblejasCajas, setNoblejasCajas] = useState<string>("");

  // Toggle para Detalles Opcionales (Lote, Caducidad, Nota)
  const [showOptionalDetails, setShowOptionalDetails] = useState<boolean>(false);
  const [lote, setLote] = useState<string>("");
  const [fechaCaducidad, setFechaCaducidad] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [boxesPerPallet, setBoxesPerPallet] = useState<number>(DEFAULT_BOX_TYPES[0].defaultBoxesPerPallet);

  // Cálculos en vivo
  const numQuantity = Math.max(0, parseInt(quantity, 10) || 0);
  const numNobPallets = showNoblejasToggle ? Math.max(0, parseInt(noblejasPallets, 10) || 0) : 0;
  const numNobCajas = showNoblejasToggle ? Math.max(0, parseInt(noblejasCajas, 10) || 0) : 0;
  const totalNoblejasBoxes = numNobPallets * boxesPerPallet + numNobCajas;

  const maxNoblejasPallets = Math.max(0, Math.floor(numQuantity / boxesPerPallet));

  const calc = calculateFormat({
    id: "preview",
    boxType: selectedBoxType,
    quantity: numQuantity,
    noblejas: totalNoblejasBoxes,
    boxesPerPallet: boxesPerPallet,
  });

  const handleSelectBoxType = (boxName: string) => {
    setSelectedBoxType(boxName);
    const box = DEFAULT_BOX_TYPES.find((b) => b.name === boxName);
    if (box) {
      setBoxesPerPallet(box.defaultBoxesPerPallet);
      const newMaxPallets = Math.max(0, Math.floor(numQuantity / box.defaultBoxesPerPallet));
      if (numNobPallets > newMaxPallets) {
        setNoblejasPallets(String(newMaxPallets));
      }
    }
  };

  const handleQuantityChange = (newQtyStr: string) => {
    setQuantity(newQtyStr);
    const newQty = Math.max(0, parseInt(newQtyStr, 10) || 0);
    if (totalNoblejasBoxes > newQty) {
      const newMaxPallets = Math.max(0, Math.floor(newQty / boxesPerPallet));
      const newRemainingCajas = Math.max(0, newQty - newMaxPallets * boxesPerPallet);
      setNoblejasPallets(String(newMaxPallets));
      setNoblejasCajas(String(newRemainingCajas));
    }
  };

  const handleAddQuickQty = (amount: number) => {
    const current = parseInt(quantity, 10) || 0;
    handleQuantityChange(String(current + amount));
  };

  const handleResetForm = () => {
    setSaladName("");
    setQuantity("");
    setNoblejasPallets("");
    setNoblejasCajas("");
    setLote("");
    setFechaCaducidad("");
    setNote("");
    setShowNoblejasToggle(false);
    setShowOptionalDetails(false);
    if (onCancel) onCancel();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!saladName.trim()) {
      notifyError("Formulario incompleto", "Por favor, introduce o selecciona el nombre de la ensalada.");
      return;
    }

    if (numQuantity <= 0) {
      notifyError("Cantidad inválida", "La cantidad de cajas debe ser mayor a 0.");
      return;
    }

    if (totalNoblejasBoxes > numQuantity) {
      notifyError("Error en Noblejas", `Las cajas de Noblejas (${totalNoblejasBoxes}) no pueden superar el total de la orden (${numQuantity} cajas).`);
      return;
    }

    const newFormat = {
      id: generateId(),
      boxType: selectedBoxType,
      quantity: numQuantity,
      noblejas: totalNoblejasBoxes,
      boxesPerPallet: boxesPerPallet,
      note: note.trim() || undefined,
      lote: lote.trim() || undefined,
      cambioLote: false,
      fechaCaducidad: fechaCaducidad.trim() || undefined,
      linea: selectedLine,
      createdAt: Date.now(),
    };

    const newSalad: Salad = {
      id: generateId(),
      name: saladName.trim().toUpperCase(),
      formats: [newFormat],
    };

    // Añadir a la línea seleccionada
    await addSalad(newSalad, selectedLine);

    if (activeLineCode !== "ALL" && activeLineCode !== selectedLine) {
      setActiveLineCode(selectedLine);
    }

    notifySuccess("Orden creada con éxito", `${saladName.trim().toUpperCase()} (${numQuantity} cajas) añadida a línea ${selectedLine}`);

    // Resetear formulario para entrada continua rápida
    setQuantity("");
    setNoblejasPallets("");
    setNoblejasCajas("");
    setLote("");
    setFechaCaducidad("");
    setNote("");
    setShowNoblejasToggle(false);
    setShowOptionalDetails(false);
  };

  // Nombres de ensaladas disponibles (catálogo local o fallback)
  const availableSaladNames = salads && salads.length > 0
    ? Array.from(new Set(salads.map((s) => s.name)))
    : DEFAULT_SALADS;

  return (
    <div className={cn(
      "glass-card rounded-3xl p-5 sm:p-7 border shadow-xl relative overflow-hidden transition-all space-y-6",
      goldMode
        ? "bg-[#141006]/95 border-amber-500/30 text-white"
        : "bg-white/95 border-emerald-600/20 text-slate-900 shadow-emerald-950/5"
    )}>
      {/* 1. Cabecera Contextual: Línea activa preseleccionada */}
      <div className={cn(
        "p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-3 transition-all",
        goldMode
          ? "bg-amber-500/[0.06] border-amber-500/25 text-amber-300"
          : "bg-emerald-50/80 border-emerald-600/20 text-emerald-900"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center font-black shadow-inner shrink-0",
            goldMode ? "bg-amber-500/20 text-amber-300" : "bg-emerald-600 text-white"
          )}>
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
              <span>Nueva Orden</span>
              <span className="opacity-40">·</span>
              <span className={cn(
                "px-2.5 py-0.5 rounded-lg text-sm font-black border",
                goldMode ? "bg-amber-500/20 border-amber-400 text-amber-300" : "bg-emerald-600 text-white border-emerald-700"
              )}>
                Línea {selectedLine}
              </span>
            </h2>
            <p className={cn("text-xs font-semibold mt-0.5", goldMode ? "text-white/50" : "text-slate-500")}>
              Creación directa de formato de producción
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowLineModal(true)}
          className={cn(
            "h-10 px-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95",
            goldMode
              ? "bg-white/5 hover:bg-white/10 border-white/20 text-amber-300"
              : "bg-white hover:bg-emerald-100/60 border-slate-300 text-slate-700"
          )}
        >
          <span>Cambiar Línea</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 2. Seleccionar Ensalada */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className={cn("text-xs font-black uppercase tracking-wider block", goldMode ? "text-white/80" : "text-slate-800")}>
              🥗 Ensalada
            </label>
            <span className={cn("text-[11px] font-medium", goldMode ? "text-white/40" : "text-slate-500")}>
              Selecciona del catálogo o escribe el nombre
            </span>
          </div>

          {/* Chips de Ensaladas */}
          {availableSaladNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {availableSaladNames.map((name) => {
                const isSelected = saladName.toLowerCase() === name.toLowerCase();
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSaladName(name)}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none shadow-sm border min-h-[40px] flex items-center justify-center",
                      isSelected
                        ? goldMode
                          ? "bg-amber-500 text-black border-amber-400 font-black shadow-md scale-[1.03]"
                          : "bg-emerald-600 text-white border-emerald-700 font-black shadow-md scale-[1.03]"
                        : goldMode
                        ? "bg-white/5 text-white/80 hover:text-white hover:bg-white/10 border-white/10"
                        : "bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 border-slate-200"
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Fallback Sin Catálogo (Requirement 4) */
            <div className="p-3.5 rounded-2xl border border-dashed border-slate-300 dark:border-white/15 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-500 dark:text-white/50">
                Aún no hay formatos configurados. Escribe el nombre de la ensalada directamente:
              </span>
            </div>
          )}

          {/* Campo de Entrada Directa de Nombre */}
          <input
            type="text"
            required
            value={saladName}
            onChange={(e) => setSaladName(e.target.value)}
            placeholder="Escribe el nombre de la ensalada (Ej: César, Primavera...)"
            className={cn(
              "w-full h-11 px-3.5 rounded-xl border text-sm transition-all font-bold min-h-[44px]",
              goldMode
                ? "bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-amber-400"
                : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            )}
          />
        </div>

        {/* 3. Tipo de Caja */}
        <div className="space-y-2.5">
          <label className={cn("text-xs font-black uppercase tracking-wider block", goldMode ? "text-white/80" : "text-slate-800")}>
            📦 Tipo de Caja
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {DEFAULT_BOX_TYPES.map((b) => {
              const isSelected = selectedBoxType === b.name;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleSelectBoxType(b.name)}
                  className={cn(
                    "p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col justify-center items-center gap-0.5 select-none shadow-sm min-h-[44px]",
                    isSelected
                      ? goldMode
                        ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-md font-black ring-1 ring-amber-500/30"
                        : "bg-emerald-50 border-emerald-600 text-emerald-800 shadow-md font-black ring-2 ring-emerald-600/30"
                      : goldMode
                      ? "bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/5 hover:text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300"
                  )}
                >
                  <span className="text-xs font-bold">{b.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Cajas Totales */}
        <div className={cn(
          "rounded-2xl p-4 border shadow-sm space-y-3",
          goldMode ? "bg-white/[0.02] border-white/5" : "bg-emerald-50/40 border-emerald-600/15"
        )}>
          <div className="flex items-center justify-between">
            <label className={cn("text-xs font-black uppercase tracking-wider flex items-center gap-1.5", goldMode ? "text-white/80" : "text-slate-800")}>
              <Package className="w-4 h-4 text-emerald-600" />
              <span>Cajas Totales</span>
            </label>
            {numQuantity > 0 && (
              <span className="text-xs font-mono font-bold text-emerald-600">
                {Math.floor(numQuantity / boxesPerPallet)} palets completos {numQuantity % boxesPerPallet > 0 ? `+ ${numQuantity % boxesPerPallet} cajas pico` : ""}
              </span>
            )}
          </div>

          <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              placeholder="Ej: 144"
              className={cn(
                "flex-1 h-11 px-3.5 rounded-xl border text-base font-mono font-black transition-all min-h-[44px]",
                goldMode
                  ? "bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-amber-400"
                  : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              )}
            />
            <div className="flex gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleAddQuickQty(boxesPerPallet)}
                className={cn(
                  "flex-1 sm:flex-none h-11 px-3.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm flex items-center justify-center min-h-[44px]",
                  goldMode
                    ? "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                    : "bg-white hover:bg-emerald-50 border-slate-300 text-slate-800"
                )}
                title={`Añadir 1 palet completo (${boxesPerPallet} cajas)`}
              >
                +1 Palet
              </button>
              <button
                type="button"
                onClick={() => handleAddQuickQty(50)}
                className={cn(
                  "h-11 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm flex items-center justify-center min-h-[44px]",
                  goldMode
                    ? "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                    : "bg-white hover:bg-emerald-50 border-slate-300 text-slate-800"
                )}
              >
                +50
              </button>
              <button
                type="button"
                onClick={() => handleAddQuickQty(100)}
                className={cn(
                  "h-11 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm flex items-center justify-center min-h-[44px]",
                  goldMode
                    ? "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                    : "bg-white hover:bg-emerald-50 border-slate-300 text-slate-800"
                )}
              >
                +100
              </button>
            </div>
          </div>
        </div>

        {/* 5. Toggle de Noblejas (Oculto por defecto) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowNoblejasToggle(!showNoblejasToggle)}
            className={cn(
              "w-full p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer min-h-[44px]",
              showNoblejasToggle
                ? goldMode
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                  : "bg-purple-50 border-purple-300 text-purple-800 font-black"
                : goldMode
                ? "bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/5"
                : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
            )}
          >
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span>Añadir Noblejas (Opcional)</span>
              {showNoblejasToggle && totalNoblejasBoxes > 0 && (
                <span className="font-mono text-[11px] opacity-80">({totalNoblejasBoxes} cajas)</span>
              )}
            </span>
            {showNoblejasToggle ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showNoblejasToggle && (
            <div className={cn(
              "mt-2 p-4 rounded-2xl border space-y-3 animate-in fade-in duration-200",
              goldMode ? "bg-purple-500/[0.04] border-purple-500/20" : "bg-purple-50/70 border-purple-200"
            )}>
              <div className="flex items-center justify-between text-xs font-bold text-purple-800 dark:text-purple-300">
                <span>Separación Noblejas (Máx {numQuantity} cajas)</span>
                {totalNoblejasBoxes > 0 && (
                  <span className="font-mono">{numNobPallets} palets + {numNobCajas} cajas sueltas</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300 block">
                    Palets Noblejas (Máx {maxNoblejasPallets})
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={maxNoblejasPallets}
                    value={noblejasPallets}
                    onChange={(e) => setNoblejasPallets(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 px-3 rounded-xl border text-sm font-mono font-bold bg-white dark:bg-black/40 border-purple-300 text-purple-950 dark:text-purple-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300 block">
                    Cajas Sueltas
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={noblejasCajas}
                    onChange={(e) => setNoblejasCajas(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 px-3 rounded-xl border text-sm font-mono font-bold bg-white dark:bg-black/40 border-purple-300 text-purple-950 dark:text-purple-100"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 6. Detalles Opcionales (Lote, Caducidad, Nota) */}
        <div>
          <button
            type="button"
            onClick={() => setShowOptionalDetails(!showOptionalDetails)}
            className={cn(
              "w-full p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer min-h-[44px]",
              showOptionalDetails
                ? goldMode
                  ? "bg-amber-500/10 border-amber-400/30 text-amber-300"
                  : "bg-slate-100 border-slate-300 text-slate-900 font-bold"
                : goldMode
                ? "bg-white/[0.02] border-white/10 text-white/60 hover:bg-white/5"
                : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
            )}
          >
            <span className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 opacity-60" />
              <span>Detalles Opcionales (Lote, Caducidad, Notas)</span>
            </span>
            {showOptionalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showOptionalDetails && (
            <div className="mt-2 p-4 rounded-2xl border border-slate-200 dark:border-white/10 space-y-3 bg-slate-50/50 dark:bg-white/[0.02] animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-white/50 block">
                    Código de Lote
                  </label>
                  <input
                    type="text"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    placeholder="Ej: L-2409"
                    className="w-full h-10 px-3 rounded-xl border text-xs font-mono font-bold bg-white dark:bg-black/40 border-slate-300 dark:border-white/15"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 dark:text-white/50 block">
                    Fecha de Caducidad (DLC)
                  </label>
                  <input
                    type="text"
                    value={fechaCaducidad}
                    onChange={(e) => setFechaCaducidad(e.target.value)}
                    placeholder="Ej: 25/09"
                    className="w-full h-10 px-3 rounded-xl border text-xs font-mono font-bold bg-white dark:bg-black/40 border-slate-300 dark:border-white/15"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 dark:text-white/50 block">
                  Nota / Observaciones
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Instrucciones para el operario..."
                  className="w-full h-10 px-3 rounded-xl border text-xs font-medium bg-white dark:bg-black/40 border-slate-300 dark:border-white/15"
                />
              </div>
            </div>
          )}
        </div>

        {/* 7. Vista-Resumen Dinámica (Live Summary Box) */}
        {saladName.trim() && numQuantity > 0 && (
          <div className={cn(
            "p-4 rounded-2xl border shadow-inner flex items-center justify-between flex-wrap gap-2 animate-in slide-in-from-bottom-2 duration-200",
            goldMode
              ? "bg-gradient-to-r from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-200"
              : "bg-gradient-to-r from-emerald-600/15 to-teal-600/10 border-emerald-600/40 text-emerald-950 dark:text-emerald-100"
          )}>
            <div className="flex items-center gap-2 flex-wrap text-sm sm:text-base font-black">
              <span className="px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 text-xs uppercase font-mono">
                Línea {selectedLine}
              </span>
              <span>·</span>
              <span className="truncate max-w-[180px]">{saladName.trim().toUpperCase()}</span>
              <span>·</span>
              <span>{selectedBoxType}</span>
              <span>·</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400">{numQuantity} cajas</span>
              {calc && (
                <span className="text-xs font-normal opacity-80 font-mono">
                  ({calc.pallets} pales {calc.pico > 0 ? `+ ${calc.pico} pico` : ""})
                </span>
              )}
            </div>

            {totalNoblejasBoxes > 0 && (
              <span className="text-xs font-bold bg-purple-500/20 text-purple-800 dark:text-purple-300 px-2.5 py-1 rounded-lg border border-purple-500/30">
                🏷️ Nob: {totalNoblejasBoxes} c
              </span>
            )}
          </div>
        )}

        {/* 8. Botones de Acción (Confirmar / Cancelar) */}
        <div className="pt-2 flex items-center gap-3 flex-wrap sm:flex-nowrap">
          {onCancel && (
            <button
              type="button"
              onClick={handleResetForm}
              className={cn(
                "w-full sm:w-auto h-12 px-5 rounded-2xl font-bold text-xs border transition-all cursor-pointer active:scale-95 shrink-0 min-h-[48px]",
                goldMode
                  ? "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                  : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700"
              )}
            >
              Cancelar / Volver
            </button>
          )}

          <Button
            type="submit"
            disabled={!saladName.trim() || numQuantity <= 0}
            className={cn(
              "w-full flex-1 h-12 text-sm sm:text-base font-black rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg cursor-pointer min-h-[48px]",
              goldMode
                ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-amber-500/25"
                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25"
            )}
          >
            <Plus className="w-5 h-5" />
            <span>Confirmar y Añadir a la Cola</span>
          </Button>
        </div>
      </form>

      {/* Modal Selector de Línea */}
      <LineSelectorModal
        open={showLineModal}
        onOpenChange={setShowLineModal}
        goldMode={goldMode}
      />
    </div>
  );
}
