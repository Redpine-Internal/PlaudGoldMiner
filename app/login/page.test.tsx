import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: LoginPage } = await import("@/app/login/page");

describe("LoginPage", () => {
  it("reproduz o login institucional e preserva os dois métodos de acesso", () => {
    const html = renderToStaticMarkup(<LoginPage />);

    expect(html).toContain("Inteligência para uma cultura de segurança");
    expect(html).toContain("Entrar no sistema");
    expect(html).toContain("Entrar com SSO da organização");
    expect(html).toContain("E-mail corporativo");
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).not.toContain("Manter conectada");
    expect(html).toContain("Dados de escuta são confidenciais e auditados.");
  });
});
