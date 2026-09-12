"use client";

import { Toaster } from "sileo";

export function SileoToasterWrapper() {
  return (
    <Toaster
      position="bottom-right"
      offset={{ bottom: 24, right: 24 }}
      theme="system"
    />
  );
}
