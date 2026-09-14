import { NextResponse } from 'next/server';
import { validarCredenciais } from '@/lib/acompanhamento';
import { buscarDaCliente, solicitarCancelamentoPedido } from '@/lib/cancelamento';
import { falha, lerCorpo, semCache } from '../responder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A cliente PEDE o cancelamento. Nada e cancelado aqui: o pedido fica
 * marcado e aparece para o admin aprovar ou recusar em /admin/pedidos.
 *
 * E-mail e documento vao de novo em toda chamada. Nao ha sessao de cliente,
 * entao o id do pedido sozinho nao prova que quem chama e a dona dele.
 */
export async function POST(req: Request) {
  const corpo = await lerCorpo(req);
  const cred = validarCredenciais(corpo);
  if ('erro' in cred) return NextResponse.json({ erro: cred.erro }, { status: 400 });

  const pedidoId = typeof corpo?.pedidoId === 'string' ? corpo.pedidoId : '';
  const motivo = typeof corpo?.motivo === 'string' ? corpo.motivo : '';
  if (!pedidoId) return NextResponse.json({ erro: 'Pedido nao informado.' }, { status: 400 });

  try {
    await solicitarCancelamentoPedido(cred, pedidoId, motivo);
    return NextResponse.json(await buscarDaCliente(cred), semCache);
  } catch (e) {
    return falha(e);
  }
}
