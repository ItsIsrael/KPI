interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Limpieza periódica de registros caducados cada 5 minutos
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitOptions {
  windowMs: number; // Ventana de tiempo en milisegundos
  maxRequests: number; // Máximo número de solicitudes en la ventana
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
  totalLimit: number;
}

/**
 * Aplica limitación de tasa por identificador (IP o User ID)
 */
export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { windowMs: 60 * 1000, maxRequests: 20 }
): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(identifier);

  if (!existing || now > existing.resetTime) {
    const record: RateLimitRecord = {
      count: 1,
      resetTime: now + options.windowMs,
    };
    rateLimitStore.set(identifier, record);
    return {
      success: true,
      remaining: options.maxRequests - 1,
      resetTime: record.resetTime,
      totalLimit: options.maxRequests,
    };
  }

  if (existing.count >= options.maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetTime: existing.resetTime,
      totalLimit: options.maxRequests,
    };
  }

  existing.count += 1;
  return {
    success: true,
    remaining: options.maxRequests - existing.count,
    resetTime: existing.resetTime,
    totalLimit: options.maxRequests,
  };
}

/**
 * Obtiene la IP cliente a partir de cabeceras estándar
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown-ip";
}
