import { createClient } from "@supabase/supabase-js";

function cleanSupabaseUrl(url: string): string {
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, "");
  cleaned = cleaned.replace(/\/+$/, "");
  return cleaned;
}

const DEFAULT_SUPABASE_URL = "https://tsoenhuppyevmayyudui.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzb2VuaHVwcHlldm1heXl1ZHVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMTQ5NzcsImV4cCI6MjEwMTg5MDk3N30.SylLuiKrvi39l5g2JoX_vZLsm1M9l5mXsCQjRM9y5cw";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseUrl = rawSupabaseUrl ? cleanSupabaseUrl(rawSupabaseUrl) : "";
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY).trim();

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
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      }
    })
  : null;
