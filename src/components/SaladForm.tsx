"use client";

import { useState, useMemo } from "react";
import { useProductionStore } from "@/store/production-store";
import type { Format, Salad } from "@/types/types";
import { DEFAULT_BOX_TYPES, generateId } from "@/types/types";
import { cn } from "@/lib/utils";

interface SaladFormProps {
  editingSalad?: Salad | null;
  formMode?: "standard" | "add-format" | "add-salad";
  currentSaladInfo?: { id: string; name: string };
  onClose: () => void;
}

interface FormatDraft {
  id: string;
  boxType: string;
  quantity: string;
  // Noblejas desglosados: palets + cajas extra
  nobjelasPallets: string;
  nobjelasCajas: string;
  boxesPerPallet: string;
  lote: string;
  cambioLote: boolean;
  note: string;
}

function createEmptyFormat(): FormatDraft {
  return {
    id: generateId(),
    boxType: DEFAULT_BOX_TYPES[0].name,
    quantity: "",
    nobjelasPallets: "",
    nobjelasCajas: "",
    boxesPerPallet: String(DEFAULT_BOX_TYPES[0].defaultBoxesPerPallet),
    lote: "",
    cambioLote: false,
    note: "",
  };
}

/** Calcula el total de cajas de noblejas a partir de palets + cajas extra */
function calcNoblejasCajas(pallets: string, cajas: string, boxesPerPallet: string): number {
  const p = parseInt(pallets, 10) || 0;
  const c = parseInt(cajas, 10) || 0;
  const bpp = parseInt(boxesPerPallet, 10) || 1;
  return p * bpp + c;
}

