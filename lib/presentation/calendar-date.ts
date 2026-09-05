/** O campo de data da conversa é um dia do calendário, inclusive quando serializado em ISO. */
export function formatCalendarDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
): string {
  const day = value?.match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0];
  if (!day) return 'Data não informada';
  const date = new Date(`${day}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    return 'Data não informada';
  }
  return date.toLocaleDateString('pt-BR', { ...options, timeZone: 'UTC' });
}
