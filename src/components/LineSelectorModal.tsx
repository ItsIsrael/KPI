"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProductionStore } from "@/store/production-store";
import { DEFAULT_PRODUCTION_LINES } from "@/types/types";
import { LayoutDashboard, Layers, X } from "lucide-react";

interface LineSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goldMode?: boolean;
}

export function LineSelectorModal({ open, onOpenChange, goldMode = false }: LineSelectorModalProps) {
  const { activeLineCode, setActiveLineCode } = useProductionStore();

  const handleSelectLine = (code: string) => {
    setActiveLineCode(code);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "!max-w-md w-[92vw] p-0 overflow-hidden border-0 shadow-2xl rounded-3xl",
          goldMode ? "bg-[#141006] text-white" : "bg-white text-slate-900"
        )}
      >
        {/* Header */}
        <div className={cn(
          "px-6 py-5 border-b relative flex items-center justify-between",
          goldMode ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-50 border-emerald-100"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center font-black shadow-inner",
              goldMode ? "bg-amber-500/20 text-amber-300" : "bg-emerald-600 text-white"
            )}>
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black tracking-tight">
                ¿Qué quieres gestionar?
              </DialogTitle>
              <p className={cn("text-xs font-semibold mt-0.5", goldMode ? "text-white/50" : "text-slate-500")}>
                Selecciona tu línea o accede al monitor global
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenChange(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            type="button"
            title="Cerrar"
          >
            <X className="w-4 h-4 opacity-70" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Opción 1: Monitor Global Dashboard */}
          <button
            type="button"
            onClick={() => handleSelectLine("ALL")}
            className={cn(
              "w-full p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between group shadow-sm min-h-[52px]",
              activeLineCode === "ALL"
                ? goldMode
                  ? "bg-amber-500 text-black border-amber-400 font-black shadow-lg scale-[1.01]"
                  : "bg-emerald-600 text-white border-emerald-700 font-black shadow-lg scale-[1.01]"
                : goldMode
                ? "bg-white/5 border-white/10 text-white hover:bg-white/10"
                : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-emerald-50 hover:border-emerald-300"
            )}
          >
            <div className="flex items-center gap-3">
              <LayoutDashboard className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-black uppercase tracking-wider">Dashboard de Planta</p>
                <p className="text-[11px] opacity-75 font-medium">Visión global de las 4 líneas en tiempo real</p>
              </div>
            </div>
            <span className="text-xs font-bold font-mono group-hover:translate-x-1 transition-transform">→</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
            <span className={cn("flex-shrink mx-3 text-[10px] font-black uppercase tracking-widest", goldMode ? "text-white/40" : "text-slate-400")}>
              o elige tu línea directa
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-white/10"></div>
          </div>

          {/* Opción 2: Grid de 4 Líneas */}
          <div className="grid grid-cols-2 gap-3">
            {DEFAULT_PRODUCTION_LINES.map((line) => {
              const isSelected = activeLineCode === line.code;
              return (
                <button
                  key={line.code}
                  type="button"
                  onClick={() => handleSelectLine(line.code)}
                  className={cn(
                    "p-4 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 min-h-[64px] shadow-sm active:scale-95",
                    isSelected
                      ? goldMode
                        ? "bg-amber-500/20 border-amber-500 text-amber-300 font-black ring-2 ring-amber-500/40"
                        : "bg-emerald-50 border-emerald-600 text-emerald-800 font-black ring-2 ring-emerald-600/40"
                      : goldMode
                      ? "bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
                      : "bg-white border-slate-200 text-slate-800 hover:bg-emerald-50 hover:border-emerald-300"
                  )}
                >
                  <span className="text-base font-black tracking-tight">{line.name}</span>
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider opacity-60")}>
                    {isSelected ? "Seleccionada actualmente" : "Gestionar línea"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
