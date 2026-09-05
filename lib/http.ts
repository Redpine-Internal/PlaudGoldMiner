/** Consistent HTTP errors: failed requests must not look like empty collections. */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload as { error?: unknown; message?: unknown } | null;
    const message = typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : "Não foi possível concluir a solicitação. Tente novamente.";
    throw new ApiError(message, response.status);
  }
  if (payload === null && response.status !== 204) {
    throw new ApiError("O servidor retornou uma resposta inválida. Tente novamente.", response.status);
  }
  return payload as T;
}
