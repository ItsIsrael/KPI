import { NextResponse } from "next/server";
import OpenAI from "openai";

let openai: OpenAI | null = null;

try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (e) {
  console.warn("Failed to initialize OpenAI:", e);
}

export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    const { lineCode, saladName, expectedMinutes, elapsedMinutes, completedPallets, totalPallets } = await req.json();

    const prompt = `Eres el sistema inteligente de monitorización y control de planta de producción industrial (L.I.A). Comunícate de manera formal, profesional y respetuosa, con tono de supervisión de operaciones. Máximo 2 frases claras y concisas.

Contexto operativo:
- Línea de producción: ${lineCode}
- Producto en curso: "${saladName}"
- Tiempo transcurrido sin registro de palet: ${elapsedMinutes} minutos
- Cadencia habitual de la línea: un palet cada ~${expectedMinutes} minutos
- Avance de la orden: ${completedPallets} de ${totalPallets} palets completados

Instrucciones:
Redacta una notificación formal indicando que se ha detectado una desviación de tiempo superior a la habitual en la línea y solicitando al responsable confirmar si el palet ya ha finalizado o verificar el estado de la línea. No uses saludos informales ni emojis al inicio. Mantén un lenguaje sobrio y técnico.`;

    if (!openai) {
      return NextResponse.json({
        message: `Aviso de supervisión en ${lineCode}: Se han registrado ${elapsedMinutes} minutos de ciclo para la orden de ${saladName}. Por favor, verifique el estado del palet en la línea.`,
        level: elapsedMinutes > expectedMinutes * 1.8 ? "critical" : "warning",
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 90,
      temperature: 0.5,
    });

    const message = response.choices[0]?.message?.content?.trim() || "";
    const level = elapsedMinutes > expectedMinutes * 2 ? "critical" : "warning";

    return NextResponse.json({ message, level });
  } catch (e) {
    console.error("Anomaly AI error:", e);
    return NextResponse.json({ 
      message: "Aviso de supervisión: Se ha superado el tiempo estimado de producción para el palet actual. Por favor, verifique el registro en el panel.", 
      level: "warning" 
    });
  }
}
