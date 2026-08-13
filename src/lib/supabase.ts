import { createClient } from "@supabase/supabase-js";

function cleanSupabaseUrl(url: string): string {
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, "");
  cleaned = cleaned.replace(/\/+$/, "");
  return cleaned;
}

const DEFAULT_SUPABASE_URL = "";
const DEFAULT_SUPABASE_KEY = "";

// Obtener credenciales desde variables de entorno o respaldo directo
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseUrl = cleanSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY).trim();

export const isSupabaseConfigured = false; // FORZADO A MODO LOCAL

export const supabase = null;
