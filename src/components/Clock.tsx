"use client";

import { useState, useEffect } from "react";

export function Clock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTime(new Date());
    }, 0);
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  if (!time) {
    return (
      <div className="flex flex-col items-end leading-none font-mono">
        <span className="text-2xl font-black text-white">--:--</span>
      </div>
    );
  }

  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");
  const isEvenSecond = time.getSeconds() % 2 === 0;

  // Formato: "sábado, 27 jun"
  const dayName = time.toLocaleDateString("es-ES", { weekday: "long" });
  const dayNum = time.getDate();
  const monthName = time.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
  const dateStr = `${dayName}, ${dayNum} ${monthName}`;

  return (
    <div className="flex flex-col items-end leading-none">
      {/* Horas:Minutos:Segundos al estilo reloj digital premium con brillo y colon parpadeante */}
      <div className="font-mono text-lg sm:text-2xl md:text-3xl lg:text-4xl font-black tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)] tabular-nums flex items-baseline select-none">
        <span>{hours}</span>
        <span className={`transition-opacity duration-300 mx-0.5 ${isEvenSecond ? "opacity-100" : "opacity-25"}`}>:</span>
        <span>{minutes}</span>
        <span className="text-xs sm:text-sm md:text-lg lg:text-xl text-white/30 ml-0.5 font-bold">
          :{seconds}
        </span>
      </div>
      {/* Fecha elegante */}
      <span className="text-[7.5px] sm:text-[9px] md:text-xs text-white/45 font-bold uppercase tracking-[0.12em] mt-0.5 select-none">
        {dateStr}
      </span>
    </div>
  );
}
