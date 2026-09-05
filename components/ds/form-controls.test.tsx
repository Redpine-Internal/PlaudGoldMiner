import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Input } from '@/components/ds/Input';
import { Button } from '@/components/ds/Button';

describe('accessible form controls', () => {
  it('associates the visible label with its input', () => {
    const html = renderToStaticMarkup(<Input id="profile-name" label="Nome" value="Fabio" />);
    expect(html).toContain('for="profile-name"');
    expect(html).toContain('id="profile-name"');
  });
  it('generates distinct linked IDs when multiple controls have no explicit id', () => {
    const html = renderToStaticMarkup(<><Input label="Nome" /><Input label="E-mail" /></>);
    const ids = [...html.matchAll(/<input id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(2);
    ids.forEach((id) => expect(html).toContain(`for="${id}"`));
  });
  it('supports native form submission without changing other button defaults', () => {
    expect(renderToStaticMarkup(<Button type="submit">Entrar</Button>)).toContain('type="submit"');
    expect(renderToStaticMarkup(<Button>Cancelar</Button>)).toContain('type="button"');
  });
});
