"use client";

import { useState, useEffect } from "react";
import { useProductionStore } from "@/store/production-store";
import { DEFAULT_BOX_TYPES, DEFAULT_PRODUCTION_LINES, generateId, calculateFormat, getSaladsPerBox, DEFAULT_SALADS } from "@/types/types";
import type { Salad } from "@/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Package, Check, AlertCircle, Sparkles, Layers } from "lucide-react";



interface QuickQueueBuilderProps {
  goldMode?: boolean;
}

export function QuickQueueBuilder({ goldMode = false }: QuickQueueBuilderProps) {
  const { addSalad, activeLineCode, setActiveLineCode } = useProductionStore();

  // Línea seleccionada en el formulario (por defecto la activa)
  const [selectedLine, setSelectedLine] = useState<string>(activeLineCode === "ALL" ? "K00" : activeLineCode);

  useEffect(() => {
    if (activeLineCode !== "ALL") {
      setSelectedLine(activeLineCode);
    }
  }, [activeLineCode]);

  const [saladName, setSaladName] = useState<string>("");
  const [selectedBoxType, setSelectedBoxType] = useState<string>("Cartón 6");
  const [quantity, setQuantity] = useState<string>("");
  const [noblejasPallets, setNoblejasPallets] = useState<string>("");
  const [noblejasCajas, setNoblejasCajas] = useState<string>("");
  const [boxesPerPallet, setBoxesPerPallet] = useState<number>(DEFAULT_BOX_TYPES[0].defaultBoxesPerPallet);
  const [lote, setLote] = useState<string>("");
  const [fechaCaducidad, setFechaCaducidad] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Cálculos en vivo y límites de Noblejas
  const numQuantity = Math.max(0, parseInt(quantity, 10) || 0);
  const numNobPallets = Math.max(0, parseInt(noblejasPallets, 10) || 0);
  const numNobCajas = Math.max(0, parseInt(noblejasCajas, 10) || 0);
  const totalNoblejasBoxes = numNobPallets * boxesPerPallet + numNobCajas;

  // Límites estrictos basados en la cantidad total de la orden
  const maxNoblejasPallets = Math.max(0, Math.floor(numQuantity / boxesPerPallet));
  const remainingMilagroBoxes = Math.max(0, numQuantity - totalNoblejasBoxes);
  const canAddNobPallet = (numNobPallets + 1) * boxesPerPallet <= numQuantity;

  const calc = calculateFormat({
    id: "preview",
    boxType: selectedBoxType,
    quantity: numQuantity,
    noblejas: totalNoblejasBoxes,
    boxesPerPallet: boxesPerPallet,
  });

  const totalSalads = numQuantity * getSaladsPerBox(selectedBoxType);

  const handleSelectBoxType = (boxName: string) => {
    setSelectedBoxType(boxName);
    const box = DEFAULT_BOX_TYPES.find((b) => b.name === boxName);
    if (box) {
      setBoxesPerPallet(box.defaultBoxesPerPallet);
      // Re-validar noblejas con la nueva capacidad de palet
      const newMaxPallets = Math.max(0, Math.floor(numQuantity / box.defaultBoxesPerPallet));
      if (numNobPallets > newMaxPallets) {
        setNoblejasPallets(String(newMaxPallets));
      }
    }
  };

  const handleQuantityChange = (newQtyStr: string) => {
    setQuantity(newQtyStr);
    const newQty = Math.max(0, parseInt(newQtyStr, 10) || 0);
    // Si la nueva cantidad es menor que el total de noblejas actual, ajustar automáticamente
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

  const handleNoblejasPalletsChange = (val: string) => {
    if (val === "") {
      setNoblejasPallets("");
      return;
    }
    let p = parseInt(val, 10) || 0;
    p = Math.max(0, Math.min(p, maxNoblejasPallets));
    setNoblejasPallets(String(p));

    // Si excede el total junto con las cajas sueltas, ajustar cajas sueltas
    const remainingForBoxes = Math.max(0, numQuantity - p * boxesPerPallet);
    if (numNobCajas > remainingForBoxes) {
      setNoblejasCajas(String(remainingForBoxes));
    }
  };

  const handleNoblejasCajasChange = (val: string) => {
    if (val === "") {
      setNoblejasCajas("");
      return;
    }
    let c = parseInt(val, 10) || 0;
    const maxAvailableCajas = Math.max(0, numQuantity - numNobPallets * boxesPerPallet);
    c = Math.max(0, Math.min(c, maxAvailableCajas));
    setNoblejasCajas(String(c));
  };

  const handleAddQuickNobPallet = (pallets: number) => {
    const current = parseInt(noblejasPallets, 10) || 0;
    const target = current + pallets;
    if (target <= maxNoblejasPallets) {
      setNoblejasPallets(String(target));
      const remainingForBoxes = Math.max(0, numQuantity - target * boxesPerPallet);
      if (numNobCajas > remainingForBoxes) {
        setNoblejasCajas(String(remainingForBoxes));
      }
    }
  };

  const handleResetNoblejas = () => {
    setNoblejasPallets("");
    setNoblejasCajas("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!saladName.trim()) {
      setError("Por favor, introduce el nombre de la ensalada.");
      return;
    }

    if (numQuantity <= 0) {
      setError("La cantidad de cajas debe ser mayor a 0.");
      return;
    }

    if (totalNoblejasBoxes > numQuantity) {
      setError(`Las cajas de Noblejas (${totalNoblejasBoxes}) no pueden superar el total de la orden (${numQuantity} cajas).`);
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
      name: saladName.trim(),
      formats: [newFormat],
    };

    // Añadir a la línea seleccionada e iniciar directamente
    await addSalad(newSalad, selectedLine);

    if (activeLineCode !== "ALL" && activeLineCode !== selectedLine) {
      setActiveLineCode(selectedLine);
    }

    // Resetear formulario para entrada rápida continua
    setQuantity("");
    setNoblejasPallets("");
    setNoblejasCajas("");
    setLote("");
    setFechaCaducidad("");
    setNote("");
  };

  return (
    <div className={cn(
      "glass-card rounded-3xl p-5 sm:p-7 border shadow-xl relative overflow-hidden transition-all space-y-5",
      goldMode
        ? "bg-[#141006]/95 border-amber-500/30 text-white"
        : "bg-white/95 border-emerald-600/20 text-slate-900 shadow-emerald-950/5"
    )}>
      {/* 1. Selector de Línea Destino con Alto Contraste en Ambos Temas */}
      <div className={cn(
        "p-4 rounded-2xl border space-y-3 transition-all",
        goldMode
          ? "bg-amber-500/[0.04] border-amber-500/20"
          : "bg-emerald-50/70 border-emerald-600/20"
      )}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className={cn(
            "text-xs font-black uppercase tracking-wider flex items-center gap-2",
            goldMode ? "text-amber-300" : "text-emerald-800"
          )}>
            <Layers className={cn("w-4 h-4", goldMode ? "text-amber-400" : "text-emerald-600")} />
            <span>¿En qué línea vas a colocar este formato?</span>
          </label>
          <span className={cn("text-[11px] font-mono font-bold", goldMode ? "text-white/50" : "text-slate-600")}>
            Línea activa: <span className={goldMode ? "text-amber-400" : "text-emerald-700"}>{selectedLine}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {DEFAULT_PRODUCTION_LINES.map((line) => {
            const isSelected = selectedLine === line.code;
            return (
              <button
                key={line.code}
                type="button"
                onClick={() => {
                  setSelectedLine(line.code);
                  if (activeLineCode !== "ALL" && activeLineCode !== line.code) {
                    setActiveLineCode(line.code);
                  }
                }}
                className={cn(
                  "py-3 px-3 rounded-xl border text-center transition-all cursor-pointer font-black text-sm select-none shadow-sm",
                  isSelected
                    ? goldMode
                      ? "bg-amber-500 text-black border-amber-400 shadow-md scale-[1.02]"
                      : "bg-emerald-600 text-white border-emerald-700 shadow-md scale-[1.02]"
                    : goldMode
                    ? "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                    : "bg-white border-slate-300 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-400"
                )}
              >
                {line.name}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        {/* 2. Nombre de la Ensalada con chips rápidos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={cn("text-[11px] font-black uppercase tracking-wider", goldMode ? "text-white/70" : "text-slate-700")}>
              Ensalada
            </label>
            <span className={cn("text-[10px] font-medium", goldMode ? "text-white/40" : "text-slate-500")}>
              Toca una opción o escribe
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_SALADS.map((name) => {
              const isSelected = saladName.toLowerCase() === name.toLowerCase();
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSaladName(name)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none shadow-sm border",
                    isSelected
                      ? goldMode
                        ? "bg-amber-500 text-black border-amber-400 shadow-md scale-[1.03]"
                        : "bg-emerald-600 text-white border-emerald-700 shadow-md scale-[1.03]"
                      : goldMode
                      ? "bg-white/5 text-white/70 hover:text-white hover:bg-white/10 border-white/10"
                      : "bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 border-slate-200"
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={saladName}
            onChange={(e) => setSaladName(e.target.value)}
            placeholder="Ej: ¿Qué ensalada vamos a hacer?"
            className={cn(
              "w-full h-11 px-3.5 rounded-xl border text-sm transition-all font-medium",
              goldMode
                ? "bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-amber-400"
                : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            )}
          />
        </div>

        {/* 3. Selector de Tipo de Caja */}
        <div className="space-y-2">
          <label className={cn("text-[11px] font-black uppercase tracking-wider block", goldMode ? "text-white/70" : "text-slate-700")}>
            Tipo de Caja
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
                    "p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col justify-center items-center gap-0.5 select-none shadow-sm",
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

        {/* 4. Cantidad de Cajas Totales y Noblejas (con Capping Estricto) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Columna A: Cantidad Total de Cajas de la Orden */}
          <div className={cn(
            "space-y-2 rounded-2xl p-4 border shadow-sm",
            goldMode ? "bg-white/[0.02] border-white/5" : "bg-emerald-50/40 border-emerald-600/15"
          )}>
            <div className="flex items-center justify-between">
              <label className={cn("text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5", goldMode ? "text-white/80" : "text-slate-800")}>
                <Package className="w-3.5 h-3.5 text-emerald-600" />
                <span>Cajas Totales de la Orden</span>
              </label>
              {numQuantity > 0 && (
                <span className="text-xs font-mono font-bold text-emerald-600">
                  {Math.floor(numQuantity / boxesPerPallet)}p + {numQuantity % boxesPerPallet}c ({numQuantity} c)
                </span>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="Ej: 144"
                className={cn(
                  "flex-1 h-12 px-3 rounded-xl border text-base font-mono font-black transition-all",
                  goldMode
                    ? "bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-amber-400"
                    : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                )}
              />
              <button
                type="button"
                onClick={() => handleAddQuickQty(boxesPerPallet)}
                className={cn(
                  "h-12 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm",
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
                  "h-12 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm",
                  goldMode
                    ? "bg-white/5 hover:bg-white/10 border-white/10 text-white"
                    : "bg-white hover:bg-emerald-50 border-slate-300 text-slate-800"
                )}
              >
                +50
              </button>
            </div>
            <p className={cn("text-[10px] font-mono", goldMode ? "text-white/40" : "text-slate-500")}>
              Total requerido en fábrica para esta orden
            </p>
          </div>

          {/* Columna B: Noblejas (Limitadas por las cajas de la orden) */}
          <div className={cn(
            "space-y-2 rounded-2xl p-4 border shadow-sm",
            goldMode ? "bg-purple-500/[0.03] border-purple-500/15" : "bg-purple-50/70 border-purple-200"
          )}>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span>Noblejas (Máx: {numQuantity} cajas)</span>
              </label>
              {totalNoblejasBoxes > 0 && (
                <span className="text-xs font-mono font-bold text-purple-700">
                  {totalNoblejasBoxes}/{numQuantity} c ({numNobPallets}p + {numNobCajas}c)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className={cn("text-[9px] uppercase font-bold block", goldMode ? "text-purple-300/60" : "text-purple-700")}>
                  Palets (máx {maxNoblejasPallets})
                </span>
                <div className="flex gap-1 items-center">
                  <input
                    type="number"
                    min="0"
                    max={maxNoblejasPallets}
                    value={noblejasPallets === "" ? "" : noblejasPallets}
                    onChange={(e) => handleNoblejasPalletsChange(e.target.value)}
                    placeholder="0"
                    className={cn(
                      "w-full h-11 px-2.5 rounded-xl border text-sm font-mono font-bold transition-all",
                      goldMode
                        ? "bg-purple-500/10 border-purple-500/20 text-purple-200"
                        : "bg-white border-purple-300 text-purple-950 placeholder:text-purple-300"
                    )}
                  />
                  <button
                    type="button"
                    disabled={!canAddNobPallet}
                    onClick={() => handleAddQuickNobPallet(1)}
                    className={cn(
                      "h-11 px-2 rounded-xl border text-xs font-bold transition-all shrink-0 shadow-sm",
                      !canAddNobPallet
                        ? "opacity-30 cursor-not-allowed border-purple-300/20 bg-purple-500/5 text-purple-400"
                        : goldMode
                        ? "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-300 cursor-pointer"
                        : "bg-purple-100 hover:bg-purple-200 border-purple-300 text-purple-800 cursor-pointer"
                    )}
                    title={canAddNobPallet ? "Añadir 1 palet de Noblejas" : `No se puede añadir otro palet (límite: ${numQuantity} cajas)`}
                  >
                    +1p
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className={cn("text-[9px] uppercase font-bold block", goldMode ? "text-purple-300/60" : "text-purple-700")}>
                  Cajas Sueltas
                </span>
                <div className="flex gap-1 items-center">
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, numQuantity - numNobPallets * boxesPerPallet)}
                    value={noblejasCajas === "" ? "" : noblejasCajas}
                    onChange={(e) => handleNoblejasCajasChange(e.target.value)}
                    placeholder="0"
                    className={cn(
                      "w-full h-11 px-2.5 rounded-xl border text-sm font-mono font-bold transition-all",
                      goldMode
                        ? "bg-purple-500/10 border-purple-500/20 text-purple-200"
                        : "bg-white border-purple-300 text-purple-950 placeholder:text-purple-300"
                    )}
                  />
                  <button
                    type="button"
                    onClick={handleResetNoblejas}
                    className={cn(
                      "h-11 px-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm",
                      goldMode
                        ? "bg-white/5 hover:bg-white/10 border-white/10 text-white/40"
                        : "bg-white hover:bg-slate-100 border-slate-300 text-slate-600"
                    )}
                    title="Sin Noblejas (0)"
                  >
                    0
                  </button>
                </div>
              </div>
            </div>
            <p className={cn("text-[10px] font-mono", goldMode ? "text-purple-300/60" : "text-purple-700")}>
              Quedan {remainingMilagroBoxes} cajas para Milagro
            </p>
          </div>
        </div>

        {/* Resumen del reparto en vivo */}
        {numQuantity > 0 && (
          <div className={cn(
            "p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-2 text-xs shadow-sm",
            goldMode ? "bg-white/5 border-white/10" : "bg-emerald-50 border-emerald-600/20"
          )}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn("font-bold", goldMode ? "text-white/70" : "text-slate-800")}>
                Milagro en {selectedLine}: <span className="font-mono text-emerald-600 font-black">{calc.pallets} palets + {calc.pico} cajas ({remainingMilagroBoxes} c)</span>
              </span>
              {totalNoblejasBoxes > 0 && (
                <span className="font-bold text-purple-700">
                  Noblejas: <span className="font-mono font-black">{numNobPallets} palets + {numNobCajas} cajas ({totalNoblejasBoxes} c)</span>
                </span>
              )}
            </div>
            <span className={cn("text-[11px] font-mono", goldMode ? "text-white/40" : "text-slate-600")}>
              Total Ensaladas: {totalSalads.toLocaleString()} u
            </span>
          </div>
        )}

        {/* 5. Lote, Caducidad y Notas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="space-y-1">
            <label className={cn("text-[10px] font-bold uppercase tracking-wider block", goldMode ? "text-white/50" : "text-slate-700")}>
              Lote
            </label>
            <input
              type="text"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="Ej: L-2611A"
              className={cn(
                "w-full h-10 px-3 rounded-xl border text-xs font-mono transition-all",
                goldMode
                  ? "bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600"
              )}
            />
          </div>

          <div className="space-y-1">
            <label className={cn("text-[10px] font-bold uppercase tracking-wider block", goldMode ? "text-white/50" : "text-slate-700")}>
              Caducidad
            </label>
            <input
              type="text"
              value={fechaCaducidad}
              onChange={(e) => setFechaCaducidad(e.target.value)}
              placeholder="Ej: 24/08"
              className={cn(
                "w-full h-10 px-3 rounded-xl border text-xs transition-all",
                goldMode
                  ? "bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600"
              )}
            />
          </div>

          <div className="space-y-1">
            <label className={cn("text-[10px] font-bold uppercase tracking-wider block", goldMode ? "text-white/50" : "text-slate-700")}>
              Nota / Alerta Operario
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: Control de peso..."
              className={cn(
                "w-full h-10 px-3 rounded-xl border text-xs transition-all",
                goldMode
                  ? "bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600"
              )}
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Botón de Añadir a la Cola */}
        <button
          type="submit"
          disabled={totalNoblejasBoxes > numQuantity || numQuantity <= 0}
          className={cn(
            "w-full h-14 rounded-2xl font-black text-sm transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 shadow-xl",
            totalNoblejasBoxes > numQuantity || numQuantity <= 0
              ? "opacity-50 cursor-not-allowed bg-slate-400 text-white"
              : goldMode
              ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-black shadow-amber-500/25"
              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30"
          )}
          id="add-to-queue-submit-btn"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          <span>Añadir a la {selectedLine}</span>
        </button>
      </form>
    </div>
  );
}
