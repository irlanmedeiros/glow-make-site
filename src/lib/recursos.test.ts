import { describe, it, expect, afterEach, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@/lib/prisma', () => ({ prisma: { config: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { assinaturaAtiva } from './recursos';

describe('assinaturaAtiva', () => {
  const original = process.env.SUBSCRIPTION_ENABLED;
  afterEach(() => {
    findUnique.mockReset();
    if (original === undefined) delete process.env.SUBSCRIPTION_ENABLED;
    else process.env.SUBSCRIPTION_ENABLED = original;
  });

  it('quem manda e a chave de Configuracoes', async () => {
    findUnique.mockResolvedValue({ assinaturaAtiva: true });
    await expect(assinaturaAtiva()).resolves.toBe(true);
    findUnique.mockResolvedValue({ assinaturaAtiva: false });
    await expect(assinaturaAtiva()).resolves.toBe(false);
  });

  it('a variavel de ambiente nao liga por cima do que esta desligado no admin', async () => {
    process.env.SUBSCRIPTION_ENABLED = 'true';
    findUnique.mockResolvedValue({ assinaturaAtiva: false });
    await expect(assinaturaAtiva()).resolves.toBe(false);
  });

  it('banco sem Config: cai na variavel, e o padrao e desligado', async () => {
    findUnique.mockResolvedValue(null);
    delete process.env.SUBSCRIPTION_ENABLED;
    await expect(assinaturaAtiva()).resolves.toBe(false);
    for (const v of ['true', 'TRUE', ' true ']) {
      process.env.SUBSCRIPTION_ENABLED = v;
      await expect(assinaturaAtiva()).resolves.toBe(true);
    }
    for (const v of ['false', '', '1', 'sim']) {
      process.env.SUBSCRIPTION_ENABLED = v;
      await expect(assinaturaAtiva()).resolves.toBe(false);
    }
  });
});
