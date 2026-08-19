"use client";

import { useState, useEffect } from "react";
import packageJson from "@/../package.json";
import { Sparkles, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VersionNotifierProps {
  goldMode?: boolean;
}

export function VersionNotifier({ goldMode = false }: VersionNotifierProps) {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const currentClientVersion = packageJson.version;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, {
          cache: "no-store",
          headers: { 
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.version && data.version !== currentClientVersion) {
          setHasNewVersion(true);
        }
      } catch (err) {
        // Silencioso si hay corte de red
      }
    };

    // Primera comprobación a los 5 segundos de abrir
    const initialTimer = setTimeout(checkVersion, 5000);
    // Intervalo de comprobación rápida cada 30 segundos
    const interval = setInterval(checkVersion, 30000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const handleUpdate = () => {
    setIsUpdating(true);
    // Recarga limpia forzando cache refresh
    window.location.reload();
  };

  if (!hasNewVersion || dismissed) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-lg animate-slide-down">
      <div
        className={cn(
          "p-4 rounded-2xl shadow-2xl border flex items-center justify-between gap-3 backdrop-blur-xl transition-all",
          goldMode
            ? "bg-[#161208]/95 border-amber-400 text-white shadow-[0_10px_40px_rgba(245,158,11,0.25)] ring-2 ring-amber-400/40"
            : "bg-emerald-950/95 border-emerald-400 text-white shadow-[0_10px_40px_rgba(16,185,129,0.25)] ring-2 ring-emerald-400/40"
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 animate-bounce",
              goldMode ? "bg-amber-400/20 text-amber-300" : "bg-emerald-400/20 text-emerald-300"
            )}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-black tracking-tight leading-snug flex items-center gap-1.5">
              <span>¡Nueva versión del sistema disponible!</span>
            </h4>
            <p className="text-[11px] opacity-80 leading-snug">
              Hay mejoras listas. Los datos en curso no se perderán.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            type="button"
            className={cn(
              "px-3.5 py-2 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md",
              goldMode
                ? "bg-gradient-to-r from-amber-400 to-yellow-400 text-black hover:opacity-90"
                : "bg-gradient-to-r from-emerald-400 to-teal-400 text-[#092015] hover:opacity-90"
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isUpdating && "animate-spin")} />
            <span>{isUpdating ? "Actualizando..." : "Actualizar"}</span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/10 transition-colors cursor-pointer text-white"
            title="Descartar por ahora"
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
