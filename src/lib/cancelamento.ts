import 'server-only';
import { prisma } from './prisma';
import { devolverEstoque } from './estoque';
import { asaasConfigurado, cancelarAssinatura, cancelarCobranca } from './asaas';
import { cancelarComissaoDoPedido } from './afiliado';
import { ROTULO_ASSINANTE, ROTULO_PEDIDO, num } from './format';
import {
  STATUS_QUE_ACEITAM_CANCELAMENTO,
  efeitoCancelamentoAssinatura,
  linkRastreio,
  mesmoDocumento,
  situacaoCancelamento,
  type Credenciais,
  type ResultadoConsulta,
} from './acompanhamento';

/**
 * Tudo que grava quando alguem cancela: pedido (cliente pede, admin decide)
 * e assinatura (a propria assinante cancela).
 *
 * Mensagem de ErroCancelamento vai direto para a tela, entao nunca carrega
 * detalhe interno.
 */
export class ErroCancelamento extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroCancelamento';
  }
}

const NAO_ENCONTRADO = 'Nao encontramos essa compra com o e-mail e o documento informados.';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/* ============================================================
   Consulta
   ============================================================ */

/**
 * Busca pelo e-mail e confere o documento em JS: o documento e gravado com a
 * mascara que a cliente digitou, entao um `where` exato nao acharia nada.
 */
export async function buscarDaCliente({ email, documento }: Credenciais): Promise<ResultadoConsulta> {
  const [pedidos, assinantes] = await Promise.all([
    prisma.pedido.findMany({
      where: { email },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      include: { itens: true },
    }),
    prisma.assinante.findMany({ where: { email }, orderBy: { criadoEm: 'desc' }, take: 10 }),
  ]);

  return {
    pedidos: pedidos
      .filter((p) => mesmoDocumento(p.documento, documento))
      .map((p) => ({
        id: p.id,
        numero: p.numero,
        status: p.status,
        rotulo: ROTULO_PEDIDO[p.status] ?? p.status,
        criadoEm: p.criadoEm.toISOString(),
        itens: p.itens.map((i) => ({ nome: i.nome, qtd: i.qtd, preco: num(i.preco) })),
        subtotal: num(p.subtotal),
        frete: num(p.frete),
        total: num(p.total),
        freteServico: p.freteServico,
        cidade: p.cidade,
        uf: p.uf,
        transportadora: p.transportadora,
        codigoRastreio: p.codigoRastreio,
        linkRastreio: linkRastreio(p.codigoRastreio, p.transportadora),
        separadoEm: iso(p.separadoEm),
        enviadoEm: iso(p.enviadoEm),
        entregueEm: iso(p.entregueEm),
        // O link de pagamento so interessa enquanto ha o que pagar.
        invoiceUrl: p.status === 'AGUARDANDO_PAGAMENTO' ? p.invoiceUrl : null,
        cancelamento: situacaoCancelamento(p),
      })),
    assinaturas: assinantes
      .filter((a) => mesmoDocumento(a.documento, documento))
      .map((a) => ({
        id: a.id,
        status: a.status,
        rotulo: ROTULO_ASSINANTE[a.status] ?? a.status,
        valor: num(a.valor),
        criadoEm: a.criadoEm.toISOString(),
        canceladaEm: iso(a.canceladaEm),
        canceladaPor: a.canceladaPor,
        contratoVersao: a.contratoVersao,
        contratoAceitoEm: iso(a.contratoAceitoEm),
        invoiceUrl: a.status === 'AGUARDANDO_PAGAMENTO' ? a.invoiceUrl : null,
        efeito: efeitoCancelamentoAssinatura(a.status),
      })),
  };
}

/* ============================================================
   Pedido
   ============================================================ */

