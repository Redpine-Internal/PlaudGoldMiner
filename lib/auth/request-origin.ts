import type { NextRequest } from 'next/server';

/**
 * Origem pública da requisição.
 *
 * No Cloud Run `request.nextUrl` reflete o host interno do container
 * (`0.0.0.0:8080`), não o domínio por onde a pessoa chegou. Redirecionar para
 * ele manda o navegador a um endereço inexistente — foi o que quebrou o botão
 * Sair em produção. O proxy preserva o host real em `x-forwarded-host`.
 */
export function requestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();

  if (forwardedHost && (forwardedProto === 'https' || forwardedProto === 'http')) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}
