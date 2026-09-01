import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export type UserRole = "operator" | "admin";

export interface AuthUserProfile {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}

/**
 * Normaliza el nombre de usuario o correo para autenticación en Supabase Auth.
 * Si el usuario introduce sólo un nombre (ej. "operador1"), lo convierte a "operador1@planta.local".
 */
export function formatAuthEmail(identifier: string): string {
  const clean = identifier.trim().toLowerCase();
  if (clean.includes("@")) {
    return clean;
  }
  return `${clean}@planta.local`;
}

/**
 * Obtiene el rol del usuario a partir de sus metadatos de Supabase Auth
 */
export function extractUserRole(metadata?: Record<string, unknown> | null): UserRole {
  if (!metadata) return "operator";
  const role = String(metadata.role || "").toLowerCase();
  return role === "admin" ? "admin" : "operator";
}

/**
 * Inicia sesión en Supabase Auth
 */
export async function signInWithSupabase(identifier: string, password: string): Promise<{
  user: AuthUserProfile | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      user: null,
      error: "Supabase no está configurado. Por favor, verifica las variables de entorno.",
    };
  }

  const email = formatAuthEmail(identifier);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        return { user: null, error: "Usuario o contraseña incorrectos" };
      }
      if (error.message.includes("Email not confirmed")) {
        return { user: null, error: "La cuenta no ha sido confirmada todavía" };
      }
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: "No se pudo obtener la sesión de usuario" };
    }

    const userProfile: AuthUserProfile = {
      id: data.user.id,
      email: data.user.email || email,
      username: (data.user.user_metadata?.username as string) || identifier.trim(),
      role: extractUserRole(data.user.user_metadata || data.user.app_metadata),
    };

    return { user: userProfile, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error inesperado de autenticación";
    return { user: null, error: msg };
  }
}

/**
 * Cierra la sesión activa en Supabase Auth
 */
export async function signOutSupabase(): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured || !supabase) {
    return { error: null };
  }
  try {
    const { error } = await supabase.auth.signOut();
    return { error: error ? error.message : null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error al cerrar sesión";
    return { error: msg };
  }
}

/**
 * Obtiene la sesión y perfil del usuario actualmente autenticado
 */
export async function getActiveUserProfile(): Promise<AuthUserProfile | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      return null;
    }

    const user = session.user;
    return {
      id: user.id,
      email: user.email || "",
      username: (user.user_metadata?.username as string) || user.email?.split("@")[0] || "Operador",
      role: extractUserRole(user.user_metadata || user.app_metadata),
    };
  } catch {
    return null;
  }
}

/**
 * Obtiene el access token JWT actual para llamadas seguras a endpoints /api/
 */
export async function getAuthAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Comprueba si el rol cuenta con privilegios administrativos
 */
export function isAdminRole(role?: UserRole | null): boolean {
  return role === "admin";
}
