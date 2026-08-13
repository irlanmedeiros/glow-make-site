import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { baixarEstoque, devolverEstoque, EstoqueInsuficiente } from './estoque';

/**
 * PDV — venda no balcão da loja física.
 *
 * A regra que orienta tudo aqui: venda física é VENDA, não movimento de
 * estoque. Antes o balcão só derrubava o saldo, e o dinheiro não existia em
 * lugar nenhum — a loja vendia R$ 500 no dia e o painel mostrava zero.
 *
 * A baixa usa exatamente a mesma trava do checkout do site (SQL condicional
 * dentro de transação), então balcão e site disputam a última unidade com a
 * mesma proteção. Não existe caminho "de dentro" mais frouxo.
 */

export type ItemVenda = { kitId: string; qtd: number };

export type ResultadoVenda =
  | { ok: true; numero: number; id: string; total: number }
  | { ok: false; erro: string };

export const FORMAS = ['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO'] as const;
export type FormaPagamento = (typeof FORMAS)[number];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  DEBITO: 'Cartão de débito',
  CREDITO: 'Cartão de crédito',
};

/** Caixa aberto no momento, se houver. */
export async function caixaAberto() {
  return prisma.caixa.findFirst({
    where: { fechadoEm: null },
    orderBy: { abertoEm: 'desc' },
  });
}

export async function registrarVenda(params: {
  itens: ItemVenda[];
  vendedora: string;
  formaPagamento: FormaPagamento;
  desconto: number;
  observacao?: string;
}): Promise<ResultadoVenda> {
  const itens = params.itens.filter(
    (i) => i.kitId && Number.isInteger(i.qtd) && i.qtd > 0 && i.qtd <= 200
  );
  if (!itens.length) return { ok: false, erro: 'Nenhum item na venda.' };
  if (!FORMAS.includes(params.formaPagamento)) {
    return { ok: false, erro: 'Forma de pagamento inválida.' };
  }

  // Preço vem SEMPRE do banco, nunca da tela. O mesmo motivo do site: preço
  // enviado pelo navegador é preço escolhido por quem envia.
  const kits = await prisma.kit.findMany({ where: { id: { in: itens.map((i) => i.kitId) } } });
  if (kits.length !== new Set(itens.map((i) => i.kitId)).size) {
    return { ok: false, erro: 'Algum produto não foi encontrado. Atualize a tela.' };
  }

  const linhas = itens.map((i) => {
    const kit = kits.find((k) => k.id === i.kitId)!;
    return { kit, qtd: i.qtd, valor: kit.preco.mul(i.qtd) };
  });

  const subtotal = linhas.reduce((s, l) => s.add(l.valor), new Prisma.Decimal(0));

  const desconto = new Prisma.Decimal(Math.max(0, params.desconto || 0).toFixed(2));
  if (desconto.gt(subtotal)) {
    return { ok: false, erro: 'O desconto não pode ser maior que o valor da venda.' };
  }
  const total = subtotal.sub(desconto);

  const caixa = await caixaAberto();
  const vendedora = params.vendedora.trim().slice(0, 60) || 'Não informado';

  try {
    const venda = await prisma.$transaction(async (tx) => {
      await baixarEstoque(
        tx,
        itens,
        `Venda no balcão — ${vendedora}`
      );

      return tx.vendaLoja.create({
        data: {
          vendedora,
          formaPagamento: params.formaPagamento,
          subtotal,
          desconto,
          total,
          observacao: params.observacao?.trim().slice(0, 300) || null,
          caixaId: caixa?.id ?? null,
          itens: {
            create: linhas.map((l) => ({
              kitId: l.kit.id,
              sku: l.kit.sku,
              nome: l.kit.nome,
              preco: l.kit.preco,
              qtd: l.qtd,
            })),
          },
        },
      });
    });

    return { ok: true, numero: venda.numero, id: venda.id, total: Number(total.toString()) };
  } catch (e) {
    if (e instanceof EstoqueInsuficiente) return { ok: false, erro: e.message };
    console.error('[pdv] venda falhou:', e);
    return { ok: false, erro: 'Não consegui registrar a venda. Tente de novo.' };
  }
}

/** Cancela a venda e devolve as unidades ao estoque, uma única vez. */
export async function cancelarVenda(id: string, motivo: string): Promise<ResultadoVenda | { ok: boolean; erro?: string }> {
  const venda = await prisma.vendaLoja.findUnique({ where: { id }, include: { itens: true } });
  if (!venda) return { ok: false, erro: 'Venda não encontrada.' };
  if (venda.cancelada) return { ok: false, erro: 'Essa venda já foi cancelada.' };

  await prisma.$transaction(async (tx) => {
    await devolverEstoque(
      tx,
      venda.itens.filter((i) => i.kitId).map((i) => ({ kitId: i.kitId!, qtd: i.qtd })),
      `Cancelamento da venda #${venda.numero}`
    );
    await tx.vendaLoja.update({
      where: { id },
      data: {
        cancelada: true,
        canceladaEm: new Date(),
        motivoCancelamento: motivo.trim().slice(0, 200) || null,
      },
    });
  });

  return { ok: true };
}

export type ResumoCaixa = {
  porForma: { forma: FormaPagamento; rotulo: string; quantidade: number; total: number }[];
  totalVendas: number;
  quantidade: number;
  esperadoNaGaveta: number;
};

/**
 * Fecha a conta do caixa.
 *
 * `esperadoNaGaveta` é só troco inicial + dinheiro vivo — PIX e cartão não
 * entram na gaveta. Somar tudo aqui é o erro clássico que faz o fechamento
 * nunca bater.
 */
export async function resumoDoCaixa(caixaId: string): Promise<ResumoCaixa> {
  const caixa = await prisma.caixa.findUnique({ where: { id: caixaId } });
  const vendas = await prisma.vendaLoja.findMany({
    where: { caixaId, cancelada: false },
  });

  const porForma = FORMAS.map((forma) => {
    const doTipo = vendas.filter((v) => v.formaPagamento === forma);
    return {
      forma,
      rotulo: ROTULO_FORMA[forma],
      quantidade: doTipo.length,
      total: doTipo.reduce((s, v) => s + Number(v.total.toString()), 0),
    };
  });

  const totalVendas = vendas.reduce((s, v) => s + Number(v.total.toString()), 0);
  const emDinheiro = porForma.find((p) => p.forma === 'DINHEIRO')?.total ?? 0;
  const troco = Number((caixa?.trocoInicial ?? 0).toString());

  return {
    porForma,
    totalVendas,
    quantidade: vendas.length,
    esperadoNaGaveta: troco + emDinheiro,
  };
}

/** Busca produto pelo código de barras bipado, ou pelo SKU digitado. */
export async function buscarPorCodigo(codigo: string) {
  const limpo = codigo.trim();
  if (!limpo) return null;
  return prisma.kit.findFirst({
    where: {
      ativo: true,
      OR: [{ codigoBarras: limpo }, { sku: limpo.toUpperCase() }],
    },
  });
}
