"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, X, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useProductionStore } from "@/store/production-store";
import { cn } from "@/lib/utils";
import type { Salad } from "@/types/types";

interface OcrScannerProps {
  onClose: () => void;
  targetLineCode: string;
}

export function OcrScanner({ onClose, targetLineCode }: OcrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedSalads, setExtractedSalads] = useState<Salad[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { goldMode, addSalad } = useProductionStore();

  const startCamera = async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" } // Prefer back camera
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setError("No se pudo acceder a la cámara. Revisa los permisos.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedImage(imageData);
      stopCamera();
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setExtractedSalads(null);
    setError(null);
    startCamera();
  };

  const processImage = async () => {
    if (!capturedImage) return;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: capturedImage }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Error al procesar la imagen");
      }
      
      if (data.salads && Array.isArray(data.salads)) {
        setExtractedSalads(data.salads);
      } else {
        throw new Error("Formato de respuesta inválido desde la IA");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Fallo de conexión con la IA");
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmAndAdd = () => {
    if (!extractedSalads) return;
    
    // Add each extracted salad to the store
    extractedSalads.forEach(salad => {
      // Generate IDs for new elements
      const newSalad: Salad = {
        ...salad,
        id: crypto.randomUUID(),
        formats: salad.formats.map(f => ({
          ...f,
          id: crypto.randomUUID(),
          linea: targetLineCode
        }))
      };
      addSalad(newSalad, targetLineCode);
    });
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={cn(
        "relative w-full max-w-3xl overflow-hidden rounded-3xl border shadow-2xl flex flex-col max-h-[90vh]",
        goldMode ? "bg-[#120e06] border-amber-500/30" : "bg-white border-slate-200"
      )}>
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between p-4 border-b",
          goldMode ? "border-white/10" : "border-slate-100"
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-2 rounded-xl",
              goldMode ? "bg-amber-500/20 text-amber-400" : "bg-emerald-100 text-emerald-600"
            )}>
              <Camera className="w-5 h-5" />
            </div>
            <h2 className={cn("text-lg font-bold", goldMode ? "text-white" : "text-slate-900")}>
              Carga Inteligente de OFs
            </h2>
          </div>
          <button 
            onClick={onClose}
            className={cn(
              "p-2 rounded-xl transition-colors",
              goldMode ? "hover:bg-white/10 text-white/50 hover:text-white" : "hover:bg-slate-100 text-slate-500"
            )}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium">
              {error}
            </div>
          )}

          {!capturedImage ? (
            <div className="relative w-full aspect-[4/3] sm:aspect-video bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              {/* Guides Overlay */}
              <div className="absolute inset-0 border-4 border-emerald-500/30 border-dashed rounded-2xl pointer-events-none m-4" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-white/50 font-medium text-sm bg-black/50 px-3 py-1 rounded-full backdrop-blur-md">
                  Encuadra la hoja de OFs aquí
                </p>
              </div>
            </div>
          ) : (
            <div className="relative w-full aspect-[4/3] sm:aspect-video bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
              <img 
                src={capturedImage} 
                alt="Captured document" 
                className={cn("w-full h-full object-contain", isProcessing && "opacity-50 blur-sm grayscale")}
              />
              
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm gap-3">
                  <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
                  <p className="text-emerald-300 font-bold animate-pulse">Procesando hoja con IA...</p>
                  <p className="text-white/60 text-xs">Identificando códigos 10d y 10e</p>
                </div>
              )}
            </div>
          )}
          
          <canvas ref={canvasRef} className="hidden" />

          {/* Results Table */}
          {extractedSalads && !isProcessing && (
            <div className={cn(
              "rounded-2xl p-4 border animate-in slide-in-from-bottom-4",
              goldMode ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200"
            )}>
              <h3 className={cn("text-sm font-bold uppercase tracking-wider mb-3", goldMode ? "text-emerald-400" : "text-emerald-600")}>
                Ensaladas Detectadas ({extractedSalads.length})
              </h3>
              
              {extractedSalads.length === 0 ? (
                <p className="text-sm text-slate-500">No se encontraron ensaladas válidas.</p>
              ) : (
                <div className="space-y-3">
                  {extractedSalads.map((salad, idx) => (
                    <div key={idx} className={cn("p-3 rounded-xl border", goldMode ? "bg-black/50 border-white/10" : "bg-white border-slate-200")}>
                      <h4 className={cn("font-bold mb-2", goldMode ? "text-white" : "text-slate-900")}>🥗 {salad.name}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {salad.formats.map((format, fidx) => (
                          <div key={fidx} className={cn("text-xs p-2 rounded-lg", goldMode ? "bg-white/5" : "bg-slate-50")}>
                            <p><span className="font-semibold opacity-70">Caja:</span> {format.boxType}</p>
                            <p><span className="font-semibold opacity-70">Cantidad:</span> <span className="font-bold text-emerald-500">{format.quantity}</span> cajas</p>
                            {format.noblejas > 0 && <p><span className="font-semibold opacity-70">Noblejas:</span> {format.noblejas} cajas</p>}
                            {format.lote && <p><span className="font-semibold opacity-70">Lote:</span> {format.lote}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={cn(
          "p-4 border-t flex flex-col sm:flex-row gap-3",
          goldMode ? "border-white/10 bg-[#0a0804]" : "border-slate-100 bg-slate-50/50"
        )}>
          {!capturedImage ? (
            <>
              <button
                onClick={onClose}
                className={cn(
                  "flex-1 py-3.5 rounded-xl font-bold transition-all active:scale-95",
                  goldMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
                )}
              >
                Cancelar
              </button>
              <button
                onClick={capturePhoto}
                className="flex-[2] py-3.5 rounded-xl font-black bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                TOMAR FOTO
              </button>
            </>
          ) : !extractedSalads ? (
            <>
              <button
                onClick={retakePhoto}
                disabled={isProcessing}
                className={cn(
                  "flex-1 py-3.5 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2",
                  goldMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700",
                  isProcessing && "opacity-50 cursor-not-allowed"
                )}
              >
                <RefreshCw className="w-4 h-4" />
                Repetir
              </button>
              <button
                onClick={processImage}
                disabled={isProcessing}
                className="flex-[2] py-3.5 rounded-xl font-black bg-purple-500 hover:bg-purple-600 text-white shadow-lg shadow-purple-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isProcessing ? "ANALIZANDO..." : "ANALIZAR CON IA"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={retakePhoto}
                className={cn(
                  "flex-1 py-3.5 rounded-xl font-bold transition-all active:scale-95",
                  goldMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
                )}
              >
                Tomar Otra
              </button>
              <button
                onClick={confirmAndAdd}
                disabled={extractedSalads.length === 0}
                className="flex-[2] py-3.5 rounded-xl font-black bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Check className="w-5 h-5" />
                AÑADIR A LA LÍNEA
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Ensure Sparkles icon is used, we need to import it at the top. I'll add it to the import statement.
