import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { baixarEstoque, devolverEstoque, EstoqueInsuficiente, saldo, statusEstoque } from '@/lib/estoque';
import { registrarVenda, cancelarVenda, resumoDoCaixa } from '@/lib/pdv';

/**
 * Testes de INTEGRAÇÃO: falam com um banco Postgres de verdade.
 *
 * A trava anti-corrida do estoque (docs/DECISOES.md #1) não dá para testar com
 * mock — o ponto dela é justamente o que o Postgres faz quando duas transações
 * disputam a mesma linha. Só banco real prova.
 */

const prisma = new PrismaClient();

const SKU = 'ZZ-TESTE-INT';
let kitId = '';

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL não configurada. Veja o README.');

  // Guarda de segurança: estes testes CRIAM E APAGAM dados. Rodar contra o
  // banco de produção mexeria em pedido, estoque e caixa reais.
  const ehProducao = /prod|production|main\b/i.test(url) && !/dev/i.test(url);
  if (ehProducao) {
    throw new Error(
      'DATABASE_URL parece apontar para produção. Estes testes escrevem no banco — use um branch de dev do Neon.'
    );
  }
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function limpar() {
  const kit = await prisma.kit.findUnique({ where: { sku: SKU } });
  if (kit) {
    await prisma.vendaLojaItem.deleteMany({ where: { kitId: kit.id } });
  }
  await prisma.vendaLoja.deleteMany({ where: { vendedora: { startsWith: 'TESTE-INT' } } });
  await prisma.caixa.deleteMany({ where: { abertoPor: { startsWith: 'TESTE-INT' } } });
  await prisma.movimentacao.deleteMany({ where: { sku: SKU } });
  await prisma.kit.deleteMany({ where: { sku: SKU } });
}

/** Recria o kit de teste com o saldo pedido. */
async function prepararKit(estoque: number) {
  await limpar();
  const kit = await prisma.kit.create({
    data: {
      sku: SKU,
      nome: 'Kit de Teste de Integração',
      slug: 'kit-de-teste-de-integracao',
      descricao: 'Criado e apagado pelo teste automatizado.',
      itens: ['Item A'],
      preco: new Prisma.Decimal('40.00'),
      imagem: '/assets/kits/kit-1.jpg',
      entradas: estoque,
      saidas: 0,
      ativo: true,
    },
  });
  kitId = kit.id;
  return kit;
}

const saldoDe = async () => {
  const k = await prisma.kit.findUniqueOrThrow({ where: { id: kitId } });
  return k.entradas - k.saidas;
};

describe('helpers puros de estoque', () => {
  it('saldo é entradas menos saídas', () => {
    expect(saldo({ entradas: 40, saidas: 5 })).toBe(35);
    expect(saldo({ entradas: 0, saidas: 0 })).toBe(0);
  });

  it('statusEstoque separa esgotado, acabando e disponível', () => {
    expect(statusEstoque(0).cls).toBe('out');
    expect(statusEstoque(-1).cls).toBe('out');
    expect(statusEstoque(5, 10).cls).toBe('low');
    expect(statusEstoque(10, 10).cls).toBe('low');
    expect(statusEstoque(11, 10).cls).toBe('ok');
  });
});

