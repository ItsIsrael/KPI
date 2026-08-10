"use client";

import { useEffect } from "react";

export function useTabClock() {
  useEffect(() => {
    let showTime = false;

    const updateTitle = () => {
      if (showTime) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, "0");
        const minutes = now.getMinutes().toString().padStart(2, "0");
        const seconds = now.getSeconds().toString().padStart(2, "0");
        document.title = `${hours}:${minutes}:${seconds}`;
      } else {
        document.title = "KPI";
      }
    };

    updateTitle();
    const interval = setInterval(() => {
      showTime = !showTime;
      updateTitle();
    }, 2500);

    return () => {
      clearInterval(interval);
      document.title = "KPI";
    };
  }, []);
}
