"use client";

import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ListChecks, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProductionStore } from "@/store/production-store";
import { cn } from "@/lib/utils";
import { DEFAULT_BOX_TYPES, DEFAULT_SALADS } from "@/types/types";
import type { Salad, OrderRow } from "@/types/types";

interface ManualOrderScannerProps {
  onClose: () => void;
  targetLineCode: string;
}

export function ManualOrderScanner({ onClose, targetLineCode }: ManualOrderScannerProps) {
  const { goldMode, addSalad, noblejasConfig, lineStorage, updateManualOrderDrafts } = useProductionStore();
  
  const initialDraft = lineStorage[targetLineCode]?.manualOrderDrafts;
  
  const [pendingWarning, setPendingWarning] = useState<{ saladsMap: Map<string, Salad>, warnings: string[] } | null>(null);

  const [rows, setRows] = useState<OrderRow[]>(initialDraft && initialDraft.length > 0 ? initialDraft : [{
    id: crypto.randomUUID(),
    codigo10e: "",
    name: "",
    boxType: "Cartón 4",
    quantity: "",
    lote: ""
  }]);

  useEffect(() => {
    updateManualOrderDrafts(targetLineCode, rows);
  }, [rows, targetLineCode, updateManualOrderDrafts]);

  const addRow = () => {
    setRows([...rows, {
      id: crypto.randomUUID(),
      codigo10e: "",
      name: "",
      boxType: "Cartón 4",
      quantity: "",
      lote: ""
    }]);
  };

  const removeRow = (id: string) => {
    if (rows.length === 1) return;
    setRows(rows.filter(r => r.id !== id));
  };

  const updateRow = (id: string, field: keyof OrderRow, value: string) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const confirmAndAdd = () => {
    // Validate rows
    const validRows = rows.filter(r => r.name.trim() !== "" && parseInt(r.quantity, 10) > 0);
    
    if (validRows.length === 0) {
      alert("No hay ensaladas válidas para añadir. Asegúrate de rellenar Nombre y Cajas.");
      return;
    }

    // Group formats by salad name to replicate OCR structure
    const saladsMap = new Map<string, Salad>();
    const warnings: string[] = [];

    validRows.forEach(row => {
      const clean10E = row.codigo10e.replace(/^10[eE]/i, '');
      const final10E = clean10E ? `10E${clean10E}` : undefined;
      
      let assignedNoblejas = 0;
      if (final10E && noblejasConfig[final10E] !== undefined) {
        assignedNoblejas = noblejasConfig[final10E];
      }

      if (assignedNoblejas > parseInt(row.quantity, 10)) {
        warnings.push(`• ${row.name || final10E}: Pide ${assignedNoblejas} para Noblejas pero solo producirás ${row.quantity}.`);
      }

      const format = {
        id: crypto.randomUUID(),
        boxType: row.boxType,
        quantity: parseInt(row.quantity, 10),
        noblejas: assignedNoblejas,
        boxesPerPallet: DEFAULT_BOX_TYPES.find(b => b.name === row.boxType)?.defaultBoxesPerPallet || 70,
        lote: row.lote || undefined,
        cambioLote: !!row.lote,
        linea: targetLineCode,
        codigo10e: final10E
      };

      const normalizedName = row.name.trim().toUpperCase();
      if (!saladsMap.has(normalizedName)) {
        saladsMap.set(normalizedName, {
          id: crypto.randomUUID(),
          name: normalizedName,
          formats: [format]
        });
      } else {
        saladsMap.get(normalizedName)!.formats.push(format);
      }
    });

    if (warnings.length > 0) {
      setPendingWarning({ saladsMap, warnings });
      return;
    }

    executeAdd(saladsMap);
  };

  const executeAdd = (saladsMap: Map<string, Salad>) => {
    // Add each extracted salad to the store
    saladsMap.forEach(salad => {
      addSalad(salad, targetLineCode);
    });
    
    alert("¡Ensaladas añadidas a la cola correctamente!");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={cn(
        "relative w-full max-w-4xl overflow-hidden rounded-3xl border shadow-2xl flex flex-col max-h-[90vh]",
        goldMode ? "bg-[#120e06] border-amber-500/30" : "bg-white border-slate-200"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center p-3 border-b relative",
          goldMode ? "border-white/10" : "border-slate-100"
        )}>
          {/* Mac-style window controls */}
          <div className="flex gap-1.5 absolute left-4">
            <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center group border border-black/10 shadow-sm transition-all">
              <X className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100" />
            </button>
            <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/10 shadow-sm"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/10 shadow-sm"></div>
          </div>
          
          <div className="flex items-center gap-2 mx-auto pl-8">
            <div className={cn(
              "p-1.5 rounded-lg",
              goldMode ? "bg-amber-500/20 text-amber-400" : "bg-blue-100 text-blue-600"
            )}>
              <ListChecks className="w-4 h-4" />
            </div>
            <h2 className={cn("text-base font-bold", goldMode ? "text-white" : "text-slate-900")}>
              Ingreso Manual de Órdenes (Línea {targetLineCode})
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="space-y-4">
            <p className={cn("text-sm", goldMode ? "text-white/70" : "text-slate-500")}>
              Añade las ensaladas manualmente. El sistema cruzará automáticamente los códigos 10E con tu diccionario de Noblejas y los enviará a la línea {targetLineCode}.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left border-collapse">
                <thead>
                  <tr className={cn(
                    "border-b text-[10px] uppercase tracking-wider font-black",
                    goldMode ? "border-white/10 text-white/50" : "border-slate-200 text-slate-400"
                  )}>
                    <th className="pb-3 px-2 w-24">Cód. 10E</th>
                    <th className="pb-3 px-2 w-1/3">Ensalada</th>
                    <th className="pb-3 px-2 w-32">Tipo Caja</th>
                    <th className="pb-3 px-2 w-24">Cajas (Totales)</th>
                    <th className="pb-3 px-2 w-24">Lote (Opc)</th>
                    <th className="pb-3 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/20">
                  {rows.map((row, idx) => (
                    <tr key={row.id}>
                      <td className="py-2 px-1 align-top">
                        <div className="flex flex-col gap-1">
                          <div className={cn(
                            "flex items-center w-full h-10 px-2 rounded-lg border overflow-hidden",
                            goldMode ? "bg-white/5 border-white/15" : "bg-slate-50 border-slate-300"
                          )}>
                            <span className={cn("text-xs font-bold opacity-50 mr-1", goldMode ? "text-white" : "text-black")}>10E</span>
                            <input 
                              type="text" 
                              value={row.codigo10e} 
                              onChange={e => updateRow(row.id, "codigo10e", e.target.value)} 
                              placeholder="123" 
                              className="w-full h-full bg-transparent text-xs font-bold outline-none" 
                            />
                          </div>
                          {(() => {
                            const clean10E = row.codigo10e.replace(/^10[eE]/i, '');
                            if (!clean10E) return null;
                            const final10E = `10E${clean10E}`.toUpperCase();
                            const noblejas = noblejasConfig[final10E];
                            return (
                              <div className="flex items-center">
                                {noblejas !== undefined ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20 whitespace-nowrap">
                                    🏷️ {final10E} · 💜 {noblejas} Nob
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 border border-slate-500/20 whitespace-nowrap">
                                    🏷️ {final10E}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-2 px-1">
                        <input
                          type="text"
                          list={`salad-names-${row.id}`}
                          value={row.name}
                          onChange={e => updateRow(row.id, "name", e.target.value)}
                          placeholder="Nombre ensalada..."
                          className={cn(
                            "w-full h-10 px-3 rounded-lg border text-sm font-medium",
                            goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                          )}
                        />
                        <datalist id={`salad-names-${row.id}`}>
                          {DEFAULT_SALADS.map(s => <option key={s} value={s} />)}
                        </datalist>
                      </td>
                      <td className="py-2 px-1">
                        <select
                          value={row.boxType}
                          onChange={e => updateRow(row.id, "boxType", e.target.value)}
                          className={cn(
                            "w-full h-10 px-2 rounded-lg border text-xs font-medium appearance-none",
                            goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                          )}
                        >
                          {DEFAULT_BOX_TYPES.map(b => (
                            <option key={b.name} value={b.name}>{b.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-1">
                        <input
                          type="number"
                          value={row.quantity}
                          onChange={e => updateRow(row.id, "quantity", e.target.value)}
                          placeholder="Cant..."
                          className={cn(
                            "w-full h-10 px-3 rounded-lg border text-sm font-bold",
                            goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                          )}
                        />
                      </td>
                      <td className="py-2 px-1">
                        <input
                          type="text"
                          value={row.lote}
                          onChange={e => updateRow(row.id, "lote", e.target.value)}
                          placeholder="Lote..."
                          className={cn(
                            "w-full h-10 px-3 rounded-lg border text-xs font-medium",
                            goldMode ? "bg-white/5 border-white/15 text-white" : "bg-slate-50 border-slate-300 text-black"
                          )}
                        />
                      </td>
                      <td className="py-2 px-1 text-center">
                        <button
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            rows.length === 1 
                              ? "opacity-30 cursor-not-allowed" 
                              : "text-red-500 hover:bg-red-500/10"
                          )}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={addRow}
              className={cn(
                "h-10 px-4 rounded-xl text-xs font-bold border border-dashed flex items-center justify-center gap-2 transition-all w-full sm:w-auto",
                goldMode 
                  ? "border-amber-500/30 text-amber-500 hover:bg-amber-500/10" 
                  : "border-emerald-600/30 text-emerald-600 hover:bg-emerald-600/10"
              )}
            >
              <Plus className="w-4 h-4" />
              <span>Añadir Fila</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={cn(
          "p-4 border-t flex flex-col sm:flex-row justify-end gap-3",
          goldMode ? "border-white/10 bg-[#120e06]" : "border-slate-100 bg-slate-50/50"
        )}>
          <button
            onClick={onClose}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold border transition-colors",
              goldMode 
                ? "border-white/10 text-white hover:bg-white/5" 
                : "border-slate-200 text-slate-600 hover:bg-slate-100"
            )}
          >
            Cancelar
          </button>
          <button
            onClick={confirmAndAdd}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2",
              goldMode
                ? "bg-amber-500 text-black hover:bg-amber-400"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
          >
            <ListChecks className="w-4 h-4" />
            <span>Cargar a Línea {targetLineCode}</span>
          </button>
        </div>
      </div>

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
                if (pendingWarning) {
                  executeAdd(pendingWarning.saladsMap);
                  setPendingWarning(null);
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
    </div>
  );
}
