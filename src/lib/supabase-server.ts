import { createClient } from "@supabase/supabase-js";

function cleanSupabaseUrl(url: string): string {
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, "");
  cleaned = cleaned.replace(/\/+$/, "");
  return cleaned;
}

const supabaseUrl = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

/**
 * Cliente Supabase estándar para Server-Side (usando Anon Key).
 * Puede recibir un token JWT para operar con el contexto del usuario autenticado.
 */
export function createServerSupabaseClient(authToken?: string) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: authToken
      ? {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      : undefined,
  });
}

/**
 * Cliente Supabase con privilegios elevados (Service Role).
 * SOLO debe ser usado en endpoints de API o Server Actions, NUNCA expuesto al cliente.
 */
export function createAdminSupabaseClient() {
  const key = supabaseServiceRoleKey || supabaseAnonKey;
  if (!supabaseUrl || !key) {
    return null;
  }

  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Valida un header Authorization ("Bearer <token>") y devuelve el usuario autenticado.
 */
export async function verifyUserToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { user: null, error: "Missing or invalid authorization header" };
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { user: null, error: "Empty token" };
  }

  const client = createServerSupabaseClient(token);
  if (!client) {
    return { user: null, error: "Supabase server is not configured" };
  }

  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    return { user: null, error: error?.message || "Invalid or expired token" };
  }

  // Extraer rol desde app_metadata o user_metadata (default 'operator')
  const role: "operator" | "admin" =
    user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin"
      ? "admin"
      : "operator";

  return { user: { ...user, role }, error: null };
}
