import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Ponta a ponta da rota de checkout com cupom, contra o banco de dev.
 *
 * Sem ASAAS_API_KEY a rota entra no modo sem cobranca (docs/DECISOES.md #6):
 * grava o pedido e baixa estoque, sem chamar o Asaas. E o que este teste quer:
 * provar o que fica gravado sem gerar cobranca em conta nenhuma.
 */
delete process.env.ASAAS_API_KEY;
delete process.env.MELHOR_ENVIO_TOKEN;

const prisma = new PrismaClient();
const SKU = 'ZZ-TESTE-CUPOM';
const EMAIL = 'teste-int-checkout-cupom@glowmake.test';
const CODIGO = 'ZZTESTE-CHECKOUT';
const AFILIADO = 'ZZTESTEAF';
let kitId = '';

const cliente = {
  nome: 'Amiga Teste',
  email: EMAIL,
  documento: '529.982.247-25',
  telefone: '(83) 99999-0000',
  cep: '58038-000',
  endereco: 'Rua de Teste',
  enderecoNumero: '10',
  complemento: '',
  bairro: 'Centro',
  cidade: 'Cidade Teste',
  uf: 'PB',
  pagamento: 'PIX',
};

async function limpar() {
  const emails = [EMAIL, 'outra-' + EMAIL];
  const pedidos = await prisma.pedido.findMany({ where: { email: { in: emails } }, select: { id: true } });
  await prisma.comissao.deleteMany({ where: { pedidoId: { in: pedidos.map((p) => p.id) } } });
  await prisma.pedido.deleteMany({ where: { email: { in: emails } } });
  await prisma.cupom.deleteMany({ where: { codigo: CODIGO } });
  await prisma.afiliado.deleteMany({ where: { codigo: AFILIADO } });
  await prisma.movimentacao.deleteMany({ where: { sku: SKU } });
  await prisma.kit.deleteMany({ where: { sku: SKU } });
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? '';
  if (/prod|production|main\b/i.test(url) && !/dev/i.test(url)) {
    throw new Error('DATABASE_URL parece apontar para produção. Use um branch de dev do Neon.');
  }
  await limpar();
  const kit = await prisma.kit.create({
    data: {
      sku: SKU, nome: 'Kit Teste Cupom', slug: 'kit-teste-cupom', descricao: 'teste', itens: ['A'],
      preco: new Prisma.Decimal('40.00'), imagem: '/assets/kits/kit-1.jpg', entradas: 10, ativo: true,
    },
  });
  kitId = kit.id;
  await prisma.cupom.create({
    data: { codigo: CODIGO, tipo: 'PERCENTUAL', valor: new Prisma.Decimal('10'), indicadorNome: 'Indicadora' },
  });
  await prisma.afiliado.create({
    data: { nome: 'Afiliado Teste', codigo: AFILIADO, email: 'af@glowmake.test', percentual: new Prisma.Decimal('50') },
  });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

async function checkout(corpo: Record<string, unknown>) {
  const { POST } = await import('@/app/api/checkout/route');
  const r = await POST(
    new Request('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  );
  return { status: r.status, corpo: await r.json() };
}

describe('checkout com cupom', () => {
  it('grava desconto, total liquido e codigo; comissao sobre o valor pago', async () => {
    const r = await checkout({ cliente, itens: [{ kitId, qtd: 2 }], cupom: 'zzteste-checkout', ref: AFILIADO });
    expect(r.status).toBe(200);

    const pedido = await prisma.pedido.findFirstOrThrow({ where: { email: EMAIL }, orderBy: { criadoEm: 'desc' } });
    expect(pedido.subtotal.toFixed(2)).toBe('80.00');
    expect(pedido.desconto.toFixed(2)).toBe('8.00');
    expect(pedido.total.toFixed(2)).toBe(pedido.subtotal.sub(8).add(pedido.frete).toFixed(2));
    expect(pedido.cupomCodigo).toBe(CODIGO);

    const comissao = await prisma.comissao.findFirstOrThrow({ where: { pedidoId: pedido.id } });
    expect(comissao.valorBase.toFixed(2)).toBe('72.00');
    expect(comissao.valor.toFixed(2)).toBe('36.00');
  });

  it('segunda compra da mesma cliente com o cupom e barrada, sem gravar pedido nem baixar estoque', async () => {
    const antes = await prisma.kit.findUniqueOrThrow({ where: { id: kitId } });
    const r = await checkout({ cliente, itens: [{ kitId, qtd: 1 }], cupom: CODIGO });
    expect(r.status).toBe(400);
    expect(r.corpo).toMatchObject({ campo: 'cupom' });
    expect(await prisma.pedido.count({ where: { email: EMAIL } })).toBe(1);
    const depois = await prisma.kit.findUniqueOrThrow({ where: { id: kitId } });
    expect(depois.saidas).toBe(antes.saidas);
  });

  it('o preco enviado pelo navegador continua ignorado', async () => {
    const r = await checkout({
      cliente: { ...cliente, email: 'outra-' + EMAIL },
      itens: [{ kitId, qtd: 1, preco: 1 }],
      desconto: 999,
    });
    expect(r.status).toBe(200);
    const p = await prisma.pedido.findFirstOrThrow({ where: { email: 'outra-' + EMAIL } });
    expect(p.subtotal.toFixed(2)).toBe('40.00');
    expect(p.desconto.toFixed(2)).toBe('0.00');
    await prisma.pedido.delete({ where: { id: p.id } });
  });
});
