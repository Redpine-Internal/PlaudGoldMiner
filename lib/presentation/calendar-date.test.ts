import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCalendarDate } from '@/lib/presentation/calendar-date';

afterEach(() => vi.unstubAllEnvs());

describe('datas de calendário das conversas', () => {
  it.each(['America/New_York', 'America/Sao_Paulo', 'Pacific/Honolulu', 'Asia/Tokyo'])(
    'preserva 2 de setembro no fuso %s', (timeZone) => {
      vi.stubEnv('TZ', timeZone);
      expect(formatCalendarDate('2026-09-02')).toBe('quarta-feira, 2 de setembro de 2026');
      expect(formatCalendarDate('2026-09-02T00:00:00.000Z')).toBe('quarta-feira, 2 de setembro de 2026');
    },
  );

  it('preserva ano e dia bissexto sem converter para o dia anterior', () => {
    vi.stubEnv('TZ', 'America/New_York');
    expect(formatCalendarDate('2026-01-01', { year: 'numeric', month: '2-digit', day: '2-digit' })).toBe('01/01/2026');
    expect(formatCalendarDate('2024-02-29', { year: 'numeric', month: '2-digit', day: '2-digit' })).toBe('29/02/2024');
  });

  it.each([null, undefined, '', 'sem-data', '2026-02-30', '2026-13-01'])(
    'mostra ausência de data para %s, sem Invalid Date ou normalização silenciosa', (value) => {
      expect(formatCalendarDate(value)).toBe('Data não informada');
    },
  );
});
