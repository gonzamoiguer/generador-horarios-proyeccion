const pad = (n) => String(n).padStart(2, '0');

/** Segundos -> "hh:mm:ss" (las horas pueden superar 24). */
export function formatDuration(total) {
  const s = Math.max(0, Math.round(total || 0));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/**
 * Texto -> segundos. Acepta "hh:mm:ss", "mm:ss" o un número suelto (minutos).
 * Devuelve null si no es válido.
 */
export function parseDuration(text) {
  const t = String(text ?? '').trim().replace(/[.,]/g, ':');
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t) * 60;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  while (nums.length < 3) nums.unshift(0);
  const [h, m, s] = nums;
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}

/** Segundos desde medianoche -> "hh:mm:ss" de reloj (vuelve a 00 después de 24 h). */
export function formatClock(total) {
  const s = ((Math.round(total) % 86400) + 86400) % 86400;
  return formatDuration(s);
}

/** "hh:mm" o "hh:mm:ss" -> segundos desde medianoche. */
export function parseClock(text) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export const naturalCompare = (a, b) => collator.compare(a, b);
