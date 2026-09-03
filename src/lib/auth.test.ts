import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

// auth.ts importa `next/headers` no topo, que só existe dentro de uma
// requisição do Next. As funções testadas aqui (papelDaSenha, papelDoToken)
// não tocam em cookie — o mock existe só para o módulo carregar.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { papelDaSenha, papelDoToken, senhaAdminConfigurada, senhaEquipeConfigurada } from './auth';

/**
 * O cookie de sessão é a única coisa entre a internet e o painel. O papel faz
 * parte do texto assinado justamente para que uma vendedora não consiga editar
 * o cookie e virar admin (docs/DECISOES.md #4).
 */

const SEGREDO = 'segredo-de-teste-com-mais-de-16-chars';
const SENHA_ADMIN = 'senha-admin-forte';
const SENHA_EQUIPE = 'senha-equipe';

const ambienteOriginal = { ...process.env };

beforeEach(() => {
  process.env.AUTH_SECRET = SEGREDO;
  process.env.ADMIN_PASSWORD = SENHA_ADMIN;
  process.env.EQUIPE_PASSWORD = SENHA_EQUIPE;
});
afterEach(() => {
  process.env = { ...ambienteOriginal };
});

/** Monta um token do mesmo jeito que o auth.ts monta. */
function token(papel: string, expiraEm = Date.now() + 60_000, segredo = SEGREDO, nonce = 'abcdef0123456789') {
  const payload = `${expiraEm}.${nonce}.${papel}`;
  const assinatura = createHmac('sha256', segredo).update(payload).digest('hex');
  return `${payload}.${assinatura}`;
}

describe('papelDaSenha', () => {
  it('abre admin com a senha de admin', () => {
    expect(papelDaSenha(SENHA_ADMIN)).toBe('admin');
  });

  it('abre equipe com a senha da equipe', () => {
    expect(papelDaSenha(SENHA_EQUIPE)).toBe('equipe');
  });

  it('recusa senha errada, vazia e quase certa', () => {
    expect(papelDaSenha('outra-coisa')).toBe(null);
    expect(papelDaSenha('')).toBe(null);
    expect(papelDaSenha(SENHA_ADMIN + 'x')).toBe(null);
    expect(papelDaSenha(SENHA_ADMIN.slice(0, -1))).toBe(null);
  });

  it('é sensível a maiúsculas', () => {
    expect(papelDaSenha(SENHA_ADMIN.toUpperCase())).toBe(null);
  });

  it('não abre nada quando as senhas não estão configuradas', () => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.EQUIPE_PASSWORD;
    expect(papelDaSenha('qualquer')).toBe(null);
    expect(papelDaSenha('')).toBe(null);
  });

  it('admin ganha de equipe se as duas senhas forem iguais', () => {
    process.env.EQUIPE_PASSWORD = SENHA_ADMIN;
    expect(papelDaSenha(SENHA_ADMIN)).toBe('admin');
  });
});

describe('papelDoToken — aceita o que é legítimo', () => {
  it('aceita token de admin válido', () => {
    expect(papelDoToken(token('admin'))).toBe('admin');
  });

  it('aceita token de equipe válido', () => {
    expect(papelDoToken(token('equipe'))).toBe('equipe');
  });
});

describe('papelDoToken — recusa o resto', () => {
  it('recusa ausente ou vazio', () => {
    expect(papelDoToken(undefined)).toBe(null);
    expect(papelDoToken('')).toBe(null);
  });

  it('recusa token com número de partes errado', () => {
    expect(papelDoToken('a.b.c')).toBe(null);
    expect(papelDoToken('a.b.c.d.e')).toBe(null);
    expect(papelDoToken('lixo')).toBe(null);
  });

  it('recusa assinatura inválida', () => {
    const t = token('admin');
    const adulterado = t.slice(0, -8) + '00000000';
    expect(papelDoToken(adulterado)).toBe(null);
  });

  it('recusa token assinado com OUTRO segredo', () => {
    expect(papelDoToken(token('admin', Date.now() + 60_000, 'outro-segredo-bem-diferente'))).toBe(null);
  });

  it('recusa token vencido', () => {
    expect(papelDoToken(token('admin', Date.now() - 1000))).toBe(null);
  });

  it('recusa validade não numérica', () => {
    const payload = `sempre.abc.admin`;
    const t = `${payload}.${createHmac('sha256', SEGREDO).update(payload).digest('hex')}`;
    expect(papelDoToken(t)).toBe(null);
  });

  it('recusa papel desconhecido, mesmo com assinatura válida', () => {
    expect(papelDoToken(token('superadmin'))).toBe(null);
    expect(papelDoToken(token('root'))).toBe(null);
  });
});

describe('papelDoToken — escalada de privilégio', () => {
  it('trocar "equipe" por "admin" no cookie NÃO promove: o papel é assinado', () => {
    const daEquipe = token('equipe');
    const [expira, nonce, , assinatura] = daEquipe.split('.');
    const forjado = `${expira}.${nonce}.admin.${assinatura}`;

    expect(papelDoToken(daEquipe)).toBe('equipe');
    expect(papelDoToken(forjado)).toBe(null);
  });

  it('esticar a validade no cookie NÃO renova: a validade é assinada', () => {
    const vencido = token('admin', Date.now() - 1000);
    const [, nonce, papel, assinatura] = vencido.split('.');
    const esticado = `${Date.now() + 999_999}.${nonce}.${papel}.${assinatura}`;

    expect(papelDoToken(esticado)).toBe(null);
  });
});

describe('senhas configuradas', () => {
  it('exige mínimo de 8 caracteres no admin', () => {
    process.env.ADMIN_PASSWORD = '1234567';
    expect(senhaAdminConfigurada()).toBe(false);
    process.env.ADMIN_PASSWORD = '12345678';
    expect(senhaAdminConfigurada()).toBe(true);
  });

  it('exige mínimo de 6 caracteres na equipe', () => {
    process.env.EQUIPE_PASSWORD = '12345';
    expect(senhaEquipeConfigurada()).toBe(false);
    process.env.EQUIPE_PASSWORD = '123456';
    expect(senhaEquipeConfigurada()).toBe(true);
  });

  it('é falso quando a variável nem existe', () => {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.EQUIPE_PASSWORD;
    expect(senhaAdminConfigurada()).toBe(false);
    expect(senhaEquipeConfigurada()).toBe(false);
  });
});

describe('AUTH_SECRET', () => {
  it('recusa validar token com segredo curto demais, em vez de aceitar em silêncio', () => {
    process.env.AUTH_SECRET = 'curto';
    expect(() => papelDoToken(token('admin'))).toThrow('AUTH_SECRET');
  });
});
