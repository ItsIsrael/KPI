import { NextResponse } from "next/server";
import OpenAI from "openai";

let openai: OpenAI | null = null;

try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
} catch (e) {
  console.warn("Failed to initialize OpenAI client at build time:", e);
}

export const maxDuration = 60; // Allow more time for OpenAI Vision API

export async function POST(req: Request) {
  try {
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!openai || !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API Key is not configured. Add OPENAI_API_KEY to your .env.local file." },
        { status: 500 }
      );
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Eres un experto planificador de producción industrial. Tu tarea es analizar una foto de una hoja de planificación de fábrica (una fotocopia de un Excel con Órdenes de Fabricación) y extraer estructuradamente las ensaladas a producir y sus respectivos formatos (tipos de caja, cantidades, lotes).

Ten en cuenta que la tabla de la fotocopia tiene típicamente esta estructura de columnas, de izquierda a derecha:
1. Código 10d (Código interno de la ensalada, ej. 10d477)
2. Código 10E (Código interno del formato/caja, ej. 10E123)
3. Nombre de la Ensalada (Ej. "César", "Pasta", etc.)
4. Cantidad (Número total de cajas a producir)
5. Tipo de caja (Ej. "Cartón 4", "Cartón 6", "Plástico")
6. Línea de producción (Ej. "Mondini 00", "K01", "K03", etc.) si se indica en la hoja.

Reglas de extracción:
1. Asocia correctamente cada "Nombre de la Ensalada" con su "Cantidad" y "Tipo de caja" correspondientes leyendo la fila de izquierda a derecha. Fíjate muy bien que el tipo de caja suele venir pegado al nombre de la ensalada.
2. Extrae el código "10E" si aparece en la misma fila y guárdalo en "codigo10e" siempre en mayúsculas (ej. "10E123"). Si no hay, déjalo vacío o no lo incluyas.
3. Si ves menciones a "Noblejas" separadas o como columnas adicionales, anota la cantidad. Si no, pon 0.
4. Si encuentras un lote de producción (ej. L-1234), anótalo. Si hay un lote, asume cambioLote: true.
5. Identifica la línea de producción a la que corresponde la orden si aparece especificada (ej. Mondini 00, K01, K03) y asígnala al campo "linea".

Devuelve EXACTAMENTE Y ÚNICAMENTE un objeto JSON válido con la siguiente estructura estricta:
{
  "salads": [
    {
      "name": "NOMBRE ENSALADA EN MAYÚSCULAS",
      "formats": [
        {
          "boxType": "Tipo de Caja (Ej. Cartón 4)",
          "quantity": 100,
          "noblejas": 0,
          "boxesPerPallet": 80,
          "lote": "L-1234A",
          "cambioLote": true,
          "linea": "K01",
          "codigo10e": "10E123"
        }
      ]
    }
  ]
}

Asegúrate de que 'boxesPerPallet' tenga un valor por defecto realista (ej. 70 o 80) dependiendo del tipo de caja, si no aparece explícitamente.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extrae las órdenes de fabricación de esta hoja."
            },
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
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content || "{}");

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("OCR API Error:", error);
    return NextResponse.json({ error: error.message || "Error procesando la imagen" }, { status: 500 });
  }
}
