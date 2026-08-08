import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Programa de afiliados.
 *
 * Cada influenciador tem um código que vira glowmake.com.br/?ref=CODIGO.
 * O código é gravado num cookie de 30 dias; quem chegou pelo link e comprou
 * duas semanas depois ainda conta para ele.
 *
 * Duas decisões que estão no código de propósito:
 *
 * 1. A comissão incide sobre o valor dos PRODUTOS, nunca sobre o frete.
 *    Frete é dinheiro que passa pela loja a caminho da transportadora — pagar
 *    percentual sobre ele seria pagar comissão sobre despesa.
 *
 * 2. Cada comissão tem uma `referencia` única. Sem isso, um webhook reenviado
 *    pelo Asaas geraria a mesma comissão duas vezes, e o erro só apareceria
 *    na hora de pagar.
 */

export const COOKIE_AFILIADO = 'glowmake_ref';
export const DIAS_ATRIBUICAO = 30;

/** Confere se o código existe e está ativo. */
export async function afiliadoPorCodigo(codigo: string | undefined | null) {
  if (!codigo) return null;
  const limpo = codigo.trim().toUpperCase().slice(0, 40);
  if (!limpo) return null;
  return prisma.afiliado.findFirst({ where: { codigo: limpo, ativo: true } });
}

type Base = { valorProdutos: Prisma.Decimal; afiliadoId: string };

/** Comissão de uma compra avulsa. Uma por pedido. */
export async function gerarComissaoPedido(pedido: {
  id: string;
  numero: number;
  afiliadoId: string | null;
  subtotal: Prisma.Decimal;
}) {
  if (!pedido.afiliadoId) return null;
  return criar({
    afiliadoId: pedido.afiliadoId,
    valorProdutos: pedido.subtotal,
    origem: `Pedido #${pedido.numero}`,
    referencia: `pedido:${pedido.id}`,
    pedidoId: pedido.id,
  });
}

/**
 * Comissão de um mês da assinatura.
 *
 * A referência inclui o mês, então cada cobrança mensal gera uma comissão e
 * só uma. Se o afiliado estiver marcado como não recorrente, só o primeiro
 * mês é pago.
 */
export async function gerarComissaoAssinatura(
  assinante: { id: string; nome: string; afiliadoId: string | null; valor: Prisma.Decimal },
  competencia = new Date()
) {
  if (!assinante.afiliadoId) return null;

  const afiliado = await prisma.afiliado.findUnique({ where: { id: assinante.afiliadoId } });
  if (!afiliado || !afiliado.ativo) return null;

  const mes = `${competencia.getFullYear()}-${String(competencia.getMonth() + 1).padStart(2, '0')}`;

  if (!afiliado.recorrente) {
    const jaTeve = await prisma.comissao.findFirst({
      where: { assinanteId: assinante.id },
    });
    if (jaTeve) return null;
  }

  return criar({
    afiliadoId: assinante.afiliadoId,
    valorProdutos: assinante.valor,
    origem: `Assinatura de ${assinante.nome} — ${mes}`,
    referencia: `assinatura:${assinante.id}:${mes}`,
    assinanteId: assinante.id,
  });
}

async function criar(
  p: Base & { origem: string; referencia: string; pedidoId?: string; assinanteId?: string }
) {
  const afiliado = await prisma.afiliado.findUnique({ where: { id: p.afiliadoId } });
  if (!afiliado) return null;

  const percentual = afiliado.percentual;
  const valor = p.valorProdutos.mul(percentual).div(100).toDecimalPlaces(2);

  try {
    return await prisma.comissao.create({
      data: {
        afiliadoId: p.afiliadoId,
        origem: p.origem,
        pedidoId: p.pedidoId,
        assinanteId: p.assinanteId,
        valorBase: p.valorProdutos,
        percentual,
        valor,
        referencia: p.referencia,
      },
    });
  } catch (e) {
    // P2002 = referência repetida. Acontece quando o Asaas reenvia o mesmo
    // webhook; ignorar é exatamente o comportamento certo.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
    throw e;
  }
}

/** Cancela a comissão quando o pedido é cancelado ou estornado. */
export async function cancelarComissaoDoPedido(pedidoId: string) {
  await prisma.comissao.updateMany({
    where: { pedidoId, status: { in: ['PENDENTE', 'APROVADA'] } },
    data: { status: 'CANCELADA' },
  });
}

/** Aprova a comissão quando o pagamento entra de fato. */
export async function aprovarComissaoDoPedido(pedidoId: string) {
  await prisma.comissao.updateMany({
    where: { pedidoId, status: 'PENDENTE' },
    data: { status: 'APROVADA' },
  });
}

export function gerarCodigo(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  return base || 'AFILIADO';
}
