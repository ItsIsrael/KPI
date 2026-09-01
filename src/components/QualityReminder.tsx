"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { ClipboardCheck, X } from "lucide-react";
import { useProductionStore } from "@/store/production-store";

interface QualityReminderProps {
  goldMode?: boolean;
}

/**
 * QualityReminder – Toast flotante que recuerda hacer el registro de calidad
 * cada hora en punto. Se auto-cierra a los 10 minutos.
 * Estilo visual idéntico al BroadcastListener (toast de alertas).
 */
export function QualityReminder({ goldMode = false }: QualityReminderProps) {
  const [visible, setVisible] = useState(false);
  const [triggerHour, setTriggerHour] = useState<string>("");
  const [saladName, setSaladName] = useState<string>("");
  const [progressKey, setProgressKey] = useState(0);
  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFiredHourRef = useRef<number>(-1);

  // Función para reproducir sonido de notificación de calidad
  const playQualitySound = useCallback(() => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      // Tres tonos ascendentes suaves – distintos del sonido de broadcast
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + i * 0.15 + 0.4
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.4);
      });
    } catch {
      // AudioContext no disponible – silenciosamente ignorar
    }
  }, []);

  // Disparar el toast
  const fireReminder = useCallback(() => {
    const now = new Date();
    const hourStr = now.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    // Leer la ensalada actual del store
    const state = useProductionStore.getState();
    const currentItem = state.queue?.[state.currentQueueIndex];
    const currentSaladName = currentItem?.saladName || "";

    setTriggerHour(hourStr);
    setSaladName(currentSaladName);
    setVisible(true);
    setProgressKey((p) => p + 1);
    playQualitySound();

    // Limpiar timer anterior si existe
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

    // Auto-cerrar a los 10 minutos
    dismissTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, 10 * 60 * 1000);
  }, [playQualitySound]);

  useEffect(() => {
    // Comprobar cada 15 segundos si estamos en el minuto 0 de una nueva hora
    const checkInterval = setInterval(() => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Disparar en el minuto 0 de cada hora, solo una vez por hora
      if (currentMinute === 0 && lastFiredHourRef.current !== currentHour) {
        lastFiredHourRef.current = currentHour;
        fireReminder();
      }
    }, 15_000); // Cada 15 segundos para no perder el minuto exacto

    return () => {
      clearInterval(checkInterval);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [fireReminder]);

  const handleDismiss = () => {
    setVisible(false);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed top-20 left-4 sm:left-6 z-[119] max-w-md w-[92vw] animate-in slide-in-from-top-4 fade-in duration-300">
      <div
        className={cn(
          "p-4 sm:p-5 rounded-3xl shadow-2xl border backdrop-blur-2xl transition-all relative overflow-hidden",
          goldMode
            ? "bg-[#181206]/85 border-amber-400/80 text-white ring-1 ring-amber-400/30 shadow-[0_15px_50px_rgba(245,158,11,0.35)]"
            : "bg-[#0c1a2e]/85 border-sky-400/80 text-white ring-1 ring-sky-400/30 shadow-[0_15px_50px_rgba(56,189,248,0.35)]"
        )}
      >
        {/* Barra de progreso de auto-cierre (10 min) */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 overflow-hidden">
          <div
            key={progressKey}
            className={cn(
              "h-full",
              goldMode ? "bg-amber-400" : "bg-sky-400"
            )}
            style={{
              animation: "quality-reminder-timeout 600s linear forwards",
            }}
          />
        </div>

        <style jsx>{`
          @keyframes quality-reminder-timeout {
            from {
              width: 100%;
            }
            to {
              width: 0%;
            }
          }
        `}</style>

        <div className="flex items-start gap-3.5 mt-1">
          {/* Icono */}
          <div
            className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner mt-0.5 backdrop-blur-md",
              goldMode
                ? "bg-amber-500/30 text-amber-200 border border-amber-400/60"
                : "bg-sky-500/30 text-sky-200 border border-sky-400/60"
            )}
          >
            <ClipboardCheck className={cn("w-5 h-5", goldMode ? "text-amber-300" : "text-sky-300")} />
          </div>

          <div className="flex-1 min-w-0 pr-12">
            {/* Badge con la hora */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                style={{ color: "#ffffff" }}
                className={cn(
                  "text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md tracking-wider font-mono shadow-sm backdrop-blur-md",
                  goldMode
                    ? "bg-amber-500/60 border border-amber-400/80"
                    : "bg-sky-500/60 border border-sky-400/80"
                )}
              >
                ⏰ REGISTRO · {triggerHour}h
              </span>
            </div>

            {/* Título */}
            <h4
              style={{ color: "#ffffff" }}
              className="text-base sm:text-lg font-black !text-white mt-1.5 leading-snug drop-shadow-md tracking-tight"
            >
              📋 Registro de Calidad
            </h4>

            {/* Mensaje */}
            <p
              style={{ color: "#f8fafc" }}
              className="text-xs sm:text-sm font-semibold !text-slate-100 mt-1 leading-relaxed"
            >
              {saladName
                ? <>Toca hacer el registro de calidad de <strong className={goldMode ? "text-amber-300" : "text-sky-300"}>{saladName}</strong>.</>
                : <>Toca hacer el registro de calidad de la ensalada en producción.</>}
            </p>
          </div>

          {/* Botones de control estilo Mac / iOS */}
          <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
            <button
              onClick={handleDismiss}
              className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center group border border-black/20 shadow-sm cursor-pointer transition-transform hover:scale-110"
              title="Cerrar aviso"
              type="button"
            >
              <X className="w-2.5 h-2.5 text-black/60 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/20 shadow-sm opacity-60" />
            <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/20 shadow-sm opacity-60" />
          </div>
        </div>

        {/* Footer con botón */}
        <div className="mt-3.5 pt-3 border-t border-white/15 flex justify-end">
          <button
            onClick={handleDismiss}
            className={cn(
              "text-xs font-black px-4 py-2 rounded-xl transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md",
              goldMode
                ? "bg-amber-500 hover:bg-amber-400 text-black font-black"
                : "bg-sky-400 hover:bg-sky-300 text-[#0c1a2e] font-black"
            )}
          >
            Entendido ✓
          </button>
        </div>
      </div>
    </div>
  );
}
