import { supabase, isSupabaseConfigured } from "./supabase";

export interface SupabaseTestResult {
  configured: boolean;
  connected: boolean;
  message: string;
  latencyMs?: number;
  linesFound?: number;
}

export async function testSupabaseConnection(): Promise<SupabaseTestResult> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      configured: false,
      connected: false,
      message: "Variables NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no configuradas en .env.local",
    };
  }

  const startTime = Date.now();
  try {
    const { data, error } = await supabase
      .from("production_lines")
      .select("id, code, name")
      .limit(10);

    const latencyMs = Date.now() - startTime;

    if (error) {
      return {
        configured: true,
        connected: false,
        message: `Error de consulta en Supabase: ${error.message}`,
        latencyMs,
      };
    }

    return {
      configured: true,
      connected: true,
      message: "Conexión exitosa con Supabase Realtime",
      latencyMs,
      linesFound: data?.length || 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      configured: true,
      connected: false,
      message: `Excepción de red al conectar con Supabase: ${msg}`,
      latencyMs: Date.now() - startTime,
    };
  }
}
