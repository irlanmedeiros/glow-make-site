import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { baixarEstoque, devolverEstoque, EstoqueInsuficiente } from './estoque';
import {
  asaasConfigurado,
  buscarQrCodePix,
  consultarPagamento,
  criarCobranca,
  criarOuBuscarCliente,
} from './asaas';

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

export type QrVenda = { payload: string; imagemBase64: string };

export type ResultadoVenda =
  | { ok: true; numero: number; id: string; total: number; pix?: QrVenda | null; aviso?: string }
  | { ok: false; erro: string };

export const FORMAS = ['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO'] as const;
export type FormaPagamento = (typeof FORMAS)[number];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  DEBITO: 'Cartão de débito',
  CREDITO: 'Cartão de crédito',
};

/* Prefixo da referência externa da cobrança do balcão. É por ele que o
   webhook do Asaas reconhece que o pagamento é de uma venda de loja e não de
   um pedido do site. */
export const REF_VENDA_BALCAO = 'venda:';

/**
 * Cria a cobrança PIX de uma venda de balcão e devolve o QR.
 *
 * Diferente do site, aqui não existe cadastro de quem está comprando — a
 * pessoa está na frente da vendedora, não vai digitar CPF para levar um kit de
 * R$ 40. Então todas as vendas de balcão apontam para um cliente único
 * ("Consumidor do balcão") registrado com o CNPJ da própria loja. O que
 * identifica a venda é a `externalReference`, não o cliente.
 *
 * Devolve null em qualquer falha: o chamador degrada para cobrança manual.
 */
async function cobrarPixNoBalcao(
  vendaId: string,
  numero: number,
  valor: number
): Promise<{ qr: QrVenda } | null> {
  if (!asaasConfigurado()) return null;

  const config = await prisma.config.findUnique({ where: { id: 'config' } });
  const cnpj = (config?.cnpj ?? '').replace(/\D/g, '');

  // O CNPJ de exemplo que vem no seed não serve para abrir cliente no Asaas.
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    console.error('[pdv] CNPJ da loja inválido em Configurações — QR do balcão indisponível.');
    return null;
  }

  try {
    const customerId = await criarOuBuscarCliente({
      nome: 'Consumidor do balcão',
      email: config?.email ?? '',
      documento: cnpj,
      telefone: config?.whatsapp ?? '',
      cep: config?.cepOrigem ?? '',
    });

    const cobranca = await criarCobranca({
      customerId,
      valor,
      descricao: `Venda no balcão #${numero} — Glow Make`,
      formaPagamento: 'PIX',
      referenciaExterna: `${REF_VENDA_BALCAO}${vendaId}`,
    });

    const qr = await buscarQrCodePix(cobranca.id);
    if (!qr) return null;

    await prisma.vendaLoja.update({
      where: { id: vendaId },
      data: { asaasPaymentId: cobranca.id },
    });

    return { qr: { payload: qr.payload, imagemBase64: qr.imagemBase64 } };
  } catch (e) {
    console.error('[pdv] cobrança PIX do balcão falhou:', e);
    return null;
  }
}

/**
 * "A cliente já pagou?" — chamada pela tela do balcão enquanto o QR está
 * aberto, e pelo webhook quando o Asaas avisa.
 *
 * Confere o banco primeiro; só pergunta ao Asaas se ainda estiver aguardando.
 * O `updateMany` filtrando por status faz webhook e consulta chegando juntos
 * não gravarem duas vezes.
 */
export async function confirmarPagamentoVenda(
  vendaId: string
): Promise<{ pago: boolean; erro?: string }> {
  const venda = await prisma.vendaLoja.findUnique({
    where: { id: vendaId },
    select: { id: true, statusPagamento: true, asaasPaymentId: true, cancelada: true },
  });
  if (!venda) return { pago: false, erro: 'Venda não encontrada.' };
  if (venda.cancelada) return { pago: false, erro: 'Essa venda foi cancelada.' };
  if (venda.statusPagamento === 'CONFIRMADA') return { pago: true };
  if (!venda.asaasPaymentId) return { pago: false };

  const cobranca = await consultarPagamento(venda.asaasPaymentId);
  if (!cobranca?.pago) return { pago: false };

  await prisma.vendaLoja.updateMany({
    where: { id: vendaId, statusPagamento: 'AGUARDANDO_PIX' },
    data: { statusPagamento: 'CONFIRMADA' },
  });
  return { pago: true };
}

/** Marca como paga a venda de balcão referenciada por um webhook do Asaas. */
export async function confirmarVendaPorReferencia(referencia: string): Promise<boolean> {
  if (!referencia.startsWith(REF_VENDA_BALCAO)) return false;
  const id = referencia.slice(REF_VENDA_BALCAO.length);
  const r = await prisma.vendaLoja.updateMany({
    where: { id, statusPagamento: 'AGUARDANDO_PIX', cancelada: false },
    data: { statusPagamento: 'CONFIRMADA' },
  });
  return r.count > 0;
}

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
  /** PIX com QR na tela. Sem isto, PIX segue como rótulo, cobrado por fora. */
  gerarQrPix?: boolean;
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

  /* Só o PIX espera. Nas outras formas o dinheiro já está na mão quando a
     vendedora toca em finalizar, então a venda nasce confirmada — que é
     exatamente como o balcão funcionava antes desta mudança. */
  const esperaPix = params.formaPagamento === 'PIX' && params.gerarQrPix === true;

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
          statusPagamento: esperaPix ? 'AGUARDANDO_PIX' : 'CONFIRMADA',
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

    const base = { ok: true as const, numero: venda.numero, id: venda.id, total: Number(total.toString()) };
    if (!esperaPix) return base;

    /* A venda JÁ ESTÁ GRAVADA e o estoque já baixou. Se a cobrança falhar
       daqui para a frente, o balcão não pode travar: a vendedora cobra o PIX
       pela chave da loja, como fazia antes, e confirma na mão. Perder a venda
       porque o Asaas oscilou seria pior. */
    const cobranca = await cobrarPixNoBalcao(venda.id, venda.numero, Number(total.toString()));
    if (!cobranca) {
      await prisma.vendaLoja.update({
        where: { id: venda.id },
        data: { statusPagamento: 'CONFIRMADA' },
      });
      return {
        ...base,
        pix: null,
        aviso: 'Não consegui gerar o QR agora. Cobre pela chave PIX da loja — a venda já está registrada.',
      };
    }

    return { ...base, pix: cobranca.qr };
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
  /* PIX ainda esperando pagamento NÃO entra no fechamento: contar uma venda
     antes de o dinheiro cair é como o caixa deixa de bater. Se a cliente
     desistir no meio, a vendedora cancela e o estoque volta. */
  const vendas = await prisma.vendaLoja.findMany({
    where: { caixaId, cancelada: false, statusPagamento: 'CONFIRMADA' },
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
