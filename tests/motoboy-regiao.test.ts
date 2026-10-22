import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { ehMotoboy, SERVICO_MOTOBOY } from '@/lib/entrega';

/**
 * Motoboy e so para Joao Pessoa e as vizinhas (DECISOES #4B). A tela ja nao
 * oferece fora dali, mas quem decide e o SERVIDOR: o navegador manda qual
 * servico foi escolhido, e um pedido forjado nao pode virar entrega de
 * motoboy em Sao Paulo.
 *
 * Os dois CEPs entram no cache de CEP antes do teste, entao o resultado nao
 * depende do ViaCEP estar no ar.
 */

const prisma = new PrismaClient();
const SKU = 'ZZ-MOTO-INT';
const EMAIL = 'teste-int-motoboy@glowmake.test';
let kitId = '';

const CEP_LONGE = '01310100';
const CEP_DA_REGIAO = '58013420';

const cliente = (cep: string, cidade: string, uf: string) => ({
  nome: 'Cliente Teste', email: EMAIL, documento: '529.982.247-25', telefone: '(83) 99999-0000',
  cep, endereco: 'Rua de Teste', enderecoNumero: '10', complemento: '',
  bairro: 'Centro', cidade, uf, pagamento: 'PIX',
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

async function limpar() {
  const pedidos = await prisma.pedido.findMany({ where: { email: EMAIL }, select: { id: true } });
  await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: pedidos.map((p) => p.id) } } });
  await prisma.pedido.deleteMany({ where: { email: EMAIL } });
  await prisma.movimentacao.deleteMany({ where: { sku: SKU } });
  await prisma.kit.deleteMany({ where: { sku: SKU } });
}

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? '';
  if (/prod|production|main\b/i.test(url) && !/dev/i.test(url)) {
    throw new Error('DATABASE_URL parece apontar para produção. Use um branch de dev do Neon.');
  }
  delete process.env.ASAAS_API_KEY;
  delete process.env.MELHOR_ENVIO_TOKEN;

  for (const [cep, cidade, uf] of [
    [CEP_LONGE, 'São Paulo', 'SP'],
    [CEP_DA_REGIAO, 'João Pessoa', 'PB'],
  ] as const) {
    await prisma.cepConsultado.upsert({
      where: { cep },
      update: { cidade, uf },
      create: { cep, cidade, uf, logradouro: 'Rua de Teste', bairro: 'Centro' },
    });
  }

  await limpar();
  const kit = await prisma.kit.create({
    data: {
      sku: SKU, nome: 'Kit Teste Motoboy', slug: 'kit-teste-motoboy', descricao: 'teste', itens: [],
      preco: new Prisma.Decimal('120.00'), imagem: '/assets/kits/sem-foto.svg', entradas: 20,
      ativo: true, tipo: 'KIT',
    },
  });
  kitId = kit.id;
});

beforeEach(async () => {
  const pedidos = await prisma.pedido.findMany({ where: { email: EMAIL }, select: { id: true } });
  await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: pedidos.map((p) => p.id) } } });
  await prisma.pedido.deleteMany({ where: { email: EMAIL } });
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const ultimoPedido = () =>
  prisma.pedido.findFirstOrThrow({ where: { email: EMAIL }, orderBy: { criadoEm: 'desc' } });

describe('motoboy só na região de João Pessoa', () => {
  it('pedido de outro estado pedindo motoboy NÃO sai com motoboy', async () => {
    const r = await checkout({
      cliente: cliente(CEP_LONGE, 'São Paulo', 'SP'),
      itens: [{ kitId, qtd: 1 }],
      freteServico: SERVICO_MOTOBOY,
    });
    expect(r.status).toBe(200);

    const pedido = await ultimoPedido();
    expect(ehMotoboy(pedido.freteServico)).toBe(false);
    // E não ganha o recado de combinar a corrida pelo WhatsApp.
    expect(pedido.observacao ?? '').not.toMatch(/motoboy/i);
  });

  it('o frete de fora da região é cobrado, não vira zero', async () => {
    await checkout({
      cliente: cliente(CEP_LONGE, 'São Paulo', 'SP'),
      itens: [{ kitId, qtd: 1 }],
      freteServico: SERVICO_MOTOBOY,
    });
    const pedido = await ultimoPedido();
    const config = await prisma.config.findUnique({ where: { id: 'config' } });
    const reserva = Number(config?.freteValor?.toString() ?? '0');
    if (reserva > 0) {
      expect(Number(pedido.frete.toString())).toBe(reserva);
      expect(pedido.freteServico).toBe('Frete padrão');
    }
    expect(Number(pedido.total.toString())).toBe(120 + Number(pedido.frete.toString()));
  });

  it('na região, o motoboy escolhido vale e o pedido pede para combinar no WhatsApp', async () => {
    const r = await checkout({
      cliente: cliente(CEP_DA_REGIAO, 'João Pessoa', 'PB'),
      itens: [{ kitId, qtd: 1 }],
      freteServico: SERVICO_MOTOBOY,
    });
    expect(r.status).toBe(200);

    const pedido = await ultimoPedido();
    expect(pedido.freteServico).toBe(SERVICO_MOTOBOY);
    expect(Number(pedido.frete.toString())).toBe(0);
    expect(pedido.observacao ?? '').toMatch(/WhatsApp/i);
  });
});
