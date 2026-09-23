import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { lerExtrato } from '@/lib/extrato';
import { conferir } from '@/lib/conciliacao';

/**
 * Integracao: o caminho inteiro da confererencia da maquininha, do arquivo ate
 * o cruzamento com as vendas gravadas. O que se prova aqui e o caso que dói:
 * transacao no extrato sem venda no sistema significa estoque que nao baixou.
 */

const prisma = new PrismaClient();
const SKU = 'ZZ-CONF-INT';
const VENDEDORA = 'ZZ Teste Conferencia';

beforeAll(() => {
  const url = process.env.DATABASE_URL ?? '';
  if (/prod|production|main\b/i.test(url) && !/dev/i.test(url)) {
    throw new Error('DATABASE_URL parece apontar para produção. Use um branch de dev do Neon.');
  }
});

async function limpar() {
  const vendas = await prisma.vendaLoja.findMany({ where: { vendedora: VENDEDORA }, select: { id: true } });
  await prisma.vendaLojaItem.deleteMany({ where: { vendaId: { in: vendas.map((v) => v.id) } } });
  await prisma.vendaLoja.deleteMany({ where: { vendedora: VENDEDORA } });
  await prisma.kit.deleteMany({ where: { sku: SKU } });
}
beforeEach(limpar);
afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

const base = new Date();
base.setHours(14, 0, 0, 0);
const dia = `${String(base.getDate()).padStart(2, '0')}/${String(base.getMonth() + 1).padStart(2, '0')}/${base.getFullYear()}`;
const hora = (min: number) => {
  const d = new Date(base.getTime() + min * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

async function venderNoCartao(total: number, minuto: number, codigo: string | null) {
  const kit = await prisma.kit.upsert({
    where: { sku: SKU },
    update: {},
    create: {
      sku: SKU, nome: 'Teste conferência', slug: 'teste-conferencia', descricao: 'x', itens: [],
      preco: new Prisma.Decimal('40.00'), imagem: '/assets/kits/sem-foto.svg', entradas: 50, ativo: false, tipo: 'KIT',
    },
  });
  return prisma.vendaLoja.create({
    data: {
      vendedora: VENDEDORA, formaPagamento: 'CREDITO',
      subtotal: new Prisma.Decimal(total.toFixed(2)), total: new Prisma.Decimal(total.toFixed(2)),
      codigoMaquineta: codigo, criadoEm: new Date(base.getTime() + minuto * 60000),
      itens: { create: [{ kitId: kit.id, sku: SKU, nome: kit.nome, preco: new Prisma.Decimal(total.toFixed(2)), qtd: 1 }] },
    },
  });
}

const arquivo = (linhas: string[]) =>
  new TextEncoder().encode(
    ['Data;Hora;NSU;Tipo;Bandeira;Valor bruto;Valor líquido;Status', ...linhas].join('\n')
  ).buffer as ArrayBuffer;

describe('conferência da maquininha, do arquivo às vendas gravadas', () => {
  it('casa pelo comprovante e por valor, e separa as duas sobras', async () => {
    const comNsu = await venderNoCartao(80, 0, '123456');
    const semNsu = await venderNoCartao(120, 20, null);
    const soNoSistema = await venderNoCartao(55, 40, null);

    const leitura = await lerExtrato(
      arquivo([
        `${dia};${hora(2)};123456;Crédito;Visa;80,00;77,60;Aprovada`,
        `${dia};${hora(21)};999888;Crédito;Master;120,00;116,40;Aprovada`,
        `${dia};${hora(70)};777666;Débito;Elo;95,00;93,58;Aprovada`,
        `${dia};${hora(120)};555444;Crédito;Visa;70,00;67,90;Cancelada`,
      ]),
      'extrato.csv'
    );
    expect(leitura.aviso).toBeUndefined();

    const vendas = [comNsu, semNsu, soNoSistema].map((v) => ({
      id: v.id, numero: v.numero, criadoEm: v.criadoEm.toISOString(),
      total: Number(v.total.toString()), codigoMaquineta: v.codigoMaquineta,
    }));
    const r = conferir(vendas, leitura.linhas);

    expect(r.pares.map((p) => [p.venda.numero, p.como])).toEqual([
      [comNsu.numero, 'comprovante'],
      [semNsu.numero, 'valor e horario'],
    ]);

    // Passou o cartão e ninguém registrou: o estoque dessa peça não baixou.
    expect(r.transacoesSemVenda.map((t) => t.codigo)).toEqual(['777666']);
    // Registrado no sistema e sem transação no extrato.
    expect(r.vendasSemTransacao.map((v) => v.numero)).toEqual([soNoSistema.numero]);
    // Cancelada no extrato não casa com venda boa nem conta como sobra.
    expect(r.canceladas.map((t) => t.codigo)).toEqual(['555444']);

    expect(r.totais.vendas).toBe(200);
    expect(r.totais.taxa).toBe(6);
    expect(r.totais.diferenca).toBe(0);
  });

  it('venda cancelada no sistema não entra na conferência', async () => {
    const v = await venderNoCartao(80, 0, '123456');
    await prisma.vendaLoja.update({ where: { id: v.id }, data: { cancelada: true, canceladaEm: new Date() } });

    const doBanco = await prisma.vendaLoja.findMany({
      where: { vendedora: VENDEDORA, cancelada: false, formaPagamento: { in: ['DEBITO', 'CREDITO'] } },
    });
    expect(doBanco).toHaveLength(0);
  });
});