describe('baixarEstoque', () => {
  beforeEach(async () => {
    await prepararKit(10);
  });

  it('baixa o saldo e registra a movimentação', async () => {
    await prisma.$transaction((tx) => baixarEstoque(tx, [{ kitId, qtd: 3 }], 'Teste'));

    expect(await saldoDe()).toBe(7);
    const mov = await prisma.movimentacao.findFirst({ where: { sku: SKU }, orderBy: { criadoEm: 'desc' } });
    expect(mov).toMatchObject({ tipo: 'SAIDA', qtd: 3, origem: 'Teste', saldoApos: 7 });
  });

  it('deixa baixar exatamente o que resta', async () => {
    await prisma.$transaction((tx) => baixarEstoque(tx, [{ kitId, qtd: 10 }], 'Teste'));
    expect(await saldoDe()).toBe(0);
  });

  it('recusa uma unidade a mais do que existe', async () => {
    await expect(
      prisma.$transaction((tx) => baixarEstoque(tx, [{ kitId, qtd: 11 }], 'Teste'))
    ).rejects.toBeInstanceOf(EstoqueInsuficiente);
    expect(await saldoDe()).toBe(10);
  });

  it('recusa quantidade zero, negativa ou fracionada', async () => {
    for (const qtd of [0, -1, 1.5]) {
      await expect(
        prisma.$transaction((tx) => baixarEstoque(tx, [{ kitId, qtd }], 'Teste')),
        String(qtd)
      ).rejects.toThrow();
    }
    expect(await saldoDe()).toBe(10);
  });

  it('desfaz a baixa do primeiro item quando o segundo não cabe', async () => {
    // Carrinho com dois itens: o primeiro cabe, o segundo não. Sem transação,
    // o cliente perderia estoque de um produto num pedido que nem existe.
    const outro = await prepararKit(10);
    const kitB = await prisma.kit.create({
      data: {
        sku: SKU + '-B',
        nome: 'Kit B',
        slug: 'kit-b-teste',
        descricao: '',
        itens: [],
        preco: new Prisma.Decimal('10.00'),
        imagem: '/assets/kits/kit-1.jpg',
        entradas: 1,
        saidas: 0,
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        baixarEstoque(tx, [{ kitId: outro.id, qtd: 5 }, { kitId: kitB.id, qtd: 99 }], 'Teste')
      )
    ).rejects.toBeInstanceOf(EstoqueInsuficiente);

    expect(await saldoDe()).toBe(10); // o primeiro item voltou atrás
    const b = await prisma.kit.findUniqueOrThrow({ where: { id: kitB.id } });
    expect(b.entradas - b.saidas).toBe(1);

    await prisma.movimentacao.deleteMany({ where: { sku: kitB.sku } });
    await prisma.kit.delete({ where: { id: kitB.id } });
  });
});

describe('baixarEstoque — a corrida que a trava existe para impedir', () => {
  it('com 1 unidade e 8 compras ao mesmo tempo, exatamente uma passa', async () => {
    await prepararKit(1);

    const tentativas = Array.from({ length: 8 }, (_, i) =>
      prisma
        .$transaction((tx) => baixarEstoque(tx, [{ kitId, qtd: 1 }], `Corrida ${i}`))
        .then(() => 'ok' as const)
        .catch(() => 'falhou' as const)
    );

    const r = await Promise.all(tentativas);
    expect(r.filter((x) => x === 'ok')).toHaveLength(1);
    expect(r.filter((x) => x === 'falhou')).toHaveLength(7);

    // O que importa de verdade: o saldo nunca fica negativo.
    expect(await saldoDe()).toBe(0);
  });

  it('com 5 unidades e 20 compras ao mesmo tempo, passam exatamente 5', async () => {
    await prepararKit(5);

    const r = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        prisma
          .$transaction((tx) => baixarEstoque(tx, [{ kitId, qtd: 1 }], `Corrida ${i}`))
          .then(() => 'ok' as const)
          .catch(() => 'falhou' as const)
      )
    );

    expect(r.filter((x) => x === 'ok')).toHaveLength(5);
    expect(await saldoDe()).toBe(0);
  });
});

describe('devolverEstoque', () => {
  it('devolve abatendo as saídas, sem inflar as entradas', async () => {
    const kit = await prepararKit(10);
    await prisma.$transaction((tx) => baixarEstoque(tx, [{ kitId, qtd: 4 }], 'Teste'));
    await prisma.$transaction((tx) => devolverEstoque(tx, [{ kitId, qtd: 4 }], 'Cancelamento'));

    const depois = await prisma.kit.findUniqueOrThrow({ where: { id: kitId } });
    expect(depois.entradas).toBe(kit.entradas); // entradas = o que realmente entrou
    expect(depois.saidas).toBe(0);
    expect(depois.entradas - depois.saidas).toBe(10);

    const mov = await prisma.movimentacao.findFirst({ where: { sku: SKU }, orderBy: { criadoEm: 'desc' } });
    expect(mov).toMatchObject({ tipo: 'ENTRADA', qtd: 4, origem: 'Cancelamento' });
  });
});

