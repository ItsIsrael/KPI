"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useProductionStore } from "@/store/production-store";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

const calculate = (a: number, b: number, op: string): number => {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b !== 0 ? a / b : NaN;
    default: return b;
  }
};

const formatResult = (num: number): string => {
  if (isNaN(num)) return "Error";
  if (!isFinite(num)) return "Error";
  const str = String(num);
  if (str.length <= 12) return str;
  if (Math.abs(num) >= 1e9 || (Math.abs(num) < 1e-6 && num !== 0)) {
    return num.toExponential(5);
  }
  const precisionStr = num.toPrecision(9);
  if (precisionStr.includes(".")) return parseFloat(precisionStr).toString();
  return precisionStr;
};

const formatDisplay = (val: string) => {
  if (val === "Error" || val === "NaN" || val === "Infinity") return val;
  if (val.includes("e")) return val;
  const parts = val.split(".");
  const integerPart = parts[0];
  const decimalPart = parts.length > 1 ? parts[1] : null;
  const num = parseFloat(integerPart);
  if (isNaN(num)) return val;
  const formattedInteger = num.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const prefix = integerPart.startsWith("-") && num === 0 ? "-" : "";
  return decimalPart !== null
    ? `${prefix}${formattedInteger}.${decimalPart}`
    : `${prefix}${formattedInteger}`;
};

