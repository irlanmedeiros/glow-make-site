import { NextResponse } from 'next/server';
import { validarCredenciais } from '@/lib/acompanhamento';
import { buscarDaCliente, cancelarAssinaturaPelaCliente } from '@/lib/cancelamento';
import { falha, lerCorpo, semCache } from '../responder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A assinante cancela sozinha, conforme a clausula de cancelamento do
 * contrato. Guarda data, IP e versao do contrato, como no aceite.
 */
export async function POST(req: Request) {
  const corpo = await lerCorpo(req);
  const cred = validarCredenciais(corpo);
  if ('erro' in cred) return NextResponse.json({ erro: cred.erro }, { status: 400 });

  const assinanteId = typeof corpo?.assinanteId === 'string' ? corpo.assinanteId : '';
  if (!assinanteId) return NextResponse.json({ erro: 'Assinatura nao informada.' }, { status: 400 });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? null;

  try {
    await cancelarAssinaturaPelaCliente(cred, assinanteId, corpo?.confirmou === true, ip);
    return NextResponse.json(await buscarDaCliente(cred), semCache);
  } catch (e) {
    return falha(e);
  }
}
