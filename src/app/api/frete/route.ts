import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calcularFrete } from '@/lib/frete';
import { num } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Cotação para o checkout mostrar as opções antes de a pessoa fechar. */
export async function POST(req: Request) {
  let corpo: { cep?: string; itens?: { kitId?: string; qtd?: number }[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const cep = String(corpo.cep ?? '').replace(/\D/g, '');
  if (cep.length !== 8) return NextResponse.json({ erro: 'CEP inválido.' }, { status: 400 });

  const itens = (corpo.itens ?? []).filter(
    (i): i is { kitId: string; qtd: number } =>
      typeof i.kitId === 'string' && Number.isInteger(i.qtd) && (i.qtd as number) > 0
  );

  const [config, kits] = await Promise.all([
    prisma.config.findUnique({ where: { id: 'config' } }),
    itens.length
      ? prisma.kit.findMany({ where: { id: { in: itens.map((i) => i.kitId) } } })
      : Promise.resolve([]),
  ]);

  const pesoUnitario = num(config?.pesoPadraoKit ?? 0.7);
  const totalPecas = itens.reduce((s, i) => s + i.qtd, 0) || 1;
  const valorSegurado = itens.reduce((s, i) => {
    const k = kits.find((x) => x.id === i.kitId);
    return s + (k ? num(k.preco) * i.qtd : 0);
  }, 0);

  const r = await calcularFrete({
    cepDestino: cep,
    cepOrigem: config?.cepOrigem ?? '58000-000',
    pesoKg: pesoUnitario * totalPecas,
    valorSegurado: valorSegurado || 100,
    cidadeGratis: config?.cidadeFreteGratis ?? 'João Pessoa',
    ufGratis: config?.ufFreteGratis ?? 'PB',
    caixa: {
      alturaCm: config?.caixaAlturaCm ?? 11,
      larguraCm: config?.caixaLarguraCm ?? 20,
      comprimentoCm: config?.caixaComprimentoCm ?? 25,
    },
  });

  return NextResponse.json(
    {
      destino: r.destino,
      opcoes: r.opcoes,
      aviso: r.aviso,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
