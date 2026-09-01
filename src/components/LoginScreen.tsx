"use client";

import { useState } from "react";
import { useProductionStore } from "@/store/production-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Lock, User, Eye, EyeOff, LogIn } from "lucide-react";
import { signInWithSupabase } from "@/lib/auth";

export function LoginScreen() {
  const setAuthUser = useProductionStore((state) => state.setAuthUser);
  const goldMode = useProductionStore((state) => state.goldMode);
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const { user, error: authError } = await signInWithSupabase(username, password);

      if (authError || !user) {
        setError(authError || "Error al iniciar sesión");
        setShake(true);
        setTimeout(() => setShake(false), 500);
      } else {
        setAuthUser(user);
      }
    } catch {
      setError("Error de conexión con el servidor de autenticación");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn(
      "fixed inset-0 z-[200] flex items-center justify-center px-4 py-8 overflow-y-auto",
      goldMode ? "bg-[#05050a] gold-mode" : "bg-emerald-50/80 backdrop-blur-md"
    )}>
      {/* iOS styled ambient glow blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
        <div className={cn(
          "absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[130px] animate-pulse transition-colors duration-500",
          goldMode ? "bg-amber-500/10" : "bg-emerald-500/10"
        )} style={{ animationDuration: "8s" }} />
        <div className={cn(
          "absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[130px] animate-pulse transition-colors duration-500",
          goldMode ? "bg-orange-500/5" : "bg-teal-500/10"
        )} style={{ animationDuration: "12s" }} />
      </div>

      <div className="relative z-10 w-full max-w-md my-auto">
        <div
          className={cn(
            "glass-card border rounded-[2.5rem] p-8 md:p-10 shadow-2xl transition-all duration-300 backdrop-blur-3xl overflow-hidden",
            shake ? "animate-shake" : "",
            goldMode 
              ? "bg-[#100c06]/85 border-amber-500/30 shadow-[0_0_40px_rgba(245,158,11,0.15)]" 
              : "bg-white/95 border-emerald-200 shadow-[0_0_40px_rgba(16,185,129,0.1)]",
            error ? "border-red-500/40 shadow-red-500/5" : ""
          )}
        >
          {/* Top visual accent */}
          <div className={cn(
            "absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r",
            goldMode ? "from-amber-500 to-yellow-400" : "from-emerald-500 to-teal-400"
          )} />

          {/* Header */}
          <div className="text-center space-y-3 mb-8">
            <div className={cn(
              "w-16 h-16 mx-auto rounded-2xl overflow-hidden border flex items-center justify-center shadow-lg relative group transition-all duration-300",
              goldMode ? "border-amber-500/30 shadow-amber-500/10 bg-black/40" : "border-emerald-200 shadow-emerald-500/10 bg-white"
            )}>
              {goldMode && (
                <span className="absolute inset-0 bg-amber-500/20 animate-pulse pointer-events-none" />
              )}
              <img src="/images/logo.png" className="w-12 h-12 object-cover" alt="L.I.A.R Logo" />
            </div>

            <div className="space-y-1">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center justify-center gap-2">
                <span className={cn(goldMode ? "text-gold-gradient" : "text-emerald-800")}>KPI</span>
                {goldMode && (
                  <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(245,158,11,0.4)] tracking-wide uppercase shrink-0">
                    👑 GOLD
                  </span>
                )}
              </h1>
              <p className={cn("text-xs font-bold uppercase tracking-[0.2em]", goldMode ? "text-white/40" : "text-emerald-700/60")}>
                Control de Acceso de Planta
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username Input */}
            <div className="space-y-1.5">
              <label className={cn("text-[10px] uppercase font-black tracking-widest block pl-1", goldMode ? "text-white/50" : "text-emerald-700/70")}>
                Usuario
              </label>
              <div className="relative">
                <span className={cn("absolute left-4 top-1/2 -translate-y-1/2", goldMode ? "text-white/30" : "text-emerald-500/50")}>
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Introduce usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={cn(
                    "w-full h-13 pl-11 pr-4 rounded-2xl text-sm outline-none transition-all",
                    goldMode 
                      ? "bg-white/[0.03] border border-white/10 text-white placeholder-white/20 focus:border-amber-500/50 focus:bg-amber-500/[0.02] focus:shadow-[0_0_15px_rgba(245,158,11,0.15)]" 
                      : "bg-white border border-emerald-200 text-emerald-900 placeholder-emerald-300 focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
                    error ? (goldMode ? "border-red-500/30 bg-red-500/[0.01]" : "border-red-400 bg-red-50") : ""
                  )}
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className={cn("text-[10px] uppercase font-black tracking-widest block pl-1", goldMode ? "text-white/50" : "text-emerald-700/70")}>
                Contraseña
              </label>
              <div className="relative">
                <span className={cn("absolute left-4 top-1/2 -translate-y-1/2", goldMode ? "text-white/30" : "text-emerald-500/50")}>
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Introduce contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    "w-full h-13 pl-11 pr-12 rounded-2xl text-sm outline-none transition-all",
                    goldMode 
                      ? "bg-white/[0.03] border border-white/10 text-white placeholder-white/20 focus:border-amber-500/50 focus:bg-amber-500/[0.02] focus:shadow-[0_0_15px_rgba(245,158,11,0.15)]" 
                      : "bg-white border border-emerald-200 text-emerald-900 placeholder-emerald-300 focus:border-emerald-500 focus:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
                    error ? (goldMode ? "border-red-500/30 bg-red-500/[0.01]" : "border-red-400 bg-red-50") : ""
                  )}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={cn("absolute right-4 top-1/2 -translate-y-1/2 transition-colors", goldMode ? "text-white/30 hover:text-white/60" : "text-emerald-500/50 hover:text-emerald-700")}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className={cn("border text-xs font-bold px-4 py-3 rounded-2xl text-center animate-fade-in pl-1", goldMode ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-red-50 border-red-200 text-red-600")}>
                ⚠️ {error}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "w-full h-13 text-sm font-black rounded-2xl tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-50",
                goldMode
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black shadow-amber-500/20"
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-emerald-500/20"
              )}
            >
              {isSubmitting ? (
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 border-t-transparent animate-spin",
                  goldMode ? "border-black" : "border-white"
                )} />
              ) : (
                <>
                  <span>ACCEDER AL PANEL</span>
                  <LogIn className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Credentials info helper (Sutil) */}
          <div className={cn("mt-6 pt-5 border-t text-center", goldMode ? "border-white/[0.04]" : "border-emerald-200/50")}>
            <span className={cn("text-[10px] font-medium uppercase tracking-widest", goldMode ? "text-white/15" : "text-emerald-700/40")}>
              Acceso restringido · L.I.A.R KPI 2026
            </span>
          </div>
        </div>
      </div>

      {/* Global Inline Shake Keyframes */}
      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
          20%, 40%, 60%, 80% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>
    </div>
  );
}