export function SaladForm({ editingSalad, formMode = "standard", currentSaladInfo, onClose }: SaladFormProps) {
  const { addSalad, updateSalad, goldMode } = useProductionStore();

  const [name, setName] = useState(() => {
    if (formMode === "add-format" && currentSaladInfo) {
      return currentSaladInfo.name;
    }
    return editingSalad?.name ?? "";
  });
  const [formats, setFormats] = useState<FormatDraft[]>(() => {
    if (editingSalad) {
      return editingSalad.formats.map((f) => {
        // Descomponer noblejas en palets + cajas extra
        const nobPallets = Math.floor(f.noblejas / f.boxesPerPallet);
        const nobCajas = f.noblejas % f.boxesPerPallet;
        return {
          id: f.id,
          boxType: f.boxType,
          quantity: String(f.quantity),
          nobjelasPallets: nobPallets > 0 ? String(nobPallets) : "",
          nobjelasCajas: nobCajas > 0 ? String(nobCajas) : "",
          boxesPerPallet: String(f.boxesPerPallet),
          lote: f.lote ?? "",
          cambioLote: f.cambioLote ?? false,
          note: f.note ?? "",
        };
      });
    }
    return [createEmptyFormat()];
  });

  const [expandedFormatId, setExpandedFormatId] = useState<string>(() => {
    if (editingSalad && editingSalad.formats.length > 0) {
      return editingSalad.formats[0].id;
    }
    return formats[0]?.id || "";
  });

  const [errors, setErrors] = useState<string[]>([]);

  const addFormat = () => {
    const newFormat = createEmptyFormat();
    setFormats((prev) => [...prev, newFormat]);
    setExpandedFormatId(newFormat.id);
  };

  const removeFormat = (index: number, formatId: string) => {
    if (formats.length <= 1) return;
    setFormats((prev) => {
      const remaining = prev.filter((_, i) => i !== index);
      // Si el formato que borramos era el expandido, expandir el primero disponible
      if (formatId === expandedFormatId && remaining.length > 0) {
        setExpandedFormatId(remaining[0].id);
      }
      return remaining;
    });
  };

  const moveFormatUp = (index: number) => {
    if (index <= 0) return;
    setFormats((prev) => {
      const nextList = [...prev];
      const temp = nextList[index];
      nextList[index] = nextList[index - 1];
      nextList[index - 1] = temp;
      return nextList;
    });
  };

  const moveFormatDown = (index: number) => {
    if (index >= formats.length - 1) return;
    setFormats((prev) => {
      const nextList = [...prev];
      const temp = nextList[index];
      nextList[index] = nextList[index + 1];
      nextList[index + 1] = temp;
      return nextList;
    });
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
      if (index > -1) {
        if (index === focusables.length - 2 || focusables[index + 1]?.id === "save-salad-btn") {
          // Si es el último input, guardar/aceptar directamente
          handleSave();
        } else if (index < focusables.length - 1) {
          focusables[index + 1].focus();
        }
      }
    }
  };

  const updateFormat = (index: number, field: keyof FormatDraft, value: string | boolean) => {
    setFormats((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f;
        const updated = { ...f, [field]: value };
        if (field === "boxType" && typeof value === "string") {
          const boxType = DEFAULT_BOX_TYPES.find((bt) => bt.name === value);
          if (boxType) {
            updated.boxesPerPallet = String(boxType.defaultBoxesPerPallet);
          }
        }
        return updated;
      })
    );
  };

  const handleSave = () => {
    const newErrors: string[] = [];

    if (!name.trim()) {
      newErrors.push("El nombre de la ensalada es obligatorio");
    }

    const parsedFormats: Format[] = [];

    for (let i = 0; i < formats.length; i++) {
      const f = formats[i];
      const qty = parseInt(f.quantity, 10);
      const bpp = parseInt(f.boxesPerPallet, 10);
      const nobTotal = calcNoblejasCajas(f.nobjelasPallets, f.nobjelasCajas, f.boxesPerPallet);

      if (isNaN(qty) || qty <= 0) {
        newErrors.push(`Formato ${i + 1}: la cantidad debe ser > 0`);
      }
      if (isNaN(bpp) || bpp <= 0) {
        newErrors.push(`Formato ${i + 1}: cajas por pallet debe ser > 0`);
      }
      if (nobTotal > qty) {
        newErrors.push(`Formato ${i + 1}: la cantidad de noblejas (${nobTotal}) no puede ser mayor que las cajas totales (${qty})`);
      }
      if (nobTotal < 0) {
        newErrors.push(`Formato ${i + 1}: la cantidad de noblejas no puede ser negativa`);
      }
      if (f.cambioLote && !f.lote.trim()) {
        newErrors.push(`Formato ${i + 1}: ha seleccionado cambio de lote pero no ha introducido el código`);
      }

      parsedFormats.push({
        id: f.id,
        boxType: f.boxType,
        quantity: isNaN(qty) ? 0 : qty,
        noblejas: nobTotal,
        boxesPerPallet: isNaN(bpp) ? 1 : bpp,
        lote: f.cambioLote ? f.lote.trim() : undefined,
        cambioLote: f.cambioLote,
        note: f.note.trim() || undefined,
      });
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    if (formMode === "add-format" || formMode === "add-salad") {
      const saladId = formMode === "add-format" ? (currentSaladInfo?.id ?? generateId()) : generateId();
      const saladName = name.trim().toUpperCase();

      const newQueueItems = parsedFormats.map((f) => ({
        id: generateId(),
        saladId,
        saladName,
        formatId: f.id,
        boxType: f.boxType,
        quantity: f.quantity,
        noblejas: f.noblejas,
        boxesPerPallet: f.boxesPerPallet,
        lote: f.lote,
        cambioLote: f.cambioLote,
      }));

      useProductionStore.setState((state) => ({
        queue: [...state.queue, ...newQueueItems],
      }));
    } else if (editingSalad) {
      updateSalad(editingSalad.id, {
        name: name.trim().toUpperCase(),
        formats: parsedFormats,
      });
    } else {
      const salad: Salad = {
        id: generateId(),
        name: name.trim().toUpperCase(),
        formats: parsedFormats,
      };
      addSalad(salad);
    }

    onClose();
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); handleSave(); }}
      className="flex flex-col animate-slide-up"
      style={{ maxHeight: "72vh" }}
    >
      {/* Errores */}
      {errors.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-1 mb-4 shrink-0">
          {errors.map((err, i) => (
            <p key={i} className="text-red-400 text-sm">⚠ {err}</p>
          ))}
        </div>
      )}

      {/* Nombre — fijo arriba */}
      {formMode === "add-format" ? (
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3.5 mb-4 shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-purple-400 font-extrabold uppercase tracking-wider">Ensalada Activa:</span>
          <span className={cn("text-base font-black", goldMode ? "text-white" : "text-slate-900")}>{name}</span>
        </div>
      ) : (
        <div className="space-y-2 mb-4 shrink-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ej: CÉSAR, MEDITERRÁNEA..."
            className={cn(
              "w-full h-14 px-4 text-xl font-bold uppercase border rounded-xl focus:outline-none",
              goldMode
                ? "bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500/50"
                : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30"
            )}
            id="salad-name-input"
          />
        </div>
      )}

      {/* Header formatos — fijo */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <label className={cn("text-sm font-semibold uppercase tracking-wider", goldMode ? "text-white/60" : "text-slate-700")}>
          📦 Formatos ({formats.length})
        </label>
        <button
          type="button"
          onClick={addFormat}
          className="h-9 px-4 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all active:scale-95 cursor-pointer shadow-sm"
          id="add-format-btn"
        >
          + Añadir
        </button>
      </div>

      {/* Lista formatos — scrollable */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 min-h-0">
        {formats.map((format, index) => {
          const nobTotal = calcNoblejasCajas(format.nobjelasPallets, format.nobjelasCajas, format.boxesPerPallet);
          const nobPallets = parseInt(format.nobjelasPallets, 10) || 0;
          const nobCajas = parseInt(format.nobjelasCajas, 10) || 0;
          const bpp = parseInt(format.boxesPerPallet, 10) || 1;
          const hasNoblejasInput = nobPallets > 0 || nobCajas > 0;
          const isExpanded = format.id === expandedFormatId;

          return (
            <div
              key={format.id}
              className={cn(
                "border rounded-2xl p-4 transition-all duration-200",
                goldMode
                  ? isExpanded ? "bg-white/[0.03] border-emerald-500/30 space-y-3" : "bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.04] cursor-pointer"
                  : isExpanded ? "bg-emerald-50/40 border-emerald-500/30 space-y-3 shadow-sm" : "bg-slate-50/80 border-slate-200 hover:border-emerald-500/40 hover:bg-emerald-50/20 cursor-pointer text-slate-900"
              )}
              onClick={() => {
                if (!isExpanded) {
                  setExpandedFormatId(format.id);
                }
              }}
            >
              {/* Cabecera del formato */}
              <div className="flex items-center justify-between select-none">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-xs font-semibold uppercase tracking-wider transition-colors",
                    isExpanded
                      ? goldMode ? "text-emerald-400" : "text-emerald-700"
                      : goldMode ? "text-white/40" : "text-slate-500"
                  )}>
                    Formato {index + 1}
                  </span>
                  {!isExpanded && (
                    <span className={cn("text-xs font-medium", goldMode ? "text-white/60" : "text-slate-600")}>
                      • {format.boxType} • {format.quantity || "0"} cajas
                      {nobTotal > 0 && ` (Nob: ${nobTotal}c)`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {formats.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => moveFormatUp(index)}
                        disabled={index === 0}
                        className={cn("h-7 w-7 disabled:opacity-20 rounded-lg flex items-center justify-center text-[10px] transition-all cursor-pointer", goldMode ? "text-white/40 hover:text-white hover:bg-white/10" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200")}
                        title="Subir formato"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFormatDown(index)}
                        disabled={index === formats.length - 1}
                        className={cn("h-7 w-7 disabled:opacity-20 rounded-lg flex items-center justify-center text-[10px] transition-all cursor-pointer", goldMode ? "text-white/40 hover:text-white hover:bg-white/10" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200")}
                        title="Bajar formato"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFormat(index, format.id)}
                        className="h-7 w-7 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg flex items-center justify-center text-sm transition-all cursor-pointer"
                        id={`remove-format-${index}`}
                        title="Eliminar formato"
                      >
                        ✕
                      </button>
                    </>
                  )}
                  <span className={cn("text-[10px] transition-transform duration-200 ml-1", isExpanded ? "rotate-90" : "", goldMode ? "text-white/30" : "text-slate-400")}>
                    ▶
                  </span>
                </div>
              </div>

              {isExpanded && (
                <>
                  {/* Tipo de caja */}
                  <div className="space-y-1.5">
                    <label className={cn("text-xs font-semibold", goldMode ? "text-white/60" : "text-slate-600")}>Tipo de caja</label>
                    <select
                      value={format.boxType}
                      onChange={(e) => updateFormat(index, "boxType", e.target.value)}
                      onKeyDown={handleKeyDown}
                      className={cn(
                        "w-full h-12 px-3 border rounded-xl text-base focus:outline-none cursor-pointer",
                        goldMode
                          ? "bg-white/5 border-white/10 text-white focus:border-emerald-500/50"
                          : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
                      )}
                      id={`box-type-select-${index}`}
                    >
                      {DEFAULT_BOX_TYPES.map((bt) => (
                        <option key={bt.id} value={bt.name} className={cn(goldMode ? "bg-[#1a1a2e] text-white" : "bg-white text-slate-900")}>
                          {bt.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Cantidad */}
                  <div className="space-y-1.5">
                    <label className={cn("text-xs font-semibold", goldMode ? "text-white/60" : "text-slate-600")}>Cajas totales</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={format.quantity}
                      onChange={(e) => updateFormat(index, "quantity", e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="290"
                      className={cn(
                        "w-full h-12 px-3 text-lg font-bold border rounded-xl focus:outline-none",
                        goldMode
                          ? "bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-emerald-500/50"
                          : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600"
                      )}
                      id={`quantity-input-${index}`}
                    />
                  </div>

                  {/* Noblejas — Palets + Cajas */}
                  <div className="space-y-2">
                    <label className="text-xs text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      Noblejas
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-purple-600/70 dark:text-purple-300/40 uppercase tracking-wider font-bold">Palets</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={format.nobjelasPallets}
                          onChange={(e) => updateFormat(index, "nobjelasPallets", e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="0"
                          min="0"
                          className={cn(
                            "w-full h-12 px-3 text-lg font-bold border rounded-xl focus:outline-none",
                            goldMode
                              ? "bg-purple-500/5 border-purple-500/15 text-purple-300 placeholder:text-purple-300/20 focus:border-purple-500/40"
                              : "bg-purple-50 border-purple-200 text-purple-900 placeholder:text-purple-400 focus:border-purple-600"
                          )}
                          id={`noblejas-pallets-input-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-purple-600/70 dark:text-purple-300/40 uppercase tracking-wider font-bold">Cajas extra</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={format.nobjelasCajas}
                          onChange={(e) => updateFormat(index, "nobjelasCajas", e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="0"
                          min="0"
                          className={cn(
                            "w-full h-12 px-3 text-lg font-bold border rounded-xl focus:outline-none",
                            goldMode
                              ? "bg-purple-500/5 border-purple-500/15 text-purple-300 placeholder:text-purple-300/20 focus:border-purple-500/40"
                              : "bg-purple-50 border-purple-200 text-purple-900 placeholder:text-purple-400 focus:border-purple-600"
                          )}
                          id={`noblejas-cajas-input-${index}`}
                        />
                      </div>
                    </div>

                    {/* Resumen calculado */}
                    {hasNoblejasInput && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                        <span className="text-purple-600 dark:text-purple-300 text-xs font-bold">= {nobTotal} cajas</span>
                        <span className="text-purple-500/80 text-[10px] font-mono">
                          ({nobPallets > 0 ? `${nobPallets} × ${bpp}` : ""}
                          {nobPallets > 0 && nobCajas > 0 ? " + " : ""}
                          {nobCajas > 0 ? `${nobCajas}` : ""})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Avanzado */}
                  <details className="group border-t border-slate-200 dark:border-white/5 pt-2">
                    <summary className={cn("text-xs cursor-pointer select-none transition-colors list-none flex items-center gap-1.5 font-medium", goldMode ? "text-white/40 hover:text-white/60" : "text-slate-500 hover:text-slate-800")}>
                      <span className="transition-transform duration-200 group-open:rotate-90 text-[9px]">▶</span>
                      <span>Avanzado — {format.boxesPerPallet} cajas/pallet</span>
                    </summary>
                    <div className="mt-2.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={format.boxesPerPallet}
                        onChange={(e) => updateFormat(index, "boxesPerPallet", e.target.value)}
                        onKeyDown={handleKeyDown}
                        className={cn(
                          "w-full h-11 px-3 text-base font-bold border rounded-xl focus:outline-none",
                          goldMode
                            ? "bg-white/5 border-white/10 text-white"
                            : "bg-white border-slate-300 text-slate-900"
                        )}
                        id={`boxes-per-pallet-input-${index}`}
                      />
                    </div>
                  </details>

                  {/* Lote */}
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/5">
                    <label className={cn("flex items-center gap-2 cursor-pointer select-none text-xs font-bold", goldMode ? "text-white/70" : "text-slate-800")}>
                      <input
                        type="checkbox"
                        checked={format.cambioLote || false}
                        onChange={(e) => updateFormat(index, "cambioLote", e.target.checked)}
                        className="rounded border-slate-300 bg-white text-emerald-600 focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer"
                      />
                      <span>🔄 Cambio de Lote</span>
                    </label>

                    {format.cambioLote && (
                      <div className="space-y-1.5 animate-slide-down">
                        <label className={cn("text-[10px] uppercase tracking-wider font-bold", goldMode ? "text-white/40" : "text-slate-500")}>Código del nuevo lote</label>
                        <input
                          type="text"
                          value={format.lote || ""}
                          onChange={(e) => updateFormat(index, "lote", e.target.value)}
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

                  {/* Nota rápida - Solo en Modo Gold */}
                  {goldMode && (
                    <div className="space-y-1.5 border-t border-white/5 pt-2">
                      <label className="text-xs text-white/40 font-semibold flex items-center gap-1.5 uppercase tracking-wider">Alerta</label>
                      <input
                        type="text"
                        value={format.note || ""}
                        onChange={(e) => updateFormat(index, "note", e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ej: Controlar peso, Etiqueta especial, etc."
                        className="w-full h-11 px-3 text-base bg-white/5 border border-white/10 text-white placeholder:text-white/20 rounded-xl focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Botones — siempre visibles */}
      <div className="flex gap-3 pt-4 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "flex-1 h-14 text-base font-semibold border rounded-xl transition-all active:scale-95 cursor-pointer",
            goldMode
              ? "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
          )}
          id="cancel-salad-btn"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          className={cn(
            "flex-1 h-14 text-base font-bold text-white rounded-xl transition-all active:scale-95 cursor-pointer",
            goldMode
              ? "bg-emerald-500 hover:bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              : "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
          )}
          id="save-salad-btn"
        >
          ✔ Guardar
        </button>
      </div>
    </form>
  );
}
