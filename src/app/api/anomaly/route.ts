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

    if (!openai || !process.env.OPENAI_API_KEY) {
      // Fallback sin IA
      return NextResponse.json({
        message: `⚠️ La ${lineCode} lleva ${elapsedMinutes}m sin marcar palet. Lo normal es ~${expectedMinutes}m. ¿Se os olvidó dar al botón?`,
        level: elapsedMinutes > expectedMinutes * 2 ? "critical" : "warning"
      });
    }

    const prompt = `Eres el asistente de control de una fábrica de ensaladas en España. Hablas de forma directa y coloquial, como un encargado de turno. Máximo 2 frases cortas.

Contexto: La línea ${lineCode} está produciendo "${saladName}". 
- Llevan ${elapsedMinutes} minutos sin registrar un palet.
- Su ritmo habitual es un palet cada ${expectedMinutes} minutos.
- Van ${completedPallets} de ${totalPallets} palets completados.

Genera un aviso breve y directo (sin emojis al inicio, sin saludos) para recordarles que quizás se olvidaron de marcar el palet completado. Si el retraso es grande (más del doble del ritmo normal), sé más urgente.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
      temperature: 0.7,
    });

    const message = response.choices[0]?.message?.content?.trim() || "";
    const level = elapsedMinutes > expectedMinutes * 2 ? "critical" : "warning";

    return NextResponse.json({ message, level });
  } catch (e) {
    console.error("Anomaly AI error:", e);
    return NextResponse.json({ message: "Revisa el panel — puede que haya un palet sin marcar.", level: "warning" });
  }
}