/** A cliente pede; nada e cancelado ate um admin aprovar. */
export async function solicitarCancelamentoPedido(
  cred: Credenciais,
  pedidoId: string,
  motivo: string
): Promise<void> {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido || pedido.email !== cred.email || !mesmoDocumento(pedido.documento, cred.documento)) {
    throw new ErroCancelamento(NAO_ENCONTRADO);
  }

  const situacao = situacaoCancelamento(pedido);
  if (situacao.tipo === 'pendente') throw new ErroCancelamento('Esse pedido ja tem um cancelamento em analise.');
  if (situacao.tipo === 'recusado') throw new ErroCancelamento('Esse cancelamento ja foi analisado. Fale com a gente pelo WhatsApp.');
  if (situacao.tipo === 'cancelado') throw new ErroCancelamento('Esse pedido ja esta cancelado.');
  if (situacao.tipo === 'ja-enviado') {
    throw new ErroCancelamento('Esse pedido ja saiu para entrega. Para devolver, fale com a gente pelo WhatsApp.');
  }

  // A condicao vai no proprio UPDATE: dois toques rapidos no botao, ou o
  // pedido sendo enviado no mesmo instante, nao passam juntos.
  const r = await prisma.pedido.updateMany({
    where: {
      id: pedido.id,
      cancelamentoSolicitadoEm: null,
      status: { in: STATUS_QUE_ACEITAM_CANCELAMENTO as never[] },
    },
    data: { cancelamentoSolicitadoEm: new Date(), cancelamentoMotivo: motivo.trim().slice(0, 500) || null },
  });
  if (r.count === 0) throw new ErroCancelamento('Esse pedido mudou agora ha pouco. Atualize a pagina.');
}

/**
 * Cancela de fato. Serve ao admin nos dois caminhos: aprovar o pedido da
 * cliente e mudar o status na mao.
 *
 * Devolve `precisaEstorno` porque o estorno NAO e automatico: o dinheiro so
 * volta quando alguem da loja faz isso no Asaas.
 */
export async function cancelarPedido(
  id: string,
  resposta?: string
): Promise<{ numero: number; precisaEstorno: boolean }> {
  const pedido = await prisma.pedido.findUnique({ where: { id }, include: { itens: true } });
  if (!pedido) throw new ErroCancelamento('Pedido nao encontrado.');
  if (pedido.status === 'CANCELADO') throw new ErroCancelamento(`O pedido #${pedido.numero} ja estava cancelado.`);

  /* A cobranca em aberto sai ANTES de mexer no banco. Se o Asaas recusar,
     quase sempre e porque ela acabou de ser paga: cancelar mesmo assim
     devolveria o estoque de um pedido pago e deixaria o dinheiro sem dono. */
  if (pedido.status === 'AGUARDANDO_PAGAMENTO' && pedido.asaasPaymentId && asaasConfigurado()) {
    try {
      await cancelarCobranca(pedido.asaasPaymentId);
    } catch (e) {
      console.error('[cancelamento] Asaas recusou apagar a cobranca:', e);
      throw new ErroCancelamento(
        `O Asaas nao deixou apagar a cobranca do pedido #${pedido.numero}. Ela pode ter sido paga agora; confira antes de cancelar.`
      );
    }
  }

  const agora = new Date();
  const havidaSolicitacao = Boolean(pedido.cancelamentoSolicitadoEm && !pedido.cancelamentoRespondidoEm);

  await prisma.$transaction(async (tx) => {
    // A marca de "estoque devolvido" e ligada no mesmo UPDATE que confere que
    // ela estava desligada. Duas aprovacoes simultaneas devolvem uma vez so.
    const marcou = await tx.pedido.updateMany({
      where: { id, estoqueDevolvido: false },
      data: { estoqueDevolvido: true },
    });
    if (marcou.count > 0) {
      await devolverEstoque(
        tx,
        pedido.itens.filter((i) => i.kitId).map((i) => ({ kitId: i.kitId!, qtd: i.qtd })),
        `Cancelamento do pedido #${pedido.numero}`
      );
    }
    await tx.pedido.update({
      where: { id },
      data: {
        status: 'CANCELADO',
        ...(havidaSolicitacao
          ? { cancelamentoRespondidoEm: agora, cancelamentoResposta: resposta?.trim() || null }
          : {}),
      },
    });
  });

  // Pedido cancelado nao gera comissao: o afiliado receberia por venda que nao existiu.
  await cancelarComissaoDoPedido(id);

  return { numero: pedido.numero, precisaEstorno: pedido.status !== 'AGUARDANDO_PAGAMENTO' };
}

