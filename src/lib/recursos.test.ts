import { describe, it, expect, afterEach } from 'vitest';
import { assinaturaAtiva } from './recursos';

describe('assinaturaAtiva', () => {
  const original = process.env.SUBSCRIPTION_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.SUBSCRIPTION_ENABLED;
    else process.env.SUBSCRIPTION_ENABLED = original;
  });

  it('sem a variavel fica desligada', () => {
    delete process.env.SUBSCRIPTION_ENABLED;
    expect(assinaturaAtiva()).toBe(false);
  });

  it('so liga com true explicito', () => {
    for (const v of ['true', 'TRUE', ' true ']) {
      process.env.SUBSCRIPTION_ENABLED = v;
      expect(assinaturaAtiva()).toBe(true);
    }
    for (const v of ['false', '', '1', 'sim', 'yes']) {
      process.env.SUBSCRIPTION_ENABLED = v;
      expect(assinaturaAtiva()).toBe(false);
    }
  });
});
