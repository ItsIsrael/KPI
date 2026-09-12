import { sileo, type SileoOptions } from "sileo";

export const DEFAULT_TOAST_POSITION = "bottom-right";
export const DEFAULT_TOAST_DURATION = 4000;

/**
 * Notificación de Éxito - Verde Industrial
 */
export function notifySuccess(
  title: string,
  description?: string,
  options?: Partial<SileoOptions>
) {
  return sileo.success({
    title,
    description,
    position: DEFAULT_TOAST_POSITION,
    duration: DEFAULT_TOAST_DURATION,
    styles: {
      title: "!font-bold text-emerald-950 dark:text-emerald-100",
      description: "!text-xs text-emerald-900/80 dark:text-emerald-200/80",
    },
    ...options,
  });
}

/**
 * Notificación de Error - Rojo Industrial
 */
export function notifyError(
  title: string,
  description?: string,
  options?: Partial<SileoOptions>
) {
  return sileo.error({
    title,
    description,
    position: DEFAULT_TOAST_POSITION,
    duration: 5000,
    styles: {
      title: "!font-bold text-red-950 dark:text-red-100",
      description: "!text-xs text-red-900/80 dark:text-red-200/80",
    },
    ...options,
  });
}

/**
 * Notificación de Advertencia - Ámbar Industrial
 */
export function notifyWarning(
  title: string,
  description?: string,
  options?: Partial<SileoOptions>
) {
  return sileo.warning({
    title,
    description,
    position: DEFAULT_TOAST_POSITION,
    duration: 4500,
    styles: {
      title: "!font-bold text-amber-950 dark:text-amber-100",
      description: "!text-xs text-amber-900/80 dark:text-amber-200/80",
    },
    ...options,
  });
}

/**
 * Notificación Informativa - Menta/Azul Discreto
 */
export function notifyInfo(
  title: string,
  description?: string,
  options?: Partial<SileoOptions>
) {
  return sileo.info({
    title,
    description,
    position: DEFAULT_TOAST_POSITION,
    duration: DEFAULT_TOAST_DURATION,
    styles: {
      title: "!font-bold text-teal-950 dark:text-teal-100",
      description: "!text-xs text-teal-900/80 dark:text-teal-200/80",
    },
    ...options,
  });
}

/**
 * Notificación de Error de Sincronización / Red
 */
export function notifySyncError(
  description: string = "Error de sincronización con la base de datos. Operando en modo local."
) {
  return notifyWarning("Sincronización Interrumpida", description, {
    duration: 6000,
  });
}

/**
 * Notificación con Opción de Deshacer (Undo)
 */
export function notifyWithUndo(
  title: string,
  description: string,
  onUndo: () => void,
  options?: Partial<SileoOptions>
) {
  return sileo.action({
    title,
    description,
    position: DEFAULT_TOAST_POSITION,
    duration: 6000,
    button: {
      title: "Deshacer",
      onClick: onUndo,
    },
    styles: {
      title: "!font-bold text-emerald-950 dark:text-emerald-100",
      description: "!text-xs text-emerald-900/80 dark:text-emerald-200/80",
      button: "!bg-emerald-600 hover:!bg-emerald-500 !text-white !font-bold !px-3 !py-1 !rounded-lg !text-xs cursor-pointer",
    },
    ...options,
  });
}
