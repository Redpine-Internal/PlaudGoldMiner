/** Shared bounds for collection endpoints. Offsets must always be whole rows. */
export function collectionPagination(params: URLSearchParams) {
  const rawLimit = Number(params.get('limit') ?? 50);
  const rawOffset = Number(params.get('offset') ?? 0);
  return {
    limit: Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50,
    offset: Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
  };
}

export function collectionValues(params: URLSearchParams, name: string): string[] {
  return [...new Set(params.getAll(name).flatMap((value) => value.split(',')).map((value) => value.trim()).filter(Boolean))];
}

/** Literal, accent-insensitive search. SQL wildcards typed by users are escaped. */
export function collectionSearch(value: string): string {
  return `%${value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\%_]/g, '\\$&')}%`;
}

/** Columns are fixed by the caller, never taken from query parameters. */
export function foldedSearchSql(column: string): string {
  return `translate(lower(coalesce(${column}, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')`;
}

export function statusCounts(rows: { status: string; total: string | number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
}
