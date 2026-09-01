import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyUserToken } from "@/lib/supabase-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { AnomalyRequestSchema } from "@/lib/validators";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!openai) {
    openai = new OpenAI({
      apiKey: key,
      timeout: 10000,
      maxRetries: 1,
    });
  }
  return openai;
}

export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    // 1. Verificación de Autenticación
    const authHeader = req.headers.get("authorization");
    const { user, error: authError } = await verifyUserToken(authHeader);

    if (authError || !user) {
      return NextResponse.json(
        { error: "No autorizado. Se requiere autenticación." },
        { status: 401 }
      );
    }

    // 2. Rate Limiting (30 reqs/min)
    const clientIp = getClientIp(req);
    const rateLimitKey = `anomaly:${user.id || clientIp}`;
    const rateLimit = checkRateLimit(rateLimitKey, {
      windowMs: 60 * 1000,
      maxRequests: 30,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Límite de solicitudes de análisis alcanzado." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    // 3. Validación Zod
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parseResult = AnomalyRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Parámetros de análisis de anomalía inválidos" },
        { status: 400 }
      );
    }

    const {
      lineCode,
      saladName,
      expectedMinutes,
      elapsedMinutes,
      completedPallets,
      totalPallets,
    } = parseResult.data;

    const fallbackLevel = elapsedMinutes > expectedMinutes * 1.8 ? "critical" : "warning";
    const fallbackMessage = `Aviso de supervisión en ${lineCode}: Se han registrado ${elapsedMinutes} minutos de ciclo para la orden de ${saladName}. Por favor, verifique el estado del palet en la línea.`;

    const client = getOpenAIClient();
    if (!client) {
      return NextResponse.json({
        message: fallbackMessage,
        level: fallbackLevel,
      });
    }

    const prompt = `Eres el sistema inteligente de monitorización y control de planta de producción industrial (L.I.A). Comunícate de manera formal, profesional y respetuosa, con tono de supervisión de operaciones. Máximo 2 frases claras y concisas.

Contexto operativo:
- Línea de producción: ${lineCode}
- Producto en curso: "${saladName}"
- Tiempo transcurrido sin registro de palet: ${elapsedMinutes} minutos
- Cadencia habitual de la línea: un palet cada ~${expectedMinutes} minutos
- Avance de la orden: ${completedPallets} de ${totalPallets} palets completados

Instrucciones:
Redacta una notificación formal indicando que se ha detectado una desviación de tiempo superior a la habitual en la línea y solicitando al responsable confirmar si el palet ya ha finalizado o verificar el estado de la línea. Mantén un lenguaje sobrio y técnico.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 90,
      temperature: 0.4,
    });

    const message = response.choices[0]?.message?.content?.trim() || fallbackMessage;
    const level = elapsedMinutes > expectedMinutes * 2 ? "critical" : "warning";

    return NextResponse.json({ message, level });
  } catch (e: unknown) {
    console.error("Error en /api/anomaly:", e instanceof Error ? e.message : "Error desconocido");
    return NextResponse.json({
      message: "Aviso de supervisión: Se ha superado el tiempo estimado de producción para el palet actual. Por favor, verifique el registro en el panel.",
      level: "warning",
    });
  }
}
