import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requestOrigin } from '@/lib/auth/request-origin';

describe('origem pública da requisição', () => {
  it('usa o host encaminhado pelo proxy em vez do host interno do container', () => {
    // No Cloud Run a URL interna é 0.0.0.0:8080 — redirecionar para ela
    // levava o navegador a um endereço inexistente e quebrava o Sair.
    const request = new NextRequest('https://0.0.0.0:8080/auth/signout', {
      headers: { 'x-forwarded-host': 'plaud.ehssystem.us', 'x-forwarded-proto': 'https' },
    });
    expect(requestOrigin(request)).toBe('https://plaud.ehssystem.us');
  });

  it('considera apenas o primeiro host quando há vários encaminhados', () => {
    const request = new NextRequest('https://0.0.0.0:8080/auth/signout', {
      headers: { 'x-forwarded-host': 'plaud.ehssystem.us, proxy.interno', 'x-forwarded-proto': 'https, http' },
    });
    expect(requestOrigin(request)).toBe('https://plaud.ehssystem.us');
  });

  it('cai na origem da própria requisição sem cabeçalhos de proxy', () => {
    const request = new NextRequest('http://localhost:3000/auth/signout');
    expect(requestOrigin(request)).toBe('http://localhost:3000');
  });

  it('ignora protocolo encaminhado inválido', () => {
    const request = new NextRequest('http://localhost:3000/auth/signout', {
      headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'javascript' },
    });
    expect(requestOrigin(request)).toBe('http://localhost:3000');
  });
});
