import { NextResponse } from 'next/server';
import { registrarLead, type ItemLead } from '@/lib/lead';

export const runtime = 'nodejs';

/**
 * Guarda quem começou a comprar e ainda não terminou.
 *
 * É chamada quando a pessoa digita um e-mail válido no checkout. Se a compra
 * sair, o registro é marcado como convertido e some da lista de remarketing.
 */
export async function POST(req: Request) {
  let corpo: {
    email?: string;
    nome?: string;
    telefone?: string;
    cep?: string;
    itens?: ItemLead[];
    valorEstimado?: number;
    queriaAssinar?: boolean;
    consentiuContato?: boolean;
    ref?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!corpo.email) return NextResponse.json({ ok: false }, { status: 400 });

  await registrarLead({
    email: corpo.email,
    nome: corpo.nome,
    telefone: corpo.telefone,
    cep: corpo.cep,
    itens: Array.isArray(corpo.itens) ? corpo.itens.slice(0, 20) : [],
    valorEstimado: Number(corpo.valorEstimado) || 0,
    queriaAssinar: Boolean(corpo.queriaAssinar),
    consentiuContato: Boolean(corpo.consentiuContato),
    afiliadoCodigo: corpo.ref ?? null,
  });

  // Resposta sempre igual: essa rota é pública, e devolver "esse e-mail já
  // está na base" seria entregar a lista de clientes para quem perguntasse.
  return NextResponse.json({ ok: true });
}
