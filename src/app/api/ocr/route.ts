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
          content: `Eres un experto planificador de producción industrial. Tu tarea es analizar una foto de una hoja de planificación de fábrica (Órdenes de Fabricación - OF) y extraer estructuradamente las ensaladas a producir y sus respectivos formatos (tipos de caja, cantidades, lotes).

Reglas críticas de identificación de códigos internos:
1. Códigos de Ensaladas (Empiezan por "10d"): Por ejemplo, "10d477" corresponde a "César". Extrae el nombre de la ensalada del texto cercano.
2. Códigos de Formato/Caja (Empiezan por "10e"): Este es el formato de la caja. Relaciónalo con un nombre legible (ej. "Cartón 4", "Cartón 6", "Plástico").
3. Cantidades: Identifica la cantidad de cajas a producir de cada formato. Si no es legible, pon 0.
4. Noblejas: Si ves una cantidad separada para "Noblejas", anótala. Si no, pon 0.
5. Lote: Si encuentras un lote de producción, anótalo. Si hay un lote, asume cambioLote: true.

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
          "cambioLote": true
        }
      ]
    }
  ]
}

Asegúrate de que 'boxesPerPallet' tenga un valor por defecto realista (ej. 70 o 80) si no aparece explícitamente.`
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
