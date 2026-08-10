"use client";

import { useState, useEffect } from "react";
import { useProductionStore } from "@/store/production-store";
import { DEFAULT_BOX_TYPES, DEFAULT_PRODUCTION_LINES, generateId, calculateFormat, getSaladsPerBox } from "@/types/types";
import type { Salad } from "@/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Package, Check, AlertCircle, Sparkles, Layers } from "lucide-react";

const COMMON_SALADS = [
  "César",
  "César American",
  "Pasta y Rúcula",
  "Gourmet",
  "Pasta y Atún",
  "Japón",
  "Digestiva",
  "Wraps",
];

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

  const [saladName, setSaladName] = useState("");
  const [selectedBoxType, setSelectedBoxType] = useState(DEFAULT_BOX_TYPES[0].name);
  const [boxesPerPallet, setBoxesPerPallet] = useState(DEFAULT_BOX_TYPES[0].defaultBoxesPerPallet);
  
  // Cajas Totales de la Orden (Milagro)
  const [quantity, setQuantity] = useState("");
  
  // Noblejas: Palets y Cajas independientes
  const [noblejasPallets, setNoblejasPallets] = useState("0");
  const [noblejasCajas, setNoblejasCajas] = useState("0");

  const [lote, setLote] = useState("");
  const [cambioLote, setCambioLote] = useState(false);
  const [fechaCaducidad, setFechaCaducidad] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);

  const numQuantity = parseInt(quantity, 10) || 0;
  const numNobPallets = parseInt(noblejasPallets, 10) || 0;
  const numNobCajas = parseInt(noblejasCajas, 10) || 0;
  
  // Total Cajas de Noblejas = (Palets * Cajas por Palet) + Cajas sueltas
  const totalNoblejasBoxes = (numNobPallets * boxesPerPallet) + numNobCajas;

  const calc = calculateFormat({
    id: "temp",
    boxType: selectedBoxType,
    quantity: numQuantity,
    noblejas: totalNoblejasBoxes,
    boxesPerPallet: boxesPerPallet,
  });

  const saladsPerBox = getSaladsPerBox(selectedBoxType);
  const totalSalads = numQuantity * saladsPerBox;

  const handleSelectBoxType = (typeName: string) => {
    setSelectedBoxType(typeName);
    const match = DEFAULT_BOX_TYPES.find((b) => b.name === typeName);
    if (match) {
      setBoxesPerPallet(match.defaultBoxesPerPallet);
    }
  };

  const handleAddQuickQty = (delta: number) => {
    const next = Math.max(0, numQuantity + delta);
    setQuantity(String(next));
  };

  const handleAddQuickNobPallet = (delta: number) => {
    const next = Math.max(0, numNobPallets + delta);
    setNoblejasPallets(String(next));
  };

  const handleAddQuickNobCajas = (delta: number) => {
    const next = Math.max(0, numNobCajas + delta);
    setNoblejasCajas(String(next));
  };

  const handleResetNoblejas = () => {
    setNoblejasPallets("0");
    setNoblejasCajas("0");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = saladName.trim();
    if (!trimmedName) {
      setError("Debes indicar o seleccionar el nombre de la ensalada.");
      return;
    }

    if (numQuantity <= 0) {
      setError("La cantidad de cajas debe ser mayor que 0.");
      return;
    }

    if (totalNoblejasBoxes > numQuantity) {
      setError("Las cajas de Noblejas no pueden ser mayores que el total de cajas de la orden.");
      return;
    }

    const newFormatId = generateId();
    const newSalad: Salad = {
      id: generateId(),
      name: trimmedName,
      formats: [
        {
          id: newFormatId,
          boxType: selectedBoxType,
          quantity: numQuantity,
          noblejas: totalNoblejasBoxes,
          boxesPerPallet: boxesPerPallet,
          lote: lote.trim() || undefined,
          cambioLote: cambioLote,
          fechaCaducidad: fechaCaducidad.trim() || undefined,
          note: note.trim() || undefined,
          linea: selectedLine,
        },
      ],
    };

    await addSalad(newSalad, selectedLine);
    if (activeLineCode !== "ALL" && activeLineCode !== selectedLine) {
      await setActiveLineCode(selectedLine);
    }

    // Resetear formulario para entrada rápida continua
    setQuantity("");
    setNoblejasPallets("0");
    setNoblejasCajas("0");
    setLote("");
    setCambioLote(false);
    setFechaCaducidad("");
    setNote("");
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 1400);
  };

  return (
    <div className={cn(
      "glass-card rounded-3xl p-4 sm:p-6 border transition-all shadow-xl space-y-4 sm:space-y-5",
      goldMode ? "border-amber-500/30 bg-[#141006]/90" : "border-white/10 bg-black/50"
    )}>
      {/* 1. Selector de Línea de Producción Destino */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>¿En qué Línea vas a colocar este formato?</span>
          </label>
          <span className="text-[10px] text-white/40 font-mono">
            Línea activa: {selectedLine}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                  "py-2.5 px-3 rounded-xl border text-center transition-all cursor-pointer font-black text-xs select-none",
                  isSelected
                    ? goldMode
                      ? "bg-amber-500 text-black border-amber-400 shadow-md scale-[1.02]"
                      : "bg-emerald-500 text-white border-emerald-400 shadow-md scale-[1.02]"
                    : "bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10"
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
            <label className="text-[11px] font-black text-white/60 uppercase tracking-wider">
              Ensalada
            </label>
            <span className="text-[10px] text-white/40 font-medium">Toca una opción o escribe</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {COMMON_SALADS.map((name) => {
              const isSelected = saladName.toLowerCase() === name.toLowerCase();
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSaladName(name)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer select-none",
                    isSelected
                      ? goldMode
                        ? "bg-amber-500 text-black shadow-md scale-[1.03]"
                        : "bg-emerald-500 text-white shadow-md scale-[1.03]"
                      : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10 border border-white/5"
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
            placeholder="O escribe otro nombre (ej. Gourmet Promo, Mezclum 200g)..."
            className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-emerald-500 transition-all font-medium"
          />
        </div>

        {/* 3. Selector de Tipo de Caja */}
        <div className="space-y-2">
          <label className="text-[11px] font-black text-white/60 uppercase tracking-wider block">
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
                    "p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col justify-center items-center gap-0.5 select-none",
                    isSelected
                      ? goldMode
                        ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-md font-black ring-1 ring-amber-500/30"
                        : "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md font-black ring-1 ring-emerald-500/30"
                      : "bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span className="text-xs font-bold">{b.name}</span>
                  <span className="text-[10px] text-white/40 font-mono">{b.defaultBoxesPerPallet} c/palet</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Cantidad de Cajas Totales y Noblejas (Responsive 2 Columnas) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Columna A: Cantidad Total de Cajas (Solo Cajas para Milagro) */}
          <div className="space-y-2 bg-white/[0.02] border border-white/5 rounded-2xl p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cajas Totales de la Orden</span>
              </label>
              {numQuantity > 0 && (
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {calc.pallets}p + {calc.pico}c
                </span>
              )}
            </div>

            <div className="flex gap-1.5 items-center">
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ej: 144"
                className="flex-1 h-12 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-base font-mono font-black placeholder:text-white/30 focus:outline-none focus:border-emerald-500 transition-all"
              />
              <button
                type="button"
                onClick={() => handleAddQuickQty(boxesPerPallet)}
                className="h-12 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold transition-all cursor-pointer shrink-0"
                title={`Añadir 1 palet completo (${boxesPerPallet} cajas)`}
              >
                +1 Palet
              </button>
              <button
                type="button"
                onClick={() => handleAddQuickQty(50)}
                className="h-12 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-bold transition-all cursor-pointer shrink-0"
              >
                +50
              </button>
            </div>
          </div>

          {/* Columna B: Noblejas (Palets + Cajas Independientes) */}
          <div className="space-y-2 bg-purple-500/[0.03] border border-purple-500/15 rounded-2xl p-3.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span>Noblejas (Palets y Cajas)</span>
              </label>
              {totalNoblejasBoxes > 0 && (
                <span className="text-xs font-mono font-bold text-purple-300">
                  = {totalNoblejasBoxes} cajas ({numNobPallets}p + {numNobCajas}c)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold text-purple-300/60 block">Palets</span>
                <div className="flex gap-1 items-center">
                  <input
                    type="number"
                    min="0"
                    value={noblejasPallets}
                    onChange={(e) => setNoblejasPallets(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 px-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-200 text-sm font-mono font-bold focus:outline-none focus:border-purple-400 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddQuickNobPallet(1)}
                    className="h-11 px-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold transition-all cursor-pointer shrink-0"
                    title="Añadir 1 palet de Noblejas"
                  >
                    +1p
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] uppercase font-bold text-purple-300/60 block">Cajas Sueltas</span>
                <div className="flex gap-1 items-center">
                  <input
                    type="number"
                    min="0"
                    value={noblejasCajas}
                    onChange={(e) => setNoblejasCajas(e.target.value)}
                    placeholder="0"
                    className="w-full h-11 px-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-200 text-sm font-mono font-bold focus:outline-none focus:border-purple-400 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleResetNoblejas}
                    className="h-11 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white text-xs font-bold transition-all cursor-pointer shrink-0"
                    title="Sin Noblejas (0)"
                  >
                    0
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resumen del cálculo en vivo */}
        {numQuantity > 0 && (
          <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-white/70">
                Milagro en {selectedLine}: <span className="font-mono text-emerald-400 font-black">{calc.pallets} palets + {calc.pico} cajas</span>
              </span>
              {totalNoblejasBoxes > 0 && (
                <span className="font-bold text-purple-300">
                  Noblejas: <span className="font-mono font-black">{numNobPallets} palets + {numNobCajas} cajas ({totalNoblejasBoxes} c)</span>
                </span>
              )}
            </div>
            <span className="text-[11px] text-white/40 font-mono">
              Total Ensaladas: {totalSalads.toLocaleString()} u
            </span>
          </div>
        )}

        {/* 5. Lote, Caducidad y Notas (Línea compacta responsive) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
              Lote
            </label>
            <input
              type="text"
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="Ej: L-2611A"
              className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
              Caducidad
            </label>
            <input
              type="text"
              value={fechaCaducidad}
              onChange={(e) => setFechaCaducidad(e.target.value)}
              placeholder="Ej: 24/08"
              className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">
              Nota / Alerta Operario
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: Control de peso..."
              className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Botón de Añadir a la Cola */}
        <Button
          type="submit"
          className={cn(
            "w-full h-14 text-base font-black rounded-2xl shadow-xl transition-all active:scale-[0.99] cursor-pointer",
            goldMode
              ? "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black shadow-amber-500/20"
              : "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-500/20"
          )}
        >
          <Plus className="w-5 h-5 mr-1.5" />
          <span>Añadir a la {selectedLine}</span>
        </Button>
      </form>
    </div>
  );
}
