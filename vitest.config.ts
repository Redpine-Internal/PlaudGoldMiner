import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    // O worktree de agente traz um node_modules inteiro com testes de terceiros.
    exclude: ['node_modules/**', '.next/**', '.claude/**'],
  },
  resolve: {
    // Espelha o "@/*" do tsconfig; sem isso os imports do app não resolvem.
    alias: { '@': resolve(__dirname, '.') },
  },
});
