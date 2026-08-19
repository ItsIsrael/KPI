"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Megaphone, Send, AlertTriangle, BellRing, X, CheckCircle2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface BroadcastMessage {
  id: string;
  sender: string;
  targetLine: "ALL" | "K00" | "K01" | "K02" | "K03";
  type: "info" | "warning" | "urgent" | "film" | "pause";
  title: string;
  message: string;
  createdAt: number;
}

const PRESET_MESSAGES = [
  { type: "film", title: "Cambio de Film / Bobina", message: "Atención: La siguiente orden requiere cambio a FILM PROMO." },
  { type: "warning", title: "Revisión de Control de Peso", message: "Verificar pesos y calibración de báscula en el próximo palet." },
  { type: "urgent", title: "Parada de Línea / Mantenimiento", message: "Parada temporal por ajuste de máquina. Esperar confirmación." },
  { type: "info", title: "Noblejas Asignado", message: "Recordar separar los palets identificados de Noblejas." },
  { type: "info", title: "Ritmo de Producción", message: "Cadencia correcta en línea. Buen trabajo equipo." },
];

export async function sendBroadcastAlert(alert: Omit<BroadcastMessage, "id" | "createdAt">): Promise<boolean> {
  const newMsg: BroadcastMessage = {
    ...alert,
    id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
  };

  // Broadcast directo por WebSocket Supabase (Realtime Channel)
  if (isSupabaseConfigured && supabase) {
    try {
      const channel = supabase.channel("factory-broadcast");
      await channel.send({
        type: "broadcast",
        event: "plant-alert",
        payload: newMsg,
      });
      // También guardar en global_settings como fallback persistente
      await supabase.from("global_settings").upsert({
        id: "latest_broadcast",
        value: newMsg,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      return true;
    } catch (err) {
      console.warn("Error enviando alerta por Supabase:", err);
    }
  }

  // Fallback localstorage para pestañas en el mismo PC
  if (typeof window !== "undefined") {
    localStorage.setItem("factory_broadcast_local", JSON.stringify(newMsg));
    window.dispatchEvent(new CustomEvent("plant-alert-local", { detail: newMsg }));
  }
  return true;
}

interface BroadcastSenderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goldMode?: boolean;
  currentLineCode?: string;
}

export function BroadcastSenderModal({ open, onOpenChange, goldMode = false, currentLineCode }: BroadcastSenderModalProps) {
  const [targetLine, setTargetLine] = useState<"ALL" | "K00" | "K01" | "K02" | "K03">("ALL");
  const [alertType, setAlertType] = useState<"info" | "warning" | "urgent" | "film" | "pause">("info");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setIsSending(true);
    await sendBroadcastAlert({
      sender: currentLineCode && currentLineCode !== "ALL" ? `Línea ${currentLineCode}` : "Supervisión / Control",
      targetLine,
      type: alertType,
      title: title.trim(),
      message: message.trim(),
    });

    setIsSending(false);
    setSentSuccess(true);
    setTimeout(() => {
      setSentSuccess(false);
      setTitle("");
      setMessage("");
      onOpenChange(false);
    }, 1200);
  };

  const handleApplyPreset = (preset: typeof PRESET_MESSAGES[0]) => {
    setAlertType(preset.type as any);
    setTitle(preset.title);
    setMessage(preset.message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={cn(
        "!max-w-xl w-[95vw] p-0 overflow-hidden border-0 shadow-2xl",
        goldMode ? "bg-[#141006] text-white" : "bg-white text-[#0f291e]"
      )}>
        <DialogHeader className={cn(
          "px-6 py-4 border-b relative flex-shrink-0",
          goldMode ? "bg-amber-500/10 border-amber-500/20" : "bg-emerald-50 border-emerald-100"
        )}>
          {/* Mac-style controls */}
          <div className="flex gap-1.5 absolute left-6 top-1/2 -translate-y-1/2 z-10">
            <button onClick={() => onOpenChange(false)} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center group border border-black/10 shadow-sm transition-all">
              <X className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100" />
            </button>
            <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/10 shadow-sm"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/10 shadow-sm"></div>
          </div>
          <DialogTitle className="flex items-center gap-2 text-xl font-black pl-16">
            <Megaphone className={cn("w-6 h-6", goldMode ? "text-amber-400" : "text-emerald-600")} />
            Enviar Alerta a las Líneas
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSend} className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Plantillas Rápidas */}
          <div className="space-y-2">
            <label className={cn("text-[10px] font-black uppercase tracking-wider block", goldMode ? "text-white/40" : "text-slate-500")}>
              ⚡ Plantillas Rápidas de Fábrica
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_MESSAGES.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className={cn(
                    "text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all active:scale-95 text-left cursor-pointer",
                    goldMode
                      ? "bg-white/5 hover:bg-white/10 border-white/10 text-white/80"
                      : "bg-slate-50 hover:bg-emerald-50 border-slate-200 text-slate-700"
                  )}
                >
                  {p.type === "film" ? "🏷️ " : p.type === "urgent" ? "🚨 " : p.type === "warning" ? "⚠️ " : "ℹ️ "}
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          {/* Destino y Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={cn("text-[10px] font-black uppercase tracking-wider block", goldMode ? "text-white/40" : "text-slate-500")}>
                🎯 Destinatario
              </label>
              <select
                value={targetLine}
                onChange={(e) => setTargetLine(e.target.value as any)}
                className={cn(
                  "w-full h-10 px-3 rounded-xl border text-xs font-bold transition-all outline-none",
                  goldMode ? "bg-black/50 border-white/20 text-white" : "bg-white border-slate-200 text-slate-800"
                )}
              >
                <option value="ALL">📢 Todas las Líneas (General)</option>
                <option value="K00">Línea K00</option>
                <option value="K01">Línea K01</option>
                <option value="K02">Línea K02</option>
                <option value="K03">Línea K03</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={cn("text-[10px] font-black uppercase tracking-wider block", goldMode ? "text-white/40" : "text-slate-500")}>
                🎨 Nivel de Alerta
              </label>
              <select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value as any)}
                className={cn(
                  "w-full h-10 px-3 rounded-xl border text-xs font-bold transition-all outline-none",
                  goldMode ? "bg-black/50 border-white/20 text-white" : "bg-white border-slate-200 text-slate-800"
                )}
              >
                <option value="info">ℹ️ Informativo / Normal</option>
                <option value="film">🏷️ Film Promo / Bobina</option>
                <option value="warning">⚠️ Advertencia / Calidad</option>
                <option value="urgent">🚨 Urgente / Parada</option>
              </select>
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className={cn("text-[10px] font-black uppercase tracking-wider block", goldMode ? "text-white/40" : "text-slate-500")}>
              Título del Aviso
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Revisar Film Promo en la orden actual"
              className={cn(
                "w-full h-11 px-3.5 rounded-xl border text-sm font-bold transition-all outline-none",
                goldMode ? "bg-black/50 border-white/20 text-white focus:border-amber-400" : "bg-white border-slate-200 text-slate-900 focus:border-emerald-600"
              )}
            />
          </div>

          {/* Mensaje */}
          <div className="space-y-1.5">
            <label className={cn("text-[10px] font-black uppercase tracking-wider block", goldMode ? "text-white/40" : "text-slate-500")}>
              Mensaje o Instrucción Detallada
            </label>
            <textarea
              required
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escribe las instrucciones para los operarios de la línea..."
              className={cn(
                "w-full p-3 rounded-xl border text-sm font-medium transition-all outline-none resize-none",
                goldMode ? "bg-black/50 border-white/20 text-white focus:border-amber-400" : "bg-white border-slate-200 text-slate-900 focus:border-emerald-600"
              )}
            />
          </div>

          {/* Botón de Envío */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={cn(
                "h-10 px-4 rounded-xl font-bold text-xs border transition-all active:scale-95 cursor-pointer",
                goldMode 
                  ? "bg-white/10 hover:bg-white/20 border-white/20 text-white" 
                  : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
              )}
            >
              Cancelar
            </button>
            <Button
              type="submit"
              disabled={isSending || sentSuccess || !title.trim() || !message.trim()}
              className={cn(
                "font-black px-6 h-10 rounded-xl flex items-center gap-2 transition-all active:scale-95 cursor-pointer shadow-lg",
                sentSuccess
                  ? "bg-emerald-600 text-white"
                  : goldMode
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black shadow-amber-500/25"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25"
              )}
            >
              {sentSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  ¡Alerta Emitida!
                </>
              ) : isSending ? (
                <span>Emitiendo...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Emitir Alerta en Vivo
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// COMPONENTE FLOTANTE RECEPTOR DE ALERTAS (TOAST NOTIFIER)
// ============================================================

export function BroadcastListener({ goldMode = false, currentLineCode }: { goldMode?: boolean; currentLineCode?: string }) {
  const [activeAlert, setActiveAlert] = useState<BroadcastMessage | null>(null);
  const [progressKey, setProgressKey] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (activeAlert) {
      // Auto-desaparecer en 10 segundos
      timer = setTimeout(() => {
        setActiveAlert(null);
      }, 10000);
    }
    return () => clearTimeout(timer);
  }, [activeAlert]);

  useEffect(() => {
    const handleNewAlert = (msg: BroadcastMessage) => {
      // Filtrar si el mensaje es para una línea específica y no estamos en ella ni en ALL
      if (msg.targetLine !== "ALL" && currentLineCode && currentLineCode !== "ALL" && msg.targetLine !== currentLineCode) {
        return;
      }
      setActiveAlert(msg);
      setProgressKey(prev => prev + 1);

      // Reproducir sonido sutil de notificación si está permitido por el navegador
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      } catch {}
    };

    // 1. Escucha por Supabase WebSocket Realtime
    if (isSupabaseConfigured && supabase) {
      const channel = supabase.channel("factory-broadcast")
        .on("broadcast", { event: "plant-alert" }, (payload) => {
          if (payload && payload.payload) {
            handleNewAlert(payload.payload as BroadcastMessage);
          }
        })
        .subscribe();

      return () => {
        supabase?.removeChannel(channel);
      };
    }

    // 2. Escucha por CustomEvent / LocalStorage fallback
    const localHandler = (e: Event) => {
      const customEvent = e as CustomEvent<BroadcastMessage>;
      if (customEvent.detail) {
        handleNewAlert(customEvent.detail);
      }
    };
    window.addEventListener("plant-alert-local", localHandler);
    return () => {
      window.removeEventListener("plant-alert-local", localHandler);
    };
  }, [currentLineCode]);

  if (!activeAlert) return null;

  const isUrgent = activeAlert.type === "urgent" || activeAlert.type === "pause";
  const isFilm = activeAlert.type === "film";
  const isWarning = activeAlert.type === "warning";

  return (
    <div className="fixed top-20 right-4 sm:right-6 z-[120] max-w-md w-[92vw] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className={cn(
        "p-4 sm:p-5 rounded-3xl shadow-2xl border backdrop-blur-2xl transition-all relative overflow-hidden",
        isUrgent
          ? "bg-red-950/85 border-red-500/80 text-white ring-1 ring-red-500/40 shadow-[0_15px_50px_rgba(239,68,68,0.4)]"
          : isFilm
          ? "bg-rose-950/85 border-rose-500/80 text-white ring-1 ring-rose-500/40 shadow-[0_15px_50px_rgba(244,63,94,0.4)]"
          : isWarning
          ? "bg-[#2a1705]/85 border-amber-500/80 text-white ring-1 ring-amber-500/40 shadow-[0_15px_50px_rgba(245,158,11,0.4)]"
          : goldMode
          ? "bg-[#181206]/85 border-amber-400/80 text-white ring-1 ring-amber-400/30 shadow-[0_15px_50px_rgba(245,158,11,0.35)]"
          : "bg-[#042416]/85 border-emerald-400/80 text-white ring-1 ring-emerald-400/30 shadow-[0_15px_50px_rgba(16,185,129,0.35)]"
      )}>
        {/* Barra de progreso de auto-cierre (10s) */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 overflow-hidden">
          <div 
            key={progressKey}
            className={cn(
              "h-full animate-[progress_10s_linear_forwards]",
              isUrgent ? "bg-red-400"
              : isFilm ? "bg-rose-400"
              : isWarning ? "bg-amber-400"
              : "bg-emerald-400"
            )}
            style={{
              animation: "broadcast-timeout 10s linear forwards"
            }}
          />
        </div>

        <style jsx>{`
          @keyframes broadcast-timeout {
            from { width: 100%; }
            to { width: 0%; }
          }
        `}</style>

        <div className="flex items-start gap-3.5 mt-1">
          <div className={cn(
            "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-inner mt-0.5 backdrop-blur-md",
            isUrgent ? "bg-red-500/30 text-red-200 border border-red-400/60"
            : isFilm ? "bg-rose-500/30 text-rose-200 border border-rose-400/60"
            : isWarning ? "bg-amber-500/30 text-amber-200 border border-amber-400/60"
            : "bg-emerald-500/30 text-emerald-200 border border-emerald-400/60"
          )}>
            {isUrgent ? <ShieldAlert className="w-5 h-5 text-red-300" />
            : isFilm ? <span className="text-lg">🏷️</span>
            : isWarning ? <AlertTriangle className="w-5 h-5 text-amber-300" />
            : <BellRing className="w-5 h-5 text-emerald-300 animate-pulse" />}
          </div>

          <div className="flex-1 min-w-0 pr-12">
            <div className="flex items-center gap-2 flex-wrap">
              <span 
                style={{ color: '#ffffff' }}
                className={cn(
                  "text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md tracking-wider font-mono shadow-sm backdrop-blur-md",
                  isUrgent ? "bg-red-500/60 border border-red-400/80"
                  : isFilm ? "bg-rose-500/60 border border-rose-400/80"
                  : isWarning ? "bg-amber-500/60 border border-amber-400/80"
                  : "bg-emerald-500/60 border border-emerald-400/80"
                )}
              >
                {activeAlert.sender} → {activeAlert.targetLine === "ALL" ? "TODAS LAS LÍNEAS" : activeAlert.targetLine}
              </span>
            </div>

            <h4 
              style={{ color: '#ffffff' }}
              className="text-base sm:text-lg font-black !text-white mt-1.5 leading-snug drop-shadow-md tracking-tight"
            >
              {activeAlert.title}
            </h4>
            <p 
              style={{ color: '#f8fafc' }}
              className="text-xs sm:text-sm font-semibold !text-slate-100 mt-1 leading-relaxed whitespace-pre-wrap"
            >
              {activeAlert.message}
            </p>
          </div>

          {/* Botones de control estilo Mac / iOS */}
          <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
            <button
              onClick={() => setActiveAlert(null)}
              className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center group border border-black/20 shadow-sm cursor-pointer transition-transform hover:scale-110"
              title="Cerrar aviso"
              type="button"
            >
              <X className="w-2.5 h-2.5 text-black/60 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/20 shadow-sm opacity-60"></div>
            <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/20 shadow-sm opacity-60"></div>
          </div>
        </div>

        <div className="mt-3.5 pt-3 border-t border-white/15 flex justify-end">
          <button
            onClick={() => setActiveAlert(null)}
            className={cn(
              "text-xs font-black px-4 py-2 rounded-xl transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md",
              isUrgent ? "bg-red-500 hover:bg-red-400 text-white"
              : isFilm ? "bg-rose-500 hover:bg-rose-400 text-white"
              : isWarning ? "bg-amber-500 hover:bg-amber-400 text-black font-black"
              : "bg-emerald-400 hover:bg-emerald-300 text-[#042416] font-black"
            )}
          >
            Entendido ✓
          </button>
        </div>
      </div>
    </div>
  );
}
