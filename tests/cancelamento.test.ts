import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { baixarEstoque } from '@/lib/estoque';
import {
  buscarDaCliente,
  cancelarAssinaturaPelaCliente,
  cancelarPedido,
  recusarCancelamentoPedido,
  solicitarCancelamentoPedido,
  ErroCancelamento,
} from '@/lib/cancelamento';

/**
 * Integracao: cancelamento pela cliente e aprovacao pelo admin.
 *
 * O ponto que so banco real prova e o mesmo do estoque: duas aprovacoes ao
 * mesmo tempo nao podem devolver o estoque duas vezes.
 */

const prisma = new PrismaClient();

const SKU = 'ZZ-TESTE-CANCEL';
const EMAIL = 'teste-int-cancelamento@glowmake.test';
// CPF valido pelos digitos verificadores, gerado para teste.
const CPF = '529.982.247-25';
const cred = { email: EMAIL, documento: '52998224725' };
let kitId = '';

beforeAll(() => {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL não configurada. Veja o README.');
  if (/prod|production|main\b/i.test(url) && !/dev/i.test(url)) {
    throw new Error('DATABASE_URL parece apontar para produção. Use um branch de dev do Neon.');
  }
});

afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limpar();
  const kit = await prisma.kit.create({
    data: {
      sku: SKU,
      nome: 'Kit de Teste de Cancelamento',
      slug: 'kit-de-teste-de-cancelamento',
      descricao: 'Criado e apagado pelo teste automatizado.',
      itens: ['Item A'],
      preco: new Prisma.Decimal('40.00'),
      imagem: '/assets/kits/kit-1.jpg',
      entradas: 10,
      saidas: 0,
      ativo: true,
    },
  });
  kitId = kit.id;
});

async function limpar() {
  await prisma.pedido.deleteMany({ where: { email: EMAIL } });
  await prisma.assinante.deleteMany({ where: { email: EMAIL } });
  await prisma.movimentacao.deleteMany({ where: { sku: SKU } });
  await prisma.kit.deleteMany({ where: { sku: SKU } });
}

/** Cria um pedido como o checkout cria: com a baixa de estoque na mesma transacao. */
async function criarPedido(status: 'AGUARDANDO_PAGAMENTO' | 'PAGO' | 'ENVIADO' = 'AGUARDANDO_PAGAMENTO', qtd = 2) {
  return prisma.$transaction(async (tx) => {
    await baixarEstoque(tx, [{ kitId, qtd }], 'Pedido de teste');
    return tx.pedido.create({
      data: {
        nome: 'Cliente Teste',
        email: EMAIL,
        documento: CPF,
        telefone: '(83) 99999-0000',
        cep: '58000-000',
        subtotal: new Prisma.Decimal('80.00'),
        frete: new Prisma.Decimal('0'),
        total: new Prisma.Decimal('80.00'),
        pagamento: 'PIX',
        status,
        itens: { create: [{ kitId, sku: SKU, nome: 'Kit de Teste de Cancelamento', preco: new Prisma.Decimal('40.00'), qtd }] },
      },
    });
  });
}

const saldo = async () => {
  const k = await prisma.kit.findUniqueOrThrow({ where: { id: kitId } });
  return k.entradas - k.saidas;
};

describe('consulta da cliente', () => {
  it('acha o pedido com o documento digitado sem mascara', async () => {
    await criarPedido();
    const r = await buscarDaCliente(cred);
    expect(r.pedidos).toHaveLength(1);
    expect(r.pedidos[0].cancelamento.tipo).toBe('pode-solicitar');
  });

  it('nao entrega o pedido com o CPF de outra pessoa', async () => {
    await criarPedido();
    const r = await buscarDaCliente({ email: EMAIL, documento: '111.444.777-35' });
    expect(r.pedidos).toHaveLength(0);
  });

  it('nao expoe endereco, telefone nem documento', async () => {
    await criarPedido();
    const [p] = (await buscarDaCliente(cred)).pedidos;
    const campos = Object.keys(p);
    for (const proibido of ['documento', 'telefone', 'endereco', 'email', 'cep']) {
      expect(campos).not.toContain(proibido);
    }
  });
});

