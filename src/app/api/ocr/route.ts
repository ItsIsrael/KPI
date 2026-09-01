import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyUserToken } from "@/lib/supabase-server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limiter";
import { OcrRequestSchema, ExtractedOcrResultSchema } from "@/lib/validators";

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!openai) {
    openai = new OpenAI({
      apiKey: key,
      timeout: 25000,
      maxRetries: 1,
    });
  }
  return openai;
}

export const maxDuration = 45;

export async function POST(req: Request) {
  try {
    // 1. Verificación de Autenticación y Autorización
    const authHeader = req.headers.get("authorization");
    const { user, error: authError } = await verifyUserToken(authHeader);

    if (authError || !user) {
      return NextResponse.json(
        { error: "No autorizado. Se requiere iniciar sesión para acceder al servicio OCR." },
        { status: 401 }
      );
    }

    // 2. Rate Limiting por usuario / IP (máximo 10 peticiones por minuto)
    const clientIp = getClientIp(req);
    const rateLimitKey = `ocr:${user.id || clientIp}`;
    const rateLimit = checkRateLimit(rateLimitKey, {
      windowMs: 60 * 1000,
      maxRequests: 10,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Has superado el límite de solicitudes OCR por minuto. Por favor, espera unos segundos." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
            "X-RateLimit-Limit": rateLimit.totalLimit.toString(),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // 3. Validación de Payload con Zod
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Cuerpo de solicitud JSON inválido" }, { status: 400 });
    }

    const parseResult = OcrRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => i.message).join(", ");
      return NextResponse.json({ error: `Validación fallida: ${issues}` }, { status: 400 });
    }

    const { image } = parseResult.data;

    // 4. Verificación de cliente OpenAI configurado
    const client = getOpenAIClient();
    if (!client) {
      return NextResponse.json(
        { error: "El servicio de Inteligencia Artificial OCR no está configurado en el servidor." },
        { status: 503 }
      );
    }

    // 5. Llamada segura a OpenAI con timeout controlado
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Eres un experto planificador de producción industrial. Tu tarea es analizar una foto de una hoja de planificación de fábrica (fotocopia de un Excel con Órdenes de Fabricación) y extraer estructuradamente las ensaladas a producir y sus respectivos formatos.

Columnas típicas de izquierda a derecha:
1. Código 10d (Código interno)
2. Código 10E (Código de formato, ej. 10E123)
3. Nombre de la Ensalada (Ej. "César", "Pasta")
4. Cantidad (Número total de cajas)
5. Tipo de caja (Ej. "Cartón 4", "Cartón 6", "Plástico")
6. Línea de producción (Ej. "K01", "K03")

Reglas estrictas:
1. Asocia cada ensalada con su cantidad y tipo de caja.
2. Extrae el código 10E en mayúsculas.
3. Si hay mención a Noblejas, anota la cantidad (si no, 0).
4. Si hay lote, anótalo y marca cambioLote: true.
5. Identifica la línea (K00, K01, K02, K03) si aparece.

Devuelve EXACTAMENTE un objeto JSON con la estructura:
{
  "salads": [
    {
      "name": "NOMBRE ENSALADA",
      "formats": [
        {
          "boxType": "Cartón 4",
          "quantity": 100,
          "noblejas": 0,
          "boxesPerPallet": 70,
          "lote": "L-1234",
          "cambioLote": true,
          "linea": "K01",
          "codigo10e": "10E123"
        }
      ]
    }
  ]
}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae las órdenes de fabricación de esta imagen." },
            {
              type: "image_url",
              image_url: {
                url: image,
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ salads: [] });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "Respuesta de IA no estructurada" }, { status: 502 });
    }

    const validatedResult = ExtractedOcrResultSchema.safeParse(parsed);
    if (!validatedResult.success) {
      return NextResponse.json({ salads: [] });
    }

    return NextResponse.json(validatedResult.data);
  } catch (error: unknown) {
    // Registro de error seguro en servidor sin filtrar detalles al cliente
    console.error("Error en endpoint /api/ocr:", error instanceof Error ? error.message : "Error desconocido");
    return NextResponse.json(
      { error: "Ocurrió un error al procesar la imagen con OCR. Inténtalo de nuevo." },
      { status: 500 }
    );
  }
}