/** O admin diz nao. A resposta aparece para a cliente, entao e obrigatoria. */
export async function recusarCancelamentoPedido(id: string, resposta: string): Promise<number> {
  const texto = resposta.trim().slice(0, 500);
  if (texto.length < 5) throw new ErroCancelamento('Escreva para a cliente o motivo da recusa.');

  const pedido = await prisma.pedido.findUnique({ where: { id }, select: { numero: true } });
  if (!pedido) throw new ErroCancelamento('Pedido nao encontrado.');

  const r = await prisma.pedido.updateMany({
    where: {
      id,
      cancelamentoSolicitadoEm: { not: null },
      cancelamentoRespondidoEm: null,
      status: { not: 'CANCELADO' },
    },
    data: { cancelamentoRespondidoEm: new Date(), cancelamentoResposta: texto },
  });
  if (r.count === 0) throw new ErroCancelamento(`O pedido #${pedido.numero} nao tem cancelamento pendente.`);
  return pedido.numero;
}

/* ============================================================
   Assinatura
   ============================================================ */

/**
 * A assinante cancela sozinha, como o contrato permite.
 *
 * Diferente do cancelamento pelo admin, aqui NAO se cancela localmente se o
 * Asaas recusar. O admin ve o aviso e confere o painel; a assinante sairia
 * achando que cancelou e continuaria sendo cobrada todo mes.
 */
export async function cancelarAssinaturaPelaCliente(
  cred: Credenciais,
  assinanteId: string,
  confirmou: boolean,
  ip: string | null
): Promise<void> {
  // Conferido no servidor pelo mesmo motivo do aceite: checkbox da tela se
  // remove no DevTools, e cancelamento sem confirmacao nao vale como prova.
  if (confirmou !== true) throw new ErroCancelamento('Confirme que leu a clausula de cancelamento.');

  const a = await prisma.assinante.findUnique({ where: { id: assinanteId } });
  if (!a || a.email !== cred.email || !mesmoDocumento(a.documento, cred.documento)) {
    throw new ErroCancelamento(NAO_ENCONTRADO);
  }

  const efeito = efeitoCancelamentoAssinatura(a.status);
  if (!efeito.podeCancelar) throw new ErroCancelamento('Essa assinatura ja esta cancelada.');

  if (a.asaasSubscriptionId && asaasConfigurado()) {
    try {
      await cancelarAssinatura(a.asaasSubscriptionId);
    } catch (e) {
      console.error('[cancelamento] Asaas recusou cancelar a assinatura:', e);
      throw new ErroCancelamento(
        'Nao consegui cancelar agora. Tente de novo em alguns minutos ou fale com a gente pelo WhatsApp.'
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    /* O Asaas avisa o cancelamento pelo webhook, e esse aviso pode chegar
       antes desta transacao. Por isso so fica de fora o que ja foi cancelado
       por uma PESSOA: o eco do Asaas e sobrescrito com a prova completa. */
    const r = await tx.assinante.updateMany({
      where: { id: a.id, NOT: { status: 'CANCELADA', canceladaPor: { in: ['CLIENTE', 'ADMIN'] } } },
      data: {
        status: 'CANCELADA',
        canceladaEm: new Date(),
        canceladaPor: 'CLIENTE',
        cancelamentoIp: ip,
        // A versao que vale e a que ela aceitou, nao a vigente hoje.
        cancelamentoContratoVersao: a.contratoVersao,
      },
    });
    if (r.count === 0) throw new ErroCancelamento('Essa assinatura ja esta cancelada.');

    if (efeito.devolveCaixa) {
      const box = await tx.kit.findFirst({ where: { tipo: 'BOX' } });
      if (box) await devolverEstoque(tx, [{ kitId: box.id, qtd: 1 }], `Cancelamento pela assinante ${a.nome}`);
    }
  });
}
