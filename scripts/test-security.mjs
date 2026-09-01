/**
 * Script de validación automatizada de seguridad y lógica de negocio
 * Ejecutar con: node scripts/test-security.mjs
 */

import { z } from "zod";

console.log("==========================================");
console.log("🧪 INICIANDO TEST SUITE DE SEGURIDAD");
console.log("==========================================");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// 1. Validar OcrRequestSchema contra ataques SSRF y URLs arbitrarias
const OcrRequestSchema = z.object({
  image: z
    .string()
    .min(10)
    .max(7 * 1024 * 1024)
    .refine(
      (val) => /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(val),
      "Solo se permiten Data URLs seguras"
    ),
});

console.log("\n[Test 1] Validación de imágenes en OCR:");
assert(
  !OcrRequestSchema.safeParse({ image: "http://169.254.169.254/latest/meta-data/" }).success,
  "Rechaza URLs HTTP/SSRF arbitrarias"
);
assert(
  !OcrRequestSchema.safeParse({ image: "file:///etc/passwd" }).success,
  "Rechaza URLs locales de archivos"
);
assert(
  OcrRequestSchema.safeParse({ image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }).success,
  "Acepta Data URL PNG en Base64 válida"
);
assert(
  OcrRequestSchema.safeParse({ image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=" }).success,
  "Acepta Data URL JPEG en Base64 válida"
);

// 2. Validar AnomalyRequestSchema contra valores fuera de rango o negativos
const AnomalyRequestSchema = z.object({
  lineCode: z.string().min(1).max(20),
  saladName: z.string().min(1).max(100),
  expectedMinutes: z.number().positive().max(300),
  elapsedMinutes: z.number().nonnegative().max(1440),
  completedPallets: z.number().int().nonnegative().max(1000),
  totalPallets: z.number().int().positive().max(1000),
});

console.log("\n[Test 2] Validación de parámetros de Anomalías IA:");
assert(
  !AnomalyRequestSchema.safeParse({
    lineCode: "K01",
    saladName: "César",
    expectedMinutes: -5,
    elapsedMinutes: 10,
    completedPallets: 0,
    totalPallets: 10,
  }).success,
  "Rechaza cadencias esperadas negativas"
);
assert(
  !AnomalyRequestSchema.safeParse({
    lineCode: "K01",
    saladName: "César",
    expectedMinutes: 15,
    elapsedMinutes: -2,
    completedPallets: 0,
    totalPallets: 10,
  }).success,
  "Rechaza minutos transcurridos negativos"
);
assert(
  AnomalyRequestSchema.safeParse({
    lineCode: "K01",
    saladName: "César 300G",
    expectedMinutes: 12.5,
    elapsedMinutes: 28,
    completedPallets: 2,
    totalPallets: 8,
  }).success,
  "Acepta parámetros de anomalía válidos y coherentes"
);

// 3. Validar función de cálculo de formato y palets
function calculateFormat(format) {
  const bpp = format.boxesPerPallet || 1;
  const production = Math.max(0, format.quantity - (format.noblejas || 0));
  const pallets = Math.floor(production / bpp);
  const pico = production % bpp;
  return { production, pallets, pico };
}

console.log("\n[Test 3] Cálculo de palets y picos industriales:");
const calc1 = calculateFormat({ quantity: 150, noblejas: 10, boxesPerPallet: 70 });
assert(calc1.production === 140 && calc1.pallets === 2 && calc1.pico === 0, "150 cajas - 10 noblejas @ 70/palet = 2 palets y 0 pico");

const calc2 = calculateFormat({ quantity: 155, noblejas: 0, boxesPerPallet: 70 });
assert(calc2.production === 155 && calc2.pallets === 2 && calc2.pico === 15, "155 cajas @ 70/palet = 2 palets y 15 cajas de pico");

const calc3 = calculateFormat({ quantity: 50, noblejas: 50, boxesPerPallet: 70 });
assert(calc3.production === 0 && calc3.pallets === 0 && calc3.pico === 0, "Orden 100% noblejas = 0 producción Milagro");

// 4. Normalización de emails de autenticación de planta
function formatAuthEmail(identifier) {
  const clean = identifier.trim().toLowerCase();
  if (clean.includes("@")) return clean;
  return `${clean}@planta.local`;
}

console.log("\n[Test 4] Normalización de credenciales de usuario:");
assert(formatAuthEmail("operador_k01") === "operador_k01@planta.local", "Convierte alias 'operador_k01' a 'operador_k01@planta.local'");
assert(formatAuthEmail("admin@florette.es") === "admin@florette.es", "Mantiene emails válidos existentes");

console.log("\n==========================================");
console.log(`RESUMEN: ${passed} pasados, ${failed} fallidos`);
console.log("==========================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
