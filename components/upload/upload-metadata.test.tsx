import React from 'react';
import { execFileSync } from 'node:child_process';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetadataForm, localMetadataDate } from '@/components/upload/MetadataForm';
import { processedMetadataSuggestions } from '@/components/upload/UploadModal';

beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('dia local dos metadados', () => {
  it.each([
    ['America/New_York', '2026-09-05T02:00:00.000Z', '2026-09-04'],
    ['America/Sao_Paulo', '2026-09-05T01:30:00.000Z', '2026-09-04'],
    ['Asia/Tokyo', '2026-09-04T16:00:00.000Z', '2026-09-05'],
    ['Pacific/Honolulu', '2027-01-01T08:00:00.000Z', '2026-12-31'],
  ])('usa o calendário de %s sem converter o dia para UTC', (timeZone, instant, expected) => {
    // TZ precisa ser definido antes de iniciar o runtime: mudar process.env.TZ
    // dentro de uma worker thread não altera necessariamente o fuso do Date.
    const output = execFileSync(process.execPath, ['--import', 'tsx', '-e',
      `const { localMetadataDate } = require('./components/upload/MetadataForm.tsx'); process.stdout.write(localMetadataDate(new Date(${JSON.stringify(instant)})));`,
    ], { cwd: process.cwd(), env: { ...process.env, TZ: timeZone }, encoding: 'utf8' });
    expect(output).toBe(expected);
  });

  it('preenche o input com o dia local atual e respeita a data inicial fornecida', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T02:00:00.000Z'));
    const today = localMetadataDate();
    const defaultForm = renderToStaticMarkup(<MetadataForm onChange={() => {}} />);
    expect(defaultForm).toMatch(new RegExp(`type="date"[^>]*value="${today}"`));

    const initial = new Date(2024, 1, 29, 12);
    const initialForm = renderToStaticMarkup(<MetadataForm initialData={{ date: initial }} onChange={() => {}} />);
    expect(initialForm).toMatch(/type="date"[^>]*value="2024-02-29"/);
  });
});

describe('identificação acessível dos metadados', () => {
  it('liga os quatro rótulos aos campos e expõe o tipo selecionado', () => {
    const html = renderToStaticMarkup(<MetadataForm suggestedType="treinamento" onChange={() => {}} />);
    const inputIds = [...html.matchAll(/<input id="([^"]+)"/g)].map((match) => match[1]);
    expect(inputIds).toHaveLength(4);
    expect(new Set(inputIds).size).toBe(4);
    for (const id of inputIds) expect(html).toContain(`for="${id}"`);
    const groupLabel = html.match(/role="group" aria-labelledby="([^"]+)"/)?.[1];
    expect(groupLabel).toBeTruthy();
    expect(html).toContain(`id="${groupLabel}"`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Treinamento<\/button>/);
  });

  it('preserva um tipo inicial explícito mesmo quando existe sugestão diferente', () => {
    const html = renderToStaticMarkup(<MetadataForm initialData={{ type: 'outro' }} suggestedType="reuniao" onChange={() => {}} />);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Outro<\/button>/);
  });
});

describe('contrato de processamento do upload', () => {
  it('usa title/type da conversa persistida pela API, inclusive sobre campos legados', () => {
    expect(processedMetadataSuggestions({ data: {
      conversation: { title: 'Título persistido', type: 'treinamento' },
      suggestedTitle: 'Campo legado', suggestedType: 'reuniao',
    } }, 'arquivo')).toEqual({ suggestedTitle: 'Título persistido', suggestedType: 'treinamento' });
  });

  it('continua aceitando a resposta legada quando a conversa não está presente', () => {
    expect(processedMetadataSuggestions({ data: {
      suggestedTitle: 'Sugestão anterior', suggestedType: 'informal',
    } }, 'arquivo')).toEqual({ suggestedTitle: 'Sugestão anterior', suggestedType: 'informal' });
  });

  it('mantém o título do upload e evita selecionar tipos desconhecidos', () => {
    expect(processedMetadataSuggestions({ data: {
      conversation: { title: '', type: 'desconhecido' }, suggestedType: 'inválido',
    } }, 'arquivo')).toEqual({ suggestedTitle: 'arquivo', suggestedType: undefined });
    expect(processedMetadataSuggestions({}, 'arquivo')).toEqual({ suggestedTitle: 'arquivo', suggestedType: undefined });
  });
});