describe('registrarVenda — PDV do balcão', () => {
  beforeEach(async () => {
    await prepararKit(10);
  });

  it('registra a venda, baixa o estoque e calcula pelo preço do BANCO', async () => {
    const r = await registrarVenda({
      itens: [{ kitId, qtd: 2 }],
      vendedora: 'TESTE-INT Ana',
      formaPagamento: 'DINHEIRO',
      desconto: 0,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.total).toBe(80); // 2 x 40,00 do banco
    expect(await saldoDe()).toBe(8);
  });

  it('aplica desconto sobre o subtotal', async () => {
    const r = await registrarVenda({
      itens: [{ kitId, qtd: 2 }],
      vendedora: 'TESTE-INT Ana',
      formaPagamento: 'PIX',
      desconto: 15,
    });
    expect(r.ok && r.total).toBe(65);
  });

  it('recusa desconto maior que a venda — não existe venda de valor negativo', async () => {
    const r = await registrarVenda({
      itens: [{ kitId, qtd: 1 }],
      vendedora: 'TESTE-INT Ana',
      formaPagamento: 'DINHEIRO',
      desconto: 999,
    });
    expect(r.ok).toBe(false);
    expect(await saldoDe()).toBe(10);
  });

  it('recusa carrinho vazio e forma de pagamento inventada', async () => {
    expect((await registrarVenda({ itens: [], vendedora: 'x', formaPagamento: 'DINHEIRO', desconto: 0 })).ok).toBe(false);
    const r = await registrarVenda({
      itens: [{ kitId, qtd: 1 }],
      vendedora: 'TESTE-INT Ana',
      // @ts-expect-error — é exatamente o que um cliente forjado mandaria
      formaPagamento: 'FIADO',
      desconto: 0,
    });
    expect(r.ok).toBe(false);
    expect(await saldoDe()).toBe(10);
  });

  it('recusa vender mais do que tem, sem gravar venda nenhuma', async () => {
    const antes = await prisma.vendaLoja.count();
    const r = await registrarVenda({
      itens: [{ kitId, qtd: 50 }],
      vendedora: 'TESTE-INT Ana',
      formaPagamento: 'DINHEIRO',
      desconto: 0,
    });
    expect(r.ok).toBe(false);
    expect(await prisma.vendaLoja.count()).toBe(antes);
    expect(await saldoDe()).toBe(10);
  });

  it('cancelar devolve o estoque uma única vez', async () => {
    const r = await registrarVenda({
      itens: [{ kitId, qtd: 3 }],
      vendedora: 'TESTE-INT Ana',
      formaPagamento: 'DINHEIRO',
      desconto: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await saldoDe()).toBe(7);

    expect((await cancelarVenda(r.id, 'engano')).ok).toBe(true);
    expect(await saldoDe()).toBe(10);

    // Segundo cancelamento não pode devolver de novo.
    const segundo = await cancelarVenda(r.id, 'de novo');
    expect(segundo.ok).toBe(false);
    expect(await saldoDe()).toBe(10);
  });
});

describe('resumoDoCaixa — o esperado na gaveta', () => {
  it('soma troco inicial e DINHEIRO; PIX e cartão ficam de fora', async () => {
    await prepararKit(20);
    const caixa = await prisma.caixa.create({
      data: { abertoPor: 'TESTE-INT Ana', trocoInicial: new Prisma.Decimal('100.00') },
    });

    // 40 em dinheiro, 40 em PIX, 40 no crédito.
    for (const forma of ['DINHEIRO', 'PIX', 'CREDITO'] as const) {
      const r = await registrarVenda({
        itens: [{ kitId, qtd: 1 }],
        vendedora: 'TESTE-INT Ana',
        formaPagamento: forma,
        desconto: 0,
      });
      expect(r.ok, forma).toBe(true);
    }

    const resumo = await resumoDoCaixa(caixa.id);

    expect(resumo.quantidade).toBe(3);
    expect(resumo.totalVendas).toBe(120);
    // Somar tudo aqui é o erro clássico que faz o fechamento nunca bater.
    expect(resumo.esperadoNaGaveta).toBe(140); // 100 de troco + 40 em dinheiro
    expect(resumo.porForma.find((p) => p.forma === 'PIX')?.total).toBe(40);
    expect(resumo.porForma.find((p) => p.forma === 'DINHEIRO')?.total).toBe(40);
  });

  it('venda cancelada sai da conta do caixa', async () => {
    await prepararKit(20);
    const caixa = await prisma.caixa.create({
      data: { abertoPor: 'TESTE-INT Bia', trocoInicial: new Prisma.Decimal('50.00') },
    });

    const r = await registrarVenda({
      itens: [{ kitId, qtd: 1 }],
      vendedora: 'TESTE-INT Bia',
      formaPagamento: 'DINHEIRO',
      desconto: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect((await resumoDoCaixa(caixa.id)).esperadoNaGaveta).toBe(90);
    await cancelarVenda(r.id, 'teste');
    expect((await resumoDoCaixa(caixa.id)).esperadoNaGaveta).toBe(50);
  });
});
