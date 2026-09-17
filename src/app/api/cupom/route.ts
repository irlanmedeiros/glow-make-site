import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { CUPOM_INEXISTENTE, consultarCupom } from '@/lib/cupom';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Previa do cupom no checkout: diz se o codigo vale e quanto desconta nos
 * produtos do carrinho. So informativo. O desconto que conta e recalculado em
 * /api/checkout, que tambem confere se e a primeira compra da cliente.
 *
 * Codigo inexistente demora para responder: a rota e publica, e sem isso daria
 * para testar codigos em massa ate achar um valido.
 */
export async function POST(req: Request) {
  let corpo: { codigo?: unknown; itens?: { kitId?: unknown; qtd?: unknown }[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const itens = (Array.isArray(corpo.itens) ? corpo.itens : [])
    .filter((i): i is { kitId: string; qtd: number } =>
      typeof i?.kitId === 'string' && Number.isInteger(i?.qtd) && (i.qtd as number) > 0
    )
    .slice(0, 20);
  if (!itens.length) return NextResponse.json({ erro: 'Seu carrinho está vazio.' }, { status: 400 });

  // Preco do banco, como no checkout.
  const kits = await prisma.kit.findMany({
    where: { id: { in: itens.map((i) => i.kitId) }, ativo: true, tipo: 'KIT' },
    select: { id: true, preco: true },
  });
  const subtotal = itens.reduce((s, i) => {
    const k = kits.find((x) => x.id === i.kitId);
    return k ? s.add(k.preco.mul(i.qtd)) : s;
  }, new Prisma.Decimal(0));

  const r = await consultarCupom(corpo.codigo, subtotal);
  if ('erro' in r) {
    if (r.erro === CUPOM_INEXISTENTE) {
      await new Promise((ok) => setTimeout(ok, 700));
      return NextResponse.json({ erro: r.erro }, { status: 404 });
    }
    return NextResponse.json({ erro: r.erro }, { status: 409 });
  }

  return NextResponse.json(
    {
      codigo: r.codigo,
      desconto: Number(r.desconto.toString()),
      descricao: r.descricao,
      primeiraCompra: r.primeiraCompra,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
