import { describe, it, expect } from 'vitest';
import { conferirSenha, erroDeLogin, erroDeSenha, gerarHash, normalizarLogin } from './senha';

describe('hash de senha', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const h = await gerarHash('balcao-da-loja');
    expect(await conferirSenha('balcao-da-loja', h)).toBe(true);
    expect(await conferirSenha('balcao-da-loj', h)).toBe(false);
    expect(await conferirSenha('BALCAO-DA-LOJA', h)).toBe(false);
  });

  it('não guarda a senha e usa sal próprio: a mesma senha dá hashes diferentes', async () => {
    const a = await gerarHash('mesma-senha-123');
    const b = await gerarHash('mesma-senha-123');
    expect(a).not.toBe(b);
    expect(a).not.toContain('mesma-senha-123');
    expect(a.startsWith('scrypt$16384$8$1$')).toBe(true);
  });

  it('recusa hash malformado ou com parâmetros abusivos em vez de travar', async () => {
    expect(await conferirSenha('x', '')).toBe(false);
    expect(await conferirSenha('x', 'bcrypt$abc')).toBe(false);
    const h = await gerarHash('qualquer-coisa');
    const partes = h.split('$');
    partes[1] = String(1 << 24);
    expect(await conferirSenha('qualquer-coisa', partes.join('$'))).toBe(false);
  });
});

describe('regras de senha e usuário', () => {
  it('senha tem mínimo e confirmação', () => {
    expect(erroDeSenha('curta')).toMatch(/pelo menos 8/);
    expect(erroDeSenha('boa-senha-1', 'outra-senha')).toMatch(/não conferem/);
    expect(erroDeSenha('boa-senha-1', 'boa-senha-1')).toBe(null);
  });

  it('login vira minúsculo e aceita só caracteres seguros', () => {
    expect(normalizarLogin('  Balcao ')).toBe('balcao');
    expect(erroDeLogin('balcao')).toBe(null);
    expect(erroDeLogin('maria.silva')).toBe(null);
    expect(erroDeLogin('ab')).not.toBe(null);
    expect(erroDeLogin('joão')).not.toBe(null);
    expect(erroDeLogin('com espaco')).not.toBe(null);
    expect(erroDeLogin('.comeca-com-ponto')).not.toBe(null);
  });
});
