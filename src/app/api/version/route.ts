import { NextResponse } from "next/server";
import packageJson from "@/../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      version: packageJson.version || "1.0.0",
      timestamp: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    }
  );
}
