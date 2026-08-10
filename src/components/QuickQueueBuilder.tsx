"use client";

import { useState } from "react";
import { useProductionStore } from "@/store/production-store";
import { DEFAULT_BOX_TYPES, generateId, calculateFormat, getSaladsPerBox } from "@/types/types";
import type { Salad, QueueItem } from "@/types/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Package, Layers, Sparkles, ChevronDown, ChevronUp, AlertCircle, Check } from "lucide-react";

const COMMON_SALADS = [
  "César",
  "Rúcula",
  "Mezclum",
  "Primavera",
  "Pasta",
  "Tiernos",
  "Gourmet",
  "Escarola",
  "Brotes Tiernos",
];

interface QuickQueueBuilderProps {
  goldMode?: boolean;
}

export function QuickQueueBuilder({ goldMode = false }: QuickQueueBuilderProps) {
  const { addSalad } = useProductionStore();

  const [saladName, setSaladName] = useState("");
  const [selectedBoxType, setSelectedBoxType] = useState(DEFAULT_BOX_TYPES[0].name);
  const [boxesPerPallet, setBoxesPerPallet] = useState(DEFAULT_BOX_TYPES[0].defaultBoxesPerPallet);
  const [quantity, setQuantity] = useState("");
  const [noblejas, setNoblejas] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lote, setLote] = useState("");
  const [cambioLote, setCambioLote] = useState(false);
  const [fechaCaducidad, setFechaCaducidad] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);

  const numQuantity = parseInt(quantity, 10) || 0;
  const numNoblejas = parseInt(noblejas, 10) || 0;

  const calc = calculateFormat({
    id: "temp",
    boxType: selectedBoxType,
    quantity: numQuantity,
    noblejas: numNoblejas,
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

  const handleSubmit = (e: React.FormEvent) => {
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

    if (numNoblejas > numQuantity) {
      setError("Las cajas de Noblejas no pueden ser mayores que el total de cajas.");
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
          noblejas: numNoblejas,
          boxesPerPallet: boxesPerPallet,
          lote: lote.trim() || undefined,
          cambioLote: cambioLote,
          fechaCaducidad: fechaCaducidad.trim() || undefined,
          note: note.trim() || undefined,
        },
      ],
    };

    addSalad(newSalad);

    // Resetear formulario para siguiente entrada rápida
    setQuantity("");
    setNoblejas("");
    setLote("");
    setCambioLote(false);
    setNote("");
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 1200);
  };

  return (
    <div className={cn(
      "glass-card rounded-2xl p-4 sm:p-5 border transition-all shadow-xl space-y-4",
      goldMode ? "border-amber-500/25 bg-[#141006]/80" : "border-white/10 bg-black/40"
    )}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Añadir Orden Rápida a la Cola</span>
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            Selecciona la ensalada, el tipo de caja y la cantidad de cajas deseadas
          </p>
        </div>

        {successFlash && (
          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl animate-fade-in flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            <span>Añadido a la Cola</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 1. Nombre de Ensalada (Chips Rápidos + Input) */}
        <div className="space-y-2">
          <label className="text-[11px] font-black text-white/60 uppercase tracking-wider block">
            1. Nombre de la Ensalada
          </label>

          {/* Chips rápidos de ensaladas frecuentes */}
          <div className="flex flex-wrap gap-1.5">
            {COMMON_SALADS.map((name) => {
              const isSelected = saladName.toLowerCase() === name.toLowerCase();
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSaladName(name)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    isSelected
                      ? goldMode ? "bg-amber-500 text-black shadow-sm" : "bg-emerald-500 text-white shadow-sm"
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
            placeholder="O escribe otro nombre de ensalada..."
            className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>

        {/* 2. Tipo de Caja */}
        <div className="space-y-2">
          <label className="text-[11px] font-black text-white/60 uppercase tracking-wider block">
            2. Tipo de Caja
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
                    "p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col justify-center items-center gap-0.5",
                    isSelected
                      ? goldMode
                        ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10 font-black"
                        : "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10 font-black"
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

        {/* 3. Cantidad de Cajas & Botones Rápidos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-black text-white/60 uppercase tracking-wider">
              3. Cantidad Total de Cajas
            </label>
            {numQuantity > 0 && (
              <span className="text-xs font-mono font-bold text-emerald-400">
                {calc.pallets} palets + {calc.pico} cajas pico ({totalSalads} unidades)
              </span>
            )}
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ej: 144"
              className="flex-1 h-12 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-base font-mono font-black placeholder:text-white/30 focus:outline-none focus:border-emerald-500 transition-all"
            />
            <button
              type="button"
              onClick={() => handleAddQuickQty(boxesPerPallet)}
              className="h-12 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
              title="Añadir 1 palet completo"
            >
              +1 Palet ({boxesPerPallet})
            </button>
            <button
              type="button"
              onClick={() => handleAddQuickQty(50)}
              className="h-12 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
            >
              +50
            </button>
            <button
              type="button"
              onClick={() => handleAddQuickQty(100)}
              className="h-12 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
            >
              +100
            </button>
          </div>
        </div>

        {/* 4. Opciones Avanzadas Colapsables (Noblejas, Lote, Notas) */}
        <div className="border-t border-white/5 pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors cursor-pointer font-semibold py-1"
          >
            <span>{showAdvanced ? "Ocultar opciones avanzadas (Noblejas / Lote)" : "Mostrar opciones avanzadas (Noblejas / Lote / Fecha)"}</span>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 animate-slide-down">
              {/* Noblejas */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">
                  Cajas Noblejas (Opcional)
                </label>
                <input
                  type="number"
                  min="0"
                  value={noblejas}
                  onChange={(e) => setNoblejas(e.target.value)}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-purple-200 text-sm font-mono focus:outline-none focus:border-purple-500 transition-all"
                />
              </div>

              {/* Lote */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                  Código de Lote
                </label>
                <input
                  type="text"
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                  placeholder="Ej: B13 K01"
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-emerald-500 transition-all"
                />
              </div>

              {/* Fecha Caducidad */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider block">
                  Fecha Caducidad
                </label>
                <input
                  type="text"
                  value={fechaCaducidad}
                  onChange={(e) => setFechaCaducidad(e.target.value)}
                  placeholder="Ej: 24/08"
                  className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-emerald-500 transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Botón Principal de Envío */}
        <Button
          type="submit"
          className={cn(
            "w-full h-13 text-base font-black rounded-xl shadow-lg transition-all active:scale-[0.99] cursor-pointer",
            goldMode
              ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black shadow-amber-500/20"
              : "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-500/20"
          )}
        >
          <Plus className="w-5 h-5 mr-1" />
          <span>Añadir a la Cola de Producción</span>
        </Button>
      </form>
    </div>
  );
}
