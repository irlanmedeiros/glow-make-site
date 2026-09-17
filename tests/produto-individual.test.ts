import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { TIPOS_NA_VITRINE } from '@/lib/produto';

/**
 * Produto individual (>= R$ 50) e kit (livre) dividem a mesma vitrine e o
 * mesmo checkout. Sem Asaas o pedido e gravado sem cobranca (DECISOES #6),
 * que e o suficiente para provar o que interessa aqui.
 */
delete process.env.ASAAS_API_KEY;
delete process.env.MELHOR_ENVIO_TOKEN;

const prisma = new PrismaClient();
const SKU_IND = 'ZZ-TESTE-IND';
const SKU_KIT = 'ZZ-TESTE-KIT35';
const EMAIL = 'teste-int-individual@glowmake.test';
let idIndividual = '';
let idKit = '';

const cliente = {
  nome: 'Cliente Teste', email: EMAIL, documento: '529.982.247-25', telefone: '(83) 99999-0000',
  cep: '58038-000', endereco: 'Rua de Teste', enderecoNumero: '10', complemento: '',
  bairro: 'Centro', cidade: 'Cidade Teste', uf: 'PB', pagamento: 'PIX',
};

async function limpar() {
  const pedidos = await prisma.pedido.findMany({ where: { email: EMAIL }, select: { id: true } });
  await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: pedidos.map((p) => p.id) } } });
  await prisma.pedido.deleteMany({ where: { email: EMAIL } });
  await prisma.movimentacao.deleteMany({ where: { sku: { in: [SKU_IND, SKU_KIT] } } });
  await prisma.kit.deleteMany({ where: { sku: { in: [SKU_IND, SKU_KIT] } } });
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? '';
  if (/prod|production|main\b/i.test(url) && !/dev/i.test(url)) {
    throw new Error('DATABASE_URL parece apontar para produção. Use um branch de dev do Neon.');
  }
  await limpar();
  const ind = await prisma.kit.create({
    data: {
      sku: SKU_IND, nome: 'Batom Teste', slug: 'batom-teste', descricao: 'teste', itens: [],
      preco: new Prisma.Decimal('50.00'), imagem: '/assets/kits/kit-1.jpg', entradas: 5,
      ativo: true, tipo: 'INDIVIDUAL',
    },
  });
  const kit = await prisma.kit.create({
    data: {
      sku: SKU_KIT, nome: 'Kit Teste 35', slug: 'kit-teste-35', descricao: 'teste', itens: ['A'],
      preco: new Prisma.Decimal('35.00'), imagem: '/assets/kits/kit-1.jpg', entradas: 5,
      ativo: true, tipo: 'KIT',
    },
  });
  idIndividual = ind.id;
  idKit = kit.id;
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

describe('produto individual na loja', () => {
  it('aparece na vitrine junto com os kits, e a BOX fica de fora', async () => {
    const vitrine = await prisma.kit.findMany({
      where: { ativo: true, tipo: { in: TIPOS_NA_VITRINE } },
      select: { sku: true, tipo: true },
    });
    const skus = vitrine.map((v) => v.sku);
    expect(skus).toContain(SKU_IND);
    expect(skus).toContain(SKU_KIT);
    expect(vitrine.every((v) => v.tipo !== 'BOX')).toBe(true);
  });

  it('pode ser comprado no checkout, junto com um kit de R$ 35', async () => {
    const r = await checkout({ cliente, itens: [{ kitId: idIndividual, qtd: 1 }, { kitId: idKit, qtd: 1 }] });
    expect(r.status).toBe(200);

    const pedido = await prisma.pedido.findFirstOrThrow({
      where: { email: EMAIL }, orderBy: { criadoEm: 'desc' }, include: { itens: true },
    });
    expect(pedido.subtotal.toFixed(2)).toBe('85.00');
    expect(pedido.itens.map((i) => i.sku).sort()).toEqual([SKU_KIT, SKU_IND].sort());

    const ind = await prisma.kit.findUniqueOrThrow({ where: { id: idIndividual } });
    expect(ind.saidas).toBe(1);
  });
});
