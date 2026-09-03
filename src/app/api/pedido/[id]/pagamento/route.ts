import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { consultarPagamento } from '@/lib/asaas';
import { aprovarComissaoDoPedido } from '@/lib/afiliado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "O PIX já caiu?" — consultada pela tela de pagamento enquanto o QR está
 * aberto.
 *
 * Confere o banco primeiro: se o webhook do Asaas já avisou, a resposta sai
 * sem gastar chamada de API. Só quando o pedido ainda está aguardando é que
 * pergunta ao Asaas — e, se o dinheiro entrou, grava aqui mesmo.
 *
 * Esse segundo caminho é o que faz a loja funcionar ANTES de o webhook estar
 * cadastrado no painel do Asaas: sem ele, o cliente pagaria e a tela ficaria
 * girando para sempre. O webhook continua sendo o certo, porque também pega o
 * pagamento que cai depois de a pessoa fechar o navegador.
 *
 * Devolve só "pago ou não". O id do pedido é um cuid que só quem comprou tem,
 * mas ainda assim não é motivo para expor valor, itens ou dados do cliente.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ erro: 'Pedido não informado.' }, { status: 400 });

  const pedido = await prisma.pedido.findUnique({
    where: { id },
    select: { id: true, status: true, asaasPaymentId: true },
  });
  if (!pedido) return NextResponse.json({ erro: 'Pedido não encontrado.' }, { status: 404 });

  if (pedido.status !== 'AGUARDANDO_PAGAMENTO') {
    return NextResponse.json(
      { pago: pedido.status !== 'CANCELADO', status: pedido.status },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!pedido.asaasPaymentId) {
    return NextResponse.json({ pago: false, status: pedido.status }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const cobranca = await consultarPagamento(pedido.asaasPaymentId);

  if (cobranca?.pago) {
    // updateMany com o status na condição: se o webhook chegar ao mesmo tempo,
    // um dos dois não afeta linha nenhuma em vez de os dois gravarem.
    const r = await prisma.pedido.updateMany({
      where: { id: pedido.id, status: 'AGUARDANDO_PAGAMENTO' },
      data: { status: 'PAGO' },
    });
    if (r.count > 0) await aprovarComissaoDoPedido(pedido.id);
    return NextResponse.json({ pago: true, status: 'PAGO' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json(
    { pago: false, status: pedido.status },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