describe('cancelamento de pedido', () => {
  it('solicitar nao cancela nem devolve estoque', async () => {
    const pedido = await criarPedido();
    await solicitarCancelamentoPedido(cred, pedido.id, 'Comprei errado');

    const depois = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(depois.status).toBe('AGUARDANDO_PAGAMENTO');
    expect(depois.cancelamentoMotivo).toBe('Comprei errado');
    expect(await saldo()).toBe(8);
  });

  it('com o documento errado, recusa sem dizer que o pedido existe', async () => {
    const pedido = await criarPedido();
    await expect(
      solicitarCancelamentoPedido({ email: EMAIL, documento: '11144477735' }, pedido.id, '')
    ).rejects.toThrow(/Nao encontramos/);
  });

  it('nao aceita duas solicitacoes nem pedido ja enviado', async () => {
    const pedido = await criarPedido();
    await solicitarCancelamentoPedido(cred, pedido.id, '');
    await expect(solicitarCancelamentoPedido(cred, pedido.id, '')).rejects.toBeInstanceOf(ErroCancelamento);

    const enviado = await criarPedido('ENVIADO', 1);
    await expect(solicitarCancelamentoPedido(cred, enviado.id, '')).rejects.toThrow(/saiu para entrega/);
  });

  it('aprovar cancela, devolve o estoque e registra a resposta', async () => {
    const pedido = await criarPedido('PAGO');
    await solicitarCancelamentoPedido(cred, pedido.id, '');
    const r = await cancelarPedido(pedido.id, 'Aprovado');

    expect(r.precisaEstorno).toBe(true);
    const depois = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } });
    expect(depois.status).toBe('CANCELADO');
    expect(depois.estoqueDevolvido).toBe(true);
    expect(depois.cancelamentoResposta).toBe('Aprovado');
    expect(await saldo()).toBe(10);
  });

  it('pedido nao pago cancelado nao pede estorno', async () => {
    const pedido = await criarPedido();
    expect((await cancelarPedido(pedido.id)).precisaEstorno).toBe(false);
  });

  it('duas aprovacoes ao mesmo tempo devolvem o estoque uma vez so', async () => {
    const pedido = await criarPedido('PAGO', 3);
    expect(await saldo()).toBe(7);

    await Promise.allSettled([cancelarPedido(pedido.id), cancelarPedido(pedido.id)]);

    expect(await saldo()).toBe(10);
    const entradas = await prisma.movimentacao.count({ where: { sku: SKU, tipo: 'ENTRADA' } });
    expect(entradas).toBe(1);
  });

  it('recusar deixa o pedido de pe e a cliente ve a resposta', async () => {
    const pedido = await criarPedido('PAGO');
    await solicitarCancelamentoPedido(cred, pedido.id, '');
    await expect(recusarCancelamentoPedido(pedido.id, 'no')).rejects.toThrow(/motivo/);
    await recusarCancelamentoPedido(pedido.id, 'Ja foi separado e postado hoje.');

    const [p] = (await buscarDaCliente(cred)).pedidos;
    expect(p.status).toBe('PAGO');
    expect(p.cancelamento).toEqual({ tipo: 'recusado', resposta: 'Ja foi separado e postado hoje.' });
    expect(await saldo()).toBe(8);
  });
});

describe('cancelamento de assinatura pela assinante', () => {
  async function criarAssinante(status: 'ATIVA' | 'AGUARDANDO_PAGAMENTO') {
    return prisma.assinante.create({
      data: {
        nome: 'Assinante Teste',
        email: EMAIL,
        documento: CPF,
        telefone: '(83) 99999-0000',
        cep: '58000-000',
        valor: new Prisma.Decimal('99.90'),
        status,
        contratoVersao: 'v1',
        contratoAceitoEm: new Date(),
      },
    });
  }

  it('exige a confirmacao no servidor', async () => {
    const a = await criarAssinante('ATIVA');
    await expect(cancelarAssinaturaPelaCliente(cred, a.id, false, null)).rejects.toThrow(/Confirme/);
    expect((await prisma.assinante.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('ATIVA');
  });

  it('cancela guardando a prova: quem, IP e versao aceita', async () => {
    const a = await criarAssinante('ATIVA');
    await cancelarAssinaturaPelaCliente(cred, a.id, true, '203.0.113.7');

    const depois = await prisma.assinante.findUniqueOrThrow({ where: { id: a.id } });
    expect(depois.status).toBe('CANCELADA');
    expect(depois.canceladaPor).toBe('CLIENTE');
    expect(depois.cancelamentoIp).toBe('203.0.113.7');
    expect(depois.cancelamentoContratoVersao).toBe('v1');

    await expect(cancelarAssinaturaPelaCliente(cred, a.id, true, null)).rejects.toThrow(/já está cancelada|ja esta cancelada/);
  });

});
