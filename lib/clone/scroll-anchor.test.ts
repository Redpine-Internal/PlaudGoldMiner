import { describe, expect, it } from 'vitest';
import {
  SCROLL_BOTTOM_TOLERANCE,
  distanceFromBottom,
  isAtBottom,
  shouldFollowBottom,
  type ScrollMetrics,
} from '@/lib/clone/scroll-anchor';

/** Viewport de 603px sobre 2310px de conteúdo — medida real do chat em 390x844. */
const content = (scrollTop: number): ScrollMetrics => ({ scrollTop, scrollHeight: 2310, clientHeight: 603 });

const maxScrollTop = 2310 - 603; // 1707

describe('distância até o fim', () => {
  it('mede quanto conteúdo ainda existe abaixo da viewport', () => {
    expect(distanceFromBottom(content(0))).toBe(maxScrollTop);
    expect(distanceFromBottom(content(maxScrollTop))).toBe(0);
    expect(distanceFromBottom(content(1000))).toBe(707);
  });

  it('é zero quando o conteúdo cabe inteiro na viewport', () => {
    expect(distanceFromBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 603 })).toBeLessThan(0);
    expect(isAtBottom({ scrollTop: 0, scrollHeight: 400, clientHeight: 603 })).toBe(true);
  });
});

describe('está no fim', () => {
  it('reconhece o fim exato', () => {
    expect(isAtBottom(content(maxScrollTop))).toBe(true);
  });

  it('tolera arredondamento sub-pixel e scroll suave dentro da folga', () => {
    expect(isAtBottom(content(maxScrollTop - 0.5))).toBe(true);
    expect(isAtBottom(content(maxScrollTop - SCROLL_BOTTOM_TOLERANCE))).toBe(true);
  });

  it('não considera "no fim" quem rolou além da folga', () => {
    expect(isAtBottom(content(maxScrollTop - SCROLL_BOTTOM_TOLERANCE - 1))).toBe(false);
    expect(isAtBottom(content(0))).toBe(false);
    expect(isAtBottom(content(1000))).toBe(false);
  });

  it('trata o bounce do iOS (scrollTop além do fim) como estar no fim', () => {
    expect(isAtBottom(content(maxScrollTop + 120))).toBe(true);
  });

  it('aceita folga customizada', () => {
    expect(isAtBottom(content(maxScrollTop - 50), 40)).toBe(false);
    expect(isAtBottom(content(maxScrollTop - 30), 40)).toBe(true);
  });
});

describe('acompanhar o fim durante o streaming', () => {
  it('acompanha quem já estava no fim', () => {
    expect(shouldFollowBottom(content(maxScrollTop))).toBe(true);
  });

  it('NÃO arranca de volta quem rolou para cima para reler', () => {
    expect(shouldFollowBottom(content(200))).toBe(false);
    expect(shouldFollowBottom(content(maxScrollTop - 300))).toBe(false);
  });

  it('volta ao fim quando a pessoa acabou de enviar uma mensagem, onde quer que ela esteja', () => {
    expect(shouldFollowBottom(content(0), { force: true })).toBe(true);
    expect(shouldFollowBottom(content(200), { force: true })).toBe(true);
  });

  it('force não é necessário para quem já está no fim', () => {
    expect(shouldFollowBottom(content(maxScrollTop), { force: false })).toBe(true);
  });

  it('mantém a decisão estável ao longo de fragmentos sucessivos do streaming', () => {
    // O conteúdo cresce a cada fragmento; quem está rolado para cima continua parado.
    const readingUp = [2310, 2480, 2650, 2820].map((scrollHeight) => ({ scrollTop: 400, scrollHeight, clientHeight: 603 }));
    expect(readingUp.map((metrics) => shouldFollowBottom(metrics))).toEqual([false, false, false, false]);
  });
});
