/** Plaud ingestion stores milliseconds; uploaded/legacy text has no fixed unit. */
export function conversationDuration(
  duration: string | number | null | undefined,
  source: string | null | undefined,
) {
  if (source !== 'plaud' || duration == null) return duration;
  const value = String(duration).trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) return duration;
  const ms = Number(value);
  if (!Number.isFinite(ms)) return duration;
  const minutes = Math.round(ms / 60000);
  if (minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}min`;
  return hours ? `${hours}h` : `${remainder}min`;
}
