import { NextResponse } from 'next/server';
import { ErroCancelamento } from '@/lib/cancelamento';

/* Quando os dados nao batem, a resposta demora e diz sempre a mesma coisa.
   A rota e publica: dizer "esse e-mail existe, o CPF e que esta errado"
   ensinaria a adivinhar um de cada vez, e a espera encarece tentar em massa. */
export const ESPERA_QUANDO_NAO_BATE = 700;

export async function falha(e: unknown) {
  if (e instanceof ErroCancelamento) {
    if (e.message.startsWith('Nao encontramos')) {
      await new Promise((r) => setTimeout(r, ESPERA_QUANDO_NAO_BATE));
      return NextResponse.json({ erro: e.message }, { status: 404 });
    }
    return NextResponse.json({ erro: e.message }, { status: 409 });
  }
  console.error('[meus-pedidos]', e);
  return NextResponse.json({ erro: 'Nao consegui concluir agora. Tente de novo.' }, { status: 500 });
}

export async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const corpo = await req.json();
    return corpo && typeof corpo === 'object' ? corpo : null;
  } catch {
    return null;
  }
}

export const semCache = { headers: { 'Cache-Control': 'no-store' } };