export function Calculator() {
  const { showCalculator, toggleCalculator, goldMode } = useProductionStore();
  const [isMinimized, setIsMinimized] = useState(false);
  const [display, setDisplay] = useState("0");
  const [operand, setOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [copied, setCopied] = useState(false);

  // Posición para drag
  const [pos, setPos] = useState({ x: 0, y: 0 }); // offset desde posición inicial (top-right)
  const dragging = useRef(false);
  const startDrag = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // === Drag handlers (mouse) ===
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".drag-handle")) return;
    e.preventDefault();
    dragging.current = true;
    startDrag.current = { mouseX: e.clientX, mouseY: e.clientY, posX: pos.x, posY: pos.y };
  }, [pos]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - startDrag.current.mouseX;
      const dy = e.clientY - startDrag.current.mouseY;
      setPos({ x: startDrag.current.posX + dx, y: startDrag.current.posY + dy });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // === Drag handlers (touch) ===
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".drag-handle")) return;
    const t = e.touches[0];
    dragging.current = true;
    startDrag.current = { mouseX: t.clientX, mouseY: t.clientY, posX: pos.x, posY: pos.y };
  }, [pos]);

  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return;
      const t = e.touches[0];
      const dx = t.clientX - startDrag.current.mouseX;
      const dy = t.clientY - startDrag.current.mouseY;
      setPos({ x: startDrag.current.posX + dx, y: startDrag.current.posY + dy });
    };
    const onTouchEnd = () => { dragging.current = false; };
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // === Calculator logic ===
  const handleNumber = useCallback((num: string) => {
    if (waitingForOperand) {
      setDisplay(num);
      setWaitingForOperand(false);
    } else {
      const digitsCount = display.replace(/[^0-9]/g, "").length;
      if (digitsCount >= 9) return;
      setDisplay((prev) => (prev === "0" ? num : prev + num));
    }
  }, [display, waitingForOperand]);

  const handleDot = useCallback(() => {
    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
    } else if (!display.includes(".")) {
      setDisplay((prev) => prev + ".");
    }
  }, [display, waitingForOperand]);

  const handleOperation = useCallback((op: string) => {
    const current = parseFloat(display);
    if (operand !== null && operator && !waitingForOperand) {
      const result = calculate(operand, current, operator);
      setDisplay(formatResult(result));
      setOperand(result);
    } else {
      setOperand(current);
    }
    setOperator(op);
    setWaitingForOperand(true);
  }, [display, operand, operator, waitingForOperand]);

  const handleEquals = useCallback(() => {
    if (operand === null || !operator) return;
    const current = parseFloat(display);
    const result = calculate(operand, current, operator);
    setDisplay(formatResult(result));
    setOperand(null);
    setOperator(null);
    setWaitingForOperand(true);
  }, [display, operand, operator]);

  const handleClear = useCallback(() => {
    setDisplay("0");
    if (display === "0") {
      setOperand(null);
      setOperator(null);
      setWaitingForOperand(false);
    }
  }, [display]);

  const handleToggleSign = useCallback(() => {
    setDisplay((prev) => {
      if (prev === "0") return prev;
      return prev.startsWith("-") ? prev.slice(1) : "-" + prev;
    });
  }, []);

  const handlePercent = useCallback(() => {
    const current = parseFloat(display);
    if (isNaN(current)) return;
    setDisplay(formatResult(current / 100));
    setWaitingForOperand(true);
  }, [display]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(display);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [display]);

  // Keyboard
  useEffect(() => {
    if (!showCalculator || isMinimized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      const key = e.key;
      if (/[0-9]/.test(key)) { e.preventDefault(); handleNumber(key); }
      else if (key === ".") { e.preventDefault(); handleDot(); }
      else if (key === "+") { e.preventDefault(); handleOperation("+"); }
      else if (key === "-") { e.preventDefault(); handleOperation("-"); }
      else if (key === "*" || key === "x" || key === "X") { e.preventDefault(); handleOperation("×"); }
      else if (key === "/") { e.preventDefault(); handleOperation("÷"); }
      else if (key === "Enter" || key === "=") { e.preventDefault(); handleEquals(); }
      else if (key === "Backspace") {
        e.preventDefault();
        setDisplay((prev) => (prev.length <= 1 || prev === "Error" ? "0" : prev.slice(0, -1)));
      }
      else if (key === "%") { e.preventDefault(); handlePercent(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCalculator, isMinimized, handleNumber, handleDot, handleOperation, handleEquals, handlePercent]);

  if (!showCalculator) return null;

  const baseBtn = "rounded-full flex items-center justify-center font-medium transition-all duration-150 active:scale-95 select-none focus:outline-none cursor-pointer";
  const numBtn = cn(baseBtn, "w-14 h-14 sm:w-16 sm:h-16 text-xl sm:text-2xl border", goldMode ? "bg-white/5 border-white/5 text-white hover:bg-white/15" : "bg-emerald-50/50 border-emerald-200/50 text-emerald-950 hover:bg-emerald-100/50");
  const topBtn = cn(baseBtn, "w-14 h-14 sm:w-16 sm:h-16 text-xl sm:text-2xl border", goldMode ? "bg-white/15 border-white/10 text-white/90 hover:bg-white/25" : "bg-white border-emerald-200/50 text-emerald-950 hover:bg-emerald-50");
  const activeOpBtn = cn(baseBtn, "w-14 h-14 sm:w-16 sm:h-16 text-xl sm:text-2xl border", goldMode ? "bg-white text-orange-500 border-white" : "bg-orange-500 text-white border-orange-500");
  const inactiveOpBtn = cn(baseBtn, "w-14 h-14 sm:w-16 sm:h-16 text-xl sm:text-2xl border", goldMode ? "bg-orange-500/80 border-orange-500/20 text-white hover:bg-orange-500" : "bg-orange-400 border-orange-400 text-white hover:bg-orange-500");

  // Posición absoluta
  const style: React.CSSProperties = {
    position: "fixed",
    top: `${16 + pos.y}px`,
    right: `${16 - pos.x}px`,
    zIndex: 80,
    userSelect: "none",
  };

  return (
    <div ref={panelRef} style={style} className="w-[calc(100vw-2rem)] max-w-[300px] sm:max-w-[320px]">
      {/* Panel con Glassmorphism */}
      <div
        className={cn(
          "glass-card backdrop-blur-2xl bg-slate-950/60 border border-white/15 rounded-3xl shadow-2xl shadow-slate-950/50 overflow-hidden transition-all duration-300",
          isMinimized ? "p-2" : "p-5"
        )}
      >
        {/* Barra de título — drag-handle */}
        <div
          className={cn(
            "flex items-center gap-1.5 drag-handle cursor-grab active:cursor-grabbing",
            isMinimized ? "mb-0" : "mb-2"
          )}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {/* Botones de ventana */}
          <div
            onClick={toggleCalculator}
            className="w-3 h-3 rounded-full bg-[#ff5f56]/90 hover:bg-[#e04f47] transition-colors cursor-pointer shrink-0"
            title="Cerrar"
          />
          <div
            onClick={() => setIsMinimized((v) => !v)}
            className="w-3 h-3 rounded-full bg-[#ffbd2e]/90 hover:bg-[#e0a82a] transition-colors cursor-pointer shrink-0"
            title={isMinimized ? "Expandir" : "Minimizar"}
          />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]/90 shrink-0" />

          {/* Título — sin el nombre "Calculadora" */}
          <span className={cn(
            "ml-1.5 text-white/30 font-mono select-none transition-all duration-200",
            isMinimized ? "text-xs" : "text-[10px]"
          )}>
            {isMinimized ? formatDisplay(display) : ""}
          </span>
        </div>

        {/* Display — solo visible cuando expandido */}
        {!isMinimized && (
          <>
            <div className="relative group text-right select-none h-20 flex flex-col justify-end px-2 mt-2">
              {operand !== null && operator && (
                <div className="text-xs font-mono text-white/30 absolute top-0 right-2">
                  {operand} {operator}
                </div>
              )}
              <div className="text-4xl sm:text-5xl font-light text-white tracking-tight tabular-nums truncate">
                {formatDisplay(display)}
              </div>
              <button
                onClick={handleCopy}
                className="absolute top-0 left-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-opacity duration-150 opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Copiar"
                type="button"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Teclado Glassmorphism original */}
            <div className="grid grid-cols-4 gap-2 justify-items-center mt-4">
              <button onClick={handleClear} className={topBtn} type="button">{display === "0" ? "AC" : "C"}</button>
              <button onClick={handleToggleSign} className={topBtn} type="button">+/-</button>
              <button onClick={handlePercent} className={topBtn} type="button">%</button>
              <button onClick={() => handleOperation("÷")} className={operator === "÷" && waitingForOperand ? activeOpBtn : inactiveOpBtn} type="button">÷</button>

              <button onClick={() => handleNumber("7")} className={numBtn} type="button">7</button>
              <button onClick={() => handleNumber("8")} className={numBtn} type="button">8</button>
              <button onClick={() => handleNumber("9")} className={numBtn} type="button">9</button>
              <button onClick={() => handleOperation("×")} className={operator === "×" && waitingForOperand ? activeOpBtn : inactiveOpBtn} type="button">×</button>

              <button onClick={() => handleNumber("4")} className={numBtn} type="button">4</button>
              <button onClick={() => handleNumber("5")} className={numBtn} type="button">5</button>
              <button onClick={() => handleNumber("6")} className={numBtn} type="button">6</button>
              <button onClick={() => handleOperation("-")} className={operator === "-" && waitingForOperand ? activeOpBtn : inactiveOpBtn} type="button">−</button>

              <button onClick={() => handleNumber("1")} className={numBtn} type="button">1</button>
              <button onClick={() => handleNumber("2")} className={numBtn} type="button">2</button>
              <button onClick={() => handleNumber("3")} className={numBtn} type="button">3</button>
              <button onClick={() => handleOperation("+")} className={operator === "+" && waitingForOperand ? activeOpBtn : inactiveOpBtn} type="button">+</button>

              <button
                onClick={() => handleNumber("0")}
                className={cn("col-span-2 w-full h-14 sm:h-16 rounded-full flex items-center justify-start pl-6 text-xl sm:text-2xl font-medium transition-all active:scale-95 border cursor-pointer", goldMode ? "bg-white/5 border-white/5 text-white hover:bg-white/15" : "bg-emerald-50/50 border-emerald-200/50 text-emerald-950 hover:bg-emerald-100/50")}
                type="button"
              >0</button>
              <button onClick={handleDot} className={numBtn} type="button">.</button>
              <button onClick={handleEquals} className={inactiveOpBtn} type="button">=</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
