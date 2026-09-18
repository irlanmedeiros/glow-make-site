import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { autenticarUsuario, TENTATIVAS_ANTES_DE_TRAVAR } from '@/lib/usuarios';
import { gerarHash } from '@/lib/senha';

/**
 * Integracao: login por usuario contra o banco de desenvolvimento. A trava por
 * tentativas e o acesso desativado so existem no banco, entao so da para
 * provar com banco real.
 */

const prisma = new PrismaClient();
const PREFIXO = 'zzteste-';
const SENHA = 'senha-de-teste-123';

beforeAll(() => {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL não configurada. Veja o README.');
  if (/prod|production|main\b/i.test(url) && !/dev/i.test(url)) {
    throw new Error('DATABASE_URL parece apontar para produção. Use um branch de dev do Neon.');
  }
});

async function limpar() {
  await prisma.usuario.deleteMany({ where: { login: { startsWith: PREFIXO } } });
}
beforeEach(limpar);
afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function criar(login: string, extra: { ativo?: boolean; papel?: 'ADMIN' | 'EQUIPE' } = {}) {
  return prisma.usuario.create({
    data: { nome: 'Teste', login: PREFIXO + login, papel: extra.papel ?? 'EQUIPE', ativo: extra.ativo ?? true, senhaHash: await gerarHash(SENHA) },
  });
}

describe('autenticarUsuario', () => {
  it('entra com a senha certa, zera erros e marca o último acesso', async () => {
    const u = await criar('balcao');
    await prisma.usuario.update({ where: { id: u.id }, data: { tentativasFalhas: 2 } });

    const r = await autenticarUsuario(PREFIXO + 'balcao', SENHA);
    expect(r).toEqual({ ok: true, usuario: { id: u.id, papel: 'EQUIPE', versaoSessao: 0 } });

    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(depois.tentativasFalhas).toBe(0);
    expect(depois.ultimoAcesso).not.toBe(null);
  });

  it('login inexistente e senha errada dão a mesma resposta', async () => {
    await criar('existe');
    const errada = await autenticarUsuario(PREFIXO + 'existe', 'errada-errada');
    const inexistente = await autenticarUsuario(PREFIXO + 'nao-existe', SENHA);
    expect(errada).toEqual(inexistente);
    expect(errada.ok).toBe(false);
  });

  it('desativado não entra nem com a senha certa, e a resposta não entrega que ele existe', async () => {
    await criar('saiu', { ativo: false });
    const r = await autenticarUsuario(PREFIXO + 'saiu', SENHA);
    expect(r).toEqual({ ok: false, erro: 'Usuário ou senha incorretos.' });
  });

  it(`trava depois de ${TENTATIVAS_ANTES_DE_TRAVAR} erros, e trava vale até para a senha certa`, async () => {
    const u = await criar('trava');
    for (let i = 0; i < TENTATIVAS_ANTES_DE_TRAVAR; i++) {
      await autenticarUsuario(PREFIXO + 'trava', 'errada-' + i);
    }
    const r = await autenticarUsuario(PREFIXO + 'trava', SENHA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/Muitas tentativas/);

    const travado = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(travado.bloqueadoAte!.getTime()).toBeGreaterThan(Date.now());
  });

  it('erros simultâneos contam todos: o incremento é no banco', async () => {
    const u = await criar('corrida');
    await Promise.all([1, 2, 3].map((i) => autenticarUsuario(PREFIXO + 'corrida', 'errada-' + i)));
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(depois.tentativasFalhas).toBe(3);
  });
});
