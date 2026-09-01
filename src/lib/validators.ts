import { z } from "zod";

/**
 * Esquema para OCR de órdenes de fabricación
 * Solo acepta imágenes Base64 seguras en formato Data URL con mime types permitidos.
 * Limita el tamaño a ~7MB en Base64 (~5MB binario).
 */
export const OcrRequestSchema = z.object({
  image: z
    .string()
    .min(10, "La imagen no puede estar vacía")
    .max(7 * 1024 * 1024, "La imagen excede el límite máximo permitido de 5MB")
    .refine(
      (val) => /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(val),
      "Formato de imagen no soportado. Solo se permiten imágenes PNG, JPEG o WebP en formato Data URL seguro"
    ),
});

/**
 * Esquema para la API de detección de anomalías con IA
 */
export const AnomalyRequestSchema = z.object({
  lineCode: z.string().min(1).max(20),
  saladName: z.string().min(1).max(100),
  expectedMinutes: z.number().positive().max(300),
  elapsedMinutes: z.number().nonnegative().max(1440),
  completedPallets: z.number().int().nonnegative().max(1000),
  totalPallets: z.number().int().positive().max(1000),
});

/**
 * Esquema de respuesta estricto para extracción OCR
 */
export const ExtractedFormatSchema = z.object({
  boxType: z.string().default("Cartón 4"),
  quantity: z.number().int().nonnegative().default(0),
  noblejas: z.number().int().nonnegative().default(0),
  boxesPerPallet: z.number().int().positive().default(70),
  lote: z.string().optional().default(""),
  cambioLote: z.boolean().optional().default(false),
  linea: z.string().optional().default(""),
  codigo10e: z.string().optional().default(""),
});

export const ExtractedSaladSchema = z.object({
  name: z.string().min(1),
  formats: z.array(ExtractedFormatSchema).default([]),
});

export const ExtractedOcrResultSchema = z.object({
  salads: z.array(ExtractedSaladSchema).default([]),
});

export type OcrRequest = z.infer<typeof OcrRequestSchema>;
export type AnomalyRequest = z.infer<typeof AnomalyRequestSchema>;
export type ExtractedOcrResult = z.infer<typeof ExtractedOcrResultSchema>;
