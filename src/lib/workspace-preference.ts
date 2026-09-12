/**
 * Sistema de persistencia segura y versionada del contexto de trabajo
 * (Línea de producción o Dashboard de Planta).
 *
 * Clave versionada: kpi:last-workspace:v1
 * Segmentación: Si existe usuario autenticado (authUser.id), se aísla por usuario
 * para no mezclar preferencias en equipos compartidos.
 */

export const VALID_WORKSPACE_CODES = ["ALL", "K00", "K01", "K02", "K03"] as const;
export type WorkspaceCode = typeof VALID_WORKSPACE_CODES[number];

const BASE_STORAGE_KEY = "kpi:last-workspace:v1";

export interface WorkspacePreferencePayload {
  activeLineCode: WorkspaceCode;
  userId?: string | null;
  updatedAt: number;
}

/**
 * Valida estrictamente que el valor pertenezca a 'ALL' | 'K00' | 'K01' | 'K02' | 'K03'.
 */
export function isValidWorkspaceCode(value: unknown): value is WorkspaceCode {
  return typeof value === "string" && (VALID_WORKSPACE_CODES as readonly string[]).includes(value);
}

/**
 * Genera la clave de localStorage segmentada por usuario o por dispositivo.
 */
export function getWorkspaceStorageKey(userId?: string | null): string {
  if (userId && typeof userId === "string" && userId.trim().length > 0) {
    return `${BASE_STORAGE_KEY}:user:${userId.trim()}`;
  }
  return `${BASE_STORAGE_KEY}:device`;
}

/**
 * Recupera la última opción válida persistida.
 * Si no existe, es inválida o está corrupta, limpia el valor y retorna null.
 */
export function getSavedWorkspacePreference(userId?: string | null): WorkspaceCode | null {
  if (typeof window === "undefined") return null;

  try {
    const key = getWorkspaceStorageKey(userId);
    let raw = localStorage.getItem(key);

    // Si buscamos por usuario pero no tiene preferencia aún, probar clave de dispositivo
    if (!raw && userId) {
      raw = localStorage.getItem(getWorkspaceStorageKey(null));
    }

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WorkspacePreferencePayload>;
    if (parsed && isValidWorkspaceCode(parsed.activeLineCode)) {
      return parsed.activeLineCode;
    }

    // Datos inválidos o corruptos: limpiar y retornar null para mostrar el selector
    clearWorkspacePreference(userId);
    return null;
  } catch {
    clearWorkspacePreference(userId);
    return null;
  }
}

/**
 * Persiste la preferencia de vista/línea del usuario de forma segura.
 */
export function saveWorkspacePreference(code: string, userId?: string | null): void {
  if (typeof window === "undefined") return;

  if (!isValidWorkspaceCode(code)) {
    return;
  }

  try {
    const key = getWorkspaceStorageKey(userId);
    const payload: WorkspacePreferencePayload = {
      activeLineCode: code,
      userId: userId || null,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));

    // Si guardamos preferencia para un usuario específico, también actualizamos el fallback de dispositivo
    if (userId) {
      const deviceKey = getWorkspaceStorageKey(null);
      localStorage.setItem(deviceKey, JSON.stringify(payload));
    }
  } catch (error) {
    console.error("[WorkspacePreference] Error guardando preferencia:", error);
  }
}

/**
 * Elimina la preferencia guardada en caso de ser inválida o cuando se resetee.
 */
export function clearWorkspacePreference(userId?: string | null): void {
  if (typeof window === "undefined") return;

  try {
    const key = getWorkspaceStorageKey(userId);
    localStorage.removeItem(key);
    if (userId) {
      localStorage.removeItem(getWorkspaceStorageKey(null));
    }
  } catch (error) {
    console.error("[WorkspacePreference] Error limpiando preferencia:", error);
  }
}
