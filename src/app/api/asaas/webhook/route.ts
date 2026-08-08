import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { aprovarComissaoDoPedido, gerarComissaoAssinatura } from '@/lib/afiliado';

export const runtime = 'nodejs';

/**
 * Webhook do Asaas: é o Asaas que avisa quando um pagamento foi confirmado,
 * atrasou ou a assinatura foi cancelada.
 *
 * Esta rota é pública na internet, então precisa provar que quem chamou é
 * mesmo o Asaas. A prova é o token que você cadastra no painel do Asaas e
 * repete aqui em ASAAS_WEBHOOK_TOKEN. Sem essa checagem, qualquer pessoa
 * poderia marcar pedidos como pagos.
 */

type Evento = {
  event?: string;
  payment?: { id?: string; externalReference?: string; subscription?: string };
};

export async function POST(req: Request) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado) {
    console.error('[webhook] ASAAS_WEBHOOK_TOKEN não configurado — recusando.');
    return NextResponse.json({ erro: 'Webhook não configurado.' }, { status: 503 });
  }
  if (req.headers.get('asaas-access-token') !== esperado) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  let evento: Evento;
  try {
    evento = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }

  const tipo = evento.event ?? '';
  const pagamento = evento.payment;
  if (!pagamento) return NextResponse.json({ ok: true });

  try {
    // --- assinatura ---
    if (pagamento.subscription) {
      const assinante = await prisma.assinante.findFirst({
        where: { asaasSubscriptionId: pagamento.subscription },
      });
      if (assinante) {
        const status =
          tipo === 'PAYMENT_CONFIRMED' || tipo === 'PAYMENT_RECEIVED'
            ? 'ATIVA'
            : tipo === 'PAYMENT_OVERDUE'
              ? 'ATRASADA'
              : tipo === 'PAYMENT_DELETED'
                ? 'CANCELADA'
                : null;
        if (status) {
          await prisma.assinante.update({
            where: { id: assinante.id },
            data: { status, ...(status === 'CANCELADA' ? { canceladaEm: new Date() } : {}) },
          });

          /* Cada mensalidade confirmada gera a comissão daquele mês. A
             referência inclui o mês, então uma reentrega do webhook não
             duplica o valor a pagar. */
          if (status === 'ATIVA') await gerarComissaoAssinatura(assinante);
        }
      }
      return NextResponse.json({ ok: true });
    }

    // --- pedido avulso ---
    const pedidoId = pagamento.externalReference;
    if (pedidoId) {
      const status =
        tipo === 'PAYMENT_CONFIRMED' || tipo === 'PAYMENT_RECEIVED' ? 'PAGO' : null;
      if (status) {
        await prisma.pedido.updateMany({
          where: { id: pedidoId, status: 'AGUARDANDO_PAGAMENTO' },
          data: { status },
        });
        // Dinheiro entrou: a comissão sai de PENDENTE e vira devida.
        await aprovarComissaoDoPedido(pedidoId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[webhook]', e);
    // Devolver 500 faz o Asaas tentar de novo mais tarde, que é o que queremos.
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 });
  }
}
