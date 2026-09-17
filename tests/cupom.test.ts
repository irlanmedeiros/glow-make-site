import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { aplicarCupom, consultarCupom, jaComprou, CUPOM_INEXISTENTE } from '@/lib/cupom';

/**
 * Integracao: cupom de indicacao contra o banco de desenvolvimento.
 * A regra de primeira compra depende do que ja esta gravado em Pedido, entao
 * so faz sentido provar com banco real.
 */

const prisma = new PrismaClient();

const EMAIL = 'teste-int-cupom@glowmake.test';
const CPF_COM_MASCARA = '529.982.247-25';
const amiga = { email: EMAIL, documento: '52998224725' };
const PREFIXO = 'ZZTESTE';
const D = (v: string) => new Prisma.Decimal(v);

beforeAll(() => {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL não configurada. Veja o README.');
  if (/prod|production|main\b/i.test(url) && !/dev/i.test(url)) {
    throw new Error('DATABASE_URL parece apontar para produção. Use um branch de dev do Neon.');
  }
});

async function limpar() {
  await prisma.pedido.deleteMany({ where: { email: EMAIL } });
  await prisma.cupom.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
}

beforeEach(limpar);
afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

let seq = 0;
function criarCupom(extra: Partial<Prisma.CupomCreateInput> = {}) {
  seq += 1;
  return prisma.cupom.create({
    data: {
      codigo: `${PREFIXO}-${seq}${Date.now().toString(36).toUpperCase()}`,
      tipo: 'PERCENTUAL',
      valor: D('10'),
      indicadorNome: 'Indicadora Teste',
      indicadorEmail: 'indicadora-teste@glowmake.test',
      ...extra,
    },
  });
}

function criarPedido(status: 'AGUARDANDO_PAGAMENTO' | 'PAGO' | 'CANCELADO') {
  return prisma.pedido.create({
    data: {
      nome: 'Amiga Teste',
      email: EMAIL,
      documento: CPF_COM_MASCARA,
      telefone: '(83) 99999-0000',
      cep: '58000-000',
      subtotal: D('80'),
      frete: D('0'),
      total: D('80'),
      pagamento: 'PIX',
      status,
    },
  });
}

describe('aplicarCupom', () => {
  it('aplica na primeira compra, com codigo em minusculas', async () => {
    const c = await criarCupom();
    const r = await aplicarCupom(`  ${c.codigo.toLowerCase()} `, amiga, D('80'));
    expect(r).not.toHaveProperty('erro');
    if (!('erro' in r)) {
      expect(r.id).toBe(c.id);
      expect(r.desconto.toFixed(2)).toBe('8.00');
    }
  });

  it('recusa quem ja tem pedido, mesmo aguardando pagamento e com CPF em outro formato', async () => {
    const c = await criarCupom();
    await criarPedido('AGUARDANDO_PAGAMENTO');
    expect(await jaComprou(amiga)).toBe(true);
    const r = await aplicarCupom(c.codigo, amiga, D('80'));
    expect(r).toEqual({ erro: 'Este cupom vale só na primeira compra.' });
  });

  it('pedido cancelado nao conta como compra', async () => {
    const c = await criarCupom();
    await criarPedido('CANCELADO');
    const r = await aplicarCupom(c.codigo, amiga, D('80'));
    expect(r).not.toHaveProperty('erro');
  });

  it('cupom sem regra de primeira compra aceita quem ja comprou', async () => {
    const c = await criarCupom({ primeiraCompra: false });
    await criarPedido('PAGO');
    const r = await aplicarCupom(c.codigo, amiga, D('80'));
    expect(r).not.toHaveProperty('erro');
  });

  it('quem indicou nao usa o proprio cupom', async () => {
    const c = await criarCupom({ indicadorEmail: EMAIL });
    const r = await aplicarCupom(c.codigo, amiga, D('80'));
    expect('erro' in r && r.erro).toMatch(/indicou/);
  });

  it('inativo, vencido e inexistente sao recusados', async () => {
    const inativo = await criarCupom({ ativo: false });
    const vencido = await criarCupom({ validoAte: new Date(Date.now() - 60_000) });
    expect(await aplicarCupom(inativo.codigo, amiga, D('80'))).toHaveProperty('erro');
    expect(await aplicarCupom(vencido.codigo, amiga, D('80'))).toHaveProperty('erro');
    expect(await aplicarCupom(`${PREFIXO}-NAOEXISTE`, amiga, D('80'))).toEqual({ erro: CUPOM_INEXISTENTE });
  });
});

describe('consultarCupom (previa na tela)', () => {
  it('mostra o desconto sem saber quem e a cliente', async () => {
    const c = await criarCupom({ tipo: 'VALOR', valor: D('15') });
    await criarPedido('PAGO');
    const r = await consultarCupom(c.codigo, D('40'));
    expect(r).not.toHaveProperty('erro');
    if (!('erro' in r)) expect(r.desconto.toFixed(2)).toBe('15.00');
  });
});

describe('pedido guarda o cupom', () => {
  it('apagar o cupom nao apaga o historico do pedido', async () => {
    const c = await criarCupom();
    const p = await prisma.pedido.create({
      data: {
        nome: 'Amiga Teste', email: EMAIL, documento: CPF_COM_MASCARA, telefone: '(83) 99999-0000',
        cep: '58000-000', subtotal: D('80'), frete: D('0'), total: D('72'), pagamento: 'PIX',
        desconto: D('8'), cupomId: c.id, cupomCodigo: c.codigo,
      },
    });
    await prisma.cupom.delete({ where: { id: c.id } });
    const depois = await prisma.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect(depois.cupomId).toBeNull();
    expect(depois.cupomCodigo).toBe(c.codigo);
    expect(depois.desconto.toFixed(2)).toBe('8.00');
  });
});
