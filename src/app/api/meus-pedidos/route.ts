import { NextResponse } from 'next/server';
import { validarCredenciais } from '@/lib/acompanhamento';
import { buscarDaCliente, ErroCancelamento } from '@/lib/cancelamento';
import { falha, lerCorpo, semCache } from './responder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Cade o meu pedido?" A cliente informa o e-mail e o CPF usados na compra e
 * recebe os pedidos e as assinaturas dela.
 *
 * Nao existe login de cliente. Pedir os dois dados juntos e o que impede
 * olhar a compra de outra pessoa sabendo so um deles; o numero do pedido nao
 * serve para isso porque e sequencial.
 */
export async function POST(req: Request) {
  const corpo = await lerCorpo(req);
  const cred = validarCredenciais(corpo);
  if ('erro' in cred) return NextResponse.json({ erro: cred.erro }, { status: 400 });

  try {
    const resultado = await buscarDaCliente(cred);
    if (!resultado.pedidos.length && !resultado.assinaturas.length) {
      throw new ErroCancelamento(
        'Nao encontramos compras com esses dados. Confira o e-mail e o CPF usados na compra.'
      );
    }
    return NextResponse.json(resultado, semCache);
  } catch (e) {
    return falha(e);
  }
}
