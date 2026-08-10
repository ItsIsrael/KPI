"use client";

import { useState } from "react";
import { useProductionStore } from "@/store/production-store";
import { DEFAULT_BOX_TYPES } from "@/types/types";
import { cn } from "@/lib/utils";

function calcNoblejasCajas(pallets: string, cajas: string, boxesPerPallet: string): number {
  const p = parseInt(pallets, 10) || 0;
  const c = parseInt(cajas, 10) || 0;
  const bpp = parseInt(boxesPerPallet, 10) || 1;
  return p * bpp + c;
}

export function EditQueueItemDialog() {
  const {
    queue,
    editingQueueItemId,
    setEditingQueueItemId,
    updateQueueItem,
    goldMode,
  } = useProductionStore();

  const item = queue.find((q) => q.id === editingQueueItemId);

  // States
  const [saladName, setSaladName] = useState("");
  const [boxType, setBoxType] = useState("");
  const [quantity, setQuantity] = useState("");
  const [noblejasPallets, setNoblejasPallets] = useState("");
  const [noblejasCajas, setNoblejasCajas] = useState("");
  const [boxesPerPallet, setBoxesPerPallet] = useState("");
  const [note, setNote] = useState("");
  const [lote, setLote] = useState("");
  const [cambioLote, setCambioLote] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Sincronizar estado durante renderizado si cambia de item (React 19)
  const [prevItemId, setPrevItemId] = useState<string | null>(null);

  if (item && item.id !== prevItemId) {
    setPrevItemId(item.id);
    const nobPallets = Math.floor(item.noblejas / item.boxesPerPallet);
    const nobCajas = item.noblejas % item.boxesPerPallet;

    setSaladName(item.saladName);
    setBoxType(item.boxType);
    setQuantity(String(item.quantity));
    setNoblejasPallets(nobPallets > 0 ? String(nobPallets) : "");
    setNoblejasCajas(nobCajas > 0 ? String(nobCajas) : "");
    setBoxesPerPallet(String(item.boxesPerPallet));
    setNote(item.note ?? "");
    setLote(item.lote ?? "");
    setCambioLote(item.cambioLote ?? false);
    setErrors([]);
  }

  if (!item) return null;

  const handleBoxTypeChange = (newVal: string) => {
    setBoxType(newVal);
    const boxOption = DEFAULT_BOX_TYPES.find((bt) => bt.name === newVal);
    if (boxOption) {
      setBoxesPerPallet(String(boxOption.defaultBoxesPerPallet));
    }
  };

  const handleSave = () => {
    const newErrors: string[] = [];

    if (!saladName.trim()) {
      newErrors.push("El nombre de la ensalada es obligatorio");
    }

    const qty = parseInt(quantity, 10);
    const bpp = parseInt(boxesPerPallet, 10);
    const nobTotal = calcNoblejasCajas(noblejasPallets, noblejasCajas, boxesPerPallet);

    if (isNaN(qty) || qty <= 0) {
      newErrors.push("La cantidad total de cajas debe ser mayor que 0");
    }
    if (isNaN(bpp) || bpp <= 0) {
      newErrors.push("Las cajas por pallet deben ser mayor que 0");
    }
    if (nobTotal > qty) {
      newErrors.push(`La cantidad de noblejas (${nobTotal}) no puede ser mayor que las cajas totales (${qty})`);
    }
    if (nobTotal < 0) {
      newErrors.push("La cantidad de noblejas no puede ser negativa");
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    if (cambioLote && !lote.trim()) {
      setErrors(["Debe introducir un código de lote válido si activa cambio de lote."]);
      return;
    }

    updateQueueItem(item.id, {
      saladName: saladName.trim().toUpperCase(),
      boxType,
      quantity: qty,
      noblejas: nobTotal,
      boxesPerPallet: bpp,
      note: note.trim(),
      lote: cambioLote ? lote.trim() : undefined,
      cambioLote,
    });

    setEditingQueueItemId(null);
  };

  const handleClose = () => {
    setEditingQueueItemId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (!form) return;

      const focusables = Array.from(
        form.querySelectorAll('input:not([disabled]), select:not([disabled]), button#save-salad-btn')
      ) as HTMLElement[];

      const index = focusables.indexOf(e.currentTarget);
      if (index > -1 && index < focusables.length - 1) {
        focusables[index + 1].focus();
      }
    }
  };

  const nobTotal = calcNoblejasCajas(noblejasPallets, noblejasCajas, boxesPerPallet);
  const hasNoblejasInput = (parseInt(noblejasPallets, 10) || 0) > 0 || (parseInt(noblejasCajas, 10) || 0) > 0;
  const bppNum = parseInt(boxesPerPallet, 10) || 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "backdrop-blur-2xl border rounded-3xl p-6 md:p-8 w-full max-w-lg my-auto shadow-2xl space-y-4 animate-slide-up",
          goldMode ? "bg-[#12121e]/90 border-white/15" : "bg-white/95 border-emerald-500/30 text-slate-900 shadow-emerald-950/10"
        )}
      >
        <div className={cn("flex items-center justify-between border-b pb-3", goldMode ? "border-white/5" : "border-slate-200")}>
          <h2 className={cn("text-xl font-black", goldMode ? "text-white" : "text-slate-900")}>
            ✏️ Editar Formato de Cola
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className={cn("text-lg font-bold", goldMode ? "text-white/40 hover:text-white" : "text-slate-400 hover:text-slate-800")}
          >
            ✕
          </button>
        </div>

        {/* Errores */}
        {errors.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-red-400 text-sm">⚠ {err}</p>
            ))}
          </div>
        )}

        {/* Ensalada */}
        <div className="space-y-1.5">
          <label className={cn("text-xs uppercase tracking-wider font-semibold", goldMode ? "text-white/40" : "text-slate-600")}>🥗 Ensalada</label>
          <input
            value={saladName}
            onChange={(e) => setSaladName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: CÉSAR, MEDITERRÁNEA..."
            className={cn(
              "w-full h-12 px-3 text-lg font-bold uppercase border rounded-xl focus:outline-none",
              goldMode
                ? "bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500/50"
                : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30"
            )}
          />
        </div>

        {/* Tipo de caja */}
        <div className="space-y-1.5">
          <label className={cn("text-xs uppercase tracking-wider font-semibold", goldMode ? "text-white/40" : "text-slate-600")}>📦 Tipo de caja</label>
          <select
            value={boxType}
            onChange={(e) => handleBoxTypeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full h-12 px-3 border rounded-xl text-base focus:outline-none cursor-pointer",
              goldMode
                ? "bg-white/5 border-white/10 text-white focus:border-emerald-500/50"
                : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
            )}
          >
            {DEFAULT_BOX_TYPES.map((bt) => (
              <option key={bt.id} value={bt.name} className={cn(goldMode ? "bg-[#1a1a2e] text-white" : "bg-white text-slate-900")}>
                {bt.name}
              </option>
            ))}
          </select>
        </div>

        {/* Cajas totales */}
        <div className="space-y-1.5">
          <label className={cn("text-xs uppercase tracking-wider font-semibold", goldMode ? "text-white/40" : "text-slate-600")}>Cajas totales</label>
          <input
            type="number"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="290"
            className={cn(
              "w-full h-12 px-3 text-lg font-bold border rounded-xl focus:outline-none",
              goldMode
                ? "bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500/50"
                : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600"
            )}
          />
        </div>

        {/* Nota rápida - Solo en Modo Gold */}
        {goldMode && (
          <div className="space-y-1.5">
            <label className="text-xs text-white/40 uppercase tracking-wider font-semibold">Alerta</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ej: Controlar peso, Etiqueta especial, etc."
              className="w-full h-12 px-3 text-base bg-white/5 border border-white/10 text-white placeholder:text-white/20 rounded-xl focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        )}

        {/* Lote */}
        <div className={cn("space-y-3 pt-2 border-t", goldMode ? "border-white/5" : "border-slate-200")}>
          <div className="flex items-center justify-between">
            <label className={cn("flex items-center gap-2 cursor-pointer select-none text-xs font-semibold", goldMode ? "text-white/70" : "text-slate-800")}>
              <input
                type="checkbox"
                checked={cambioLote}
                onChange={(e) => setCambioLote(e.target.checked)}
                className="rounded border-slate-300 bg-white text-emerald-600 focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer"
              />
              <span>🔄 Cambio de Lote</span>
            </label>
          </div>

          {cambioLote && (
            <div className="space-y-1.5 animate-slide-down">
              <label className={cn("text-[10px] uppercase tracking-wider font-bold", goldMode ? "text-white/40" : "text-slate-500")}>Código del nuevo lote</label>
              <input
                type="text"
                value={lote}
                onChange={(e) => setLote(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ej: L-2611A"
                className={cn(
                  "w-full h-11 px-3 text-base border rounded-xl focus:outline-none",
                  goldMode
                    ? "bg-white/5 border-white/10 text-white placeholder:text-white/20"
                    : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400"
                )}
              />
            </div>
          )}
        </div>

        {/* Noblejas */}
        <div className="space-y-2">
          <label className="text-xs text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1.5 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Noblejas
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-purple-600/70 dark:text-purple-300/40 uppercase tracking-wider font-bold">Palets</label>
              <input
                type="number"
                inputMode="numeric"
                value={noblejasPallets}
                onChange={(e) => setNoblejasPallets(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="0"
                min="0"
                className={cn(
                  "w-full h-12 px-3 text-lg font-bold border rounded-xl focus:outline-none",
                  goldMode
                    ? "bg-purple-500/5 border-purple-500/15 text-purple-300 placeholder:text-purple-300/20 focus:border-purple-500/40"
                    : "bg-purple-50 border-purple-200 text-purple-900 placeholder:text-purple-400 focus:border-purple-600"
                )}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-purple-600/70 dark:text-purple-300/40 uppercase tracking-wider font-bold">Cajas extra</label>
              <input
                type="number"
                inputMode="numeric"
                value={noblejasCajas}
                onChange={(e) => setNoblejasCajas(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="0"
                min="0"
                className={cn(
                  "w-full h-12 px-3 text-lg font-bold border rounded-xl focus:outline-none",
                  goldMode
                    ? "bg-purple-500/5 border-purple-500/15 text-purple-300 placeholder:text-purple-300/20 focus:border-purple-500/40"
                    : "bg-purple-50 border-purple-200 text-purple-900 placeholder:text-purple-400 focus:border-purple-600"
                )}
              />
            </div>
          </div>

          {/* Resumen calculado */}
          {hasNoblejasInput && (
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl">
              <span className="text-purple-600 dark:text-purple-300 text-xs font-bold">= {nobTotal} cajas</span>
              <span className="text-purple-500/80 text-[10px] font-mono">
                {(parseInt(noblejasPallets, 10) || 0) > 0 ? `${parseInt(noblejasPallets, 10) || 0} × ${bppNum}` : ""}
                {(parseInt(noblejasPallets, 10) || 0) > 0 && (parseInt(noblejasCajas, 10) || 0) > 0 ? " + " : ""}
                {(parseInt(noblejasCajas, 10) || 0) > 0 ? `${parseInt(noblejasCajas, 10) || 0}` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Avanzado / Cajas por palet */}
        <details className={cn("group border-t pt-2", goldMode ? "border-white/5" : "border-slate-200")}>
          <summary className={cn("text-xs cursor-pointer select-none transition-colors list-none flex items-center gap-1.5 font-medium", goldMode ? "text-white/40 hover:text-white/60" : "text-slate-500 hover:text-slate-800")}>
            <span className="transition-transform duration-200 group-open:rotate-90 text-[9px]">▶</span>
            <span>Avanzado — {boxesPerPallet} cajas/pallet</span>
          </summary>
          <div className="mt-2.5 space-y-1.5">
            <label className={cn("text-xs", goldMode ? "text-white/40" : "text-slate-600")}>Cajas por pallet</label>
            <input
              type="number"
              inputMode="numeric"
              value={boxesPerPallet}
              onChange={(e) => setBoxesPerPallet(e.target.value)}
              onKeyDown={handleKeyDown}
              className={cn(
                "w-full h-11 px-3 text-base font-bold border rounded-xl focus:outline-none",
                goldMode
                  ? "bg-white/5 border-white/10 text-white"
                  : "bg-white border-slate-300 text-slate-900"
              )}
            />
          </div>
        </details>

        {/* Botones de acción */}
        <div className={cn("flex gap-3 pt-3 border-t", goldMode ? "border-white/5" : "border-slate-200")}>
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              "flex-1 h-12 text-sm font-semibold border rounded-xl transition-all active:scale-95 cursor-pointer",
              goldMode
                ? "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
            )}
          >
            Cancelar
          </button>
          <button
            type="submit"
            id="save-salad-btn"
            className={cn(
              "flex-1 h-12 text-sm font-bold text-white rounded-xl transition-all active:scale-[0.95] cursor-pointer",
              goldMode
                ? "bg-emerald-500 hover:bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
            )}
          >
            ✔ Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
