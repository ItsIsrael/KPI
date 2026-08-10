import { createClient } from "@supabase/supabase-js";

function cleanSupabaseUrl(url: string): string {
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, "");
  cleaned = cleaned.replace(/\/+$/, "");
  return cleaned;
}

// Obtener credenciales desde variables de entorno
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseUrl = cleanSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith("https://")
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;
